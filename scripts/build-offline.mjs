import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const output = path.resolve(process.argv[2] || path.join(root, "dist", "Orbit-Escape.html"));
const three = path.join(root, "node_modules", "three");
const types = { jpg:"image/jpeg", jpeg:"image/jpeg", png:"image/png", webp:"image/webp", svg:"image/svg+xml", woff2:"font/woff2", ttf:"font/ttf", mp3:"audio/mpeg", ogg:"audio/ogg", webm:"video/webm" };
const scriptMedia = new Map();
const media = new Map();
const scripts = [];
const entryTag = /<script\b[^>]*\bsrc=["']([^"']+\.m?js)["'][^>]*>\s*<\/script>/i;
const license = (await readFile(path.join(three, "LICENSE"), "utf8")).replaceAll("*/", "* /");

function localPath(source, url) {
  if (!url || url.includes(":")) throw new Error("Expected a local asset: " + url);
  const resolved = path.resolve(path.dirname(source), decodeURIComponent(url));
  if (!resolved.startsWith(root + path.sep)) throw new Error("Asset outside project: " + resolved);
  return resolved;
}

async function dataUri(file) {
  if (media.has(file)) return media.get(file);
  const type = types[path.extname(file).slice(1).toLowerCase()];
  if (!type) throw new Error("Unknown media type: " + file);
  const uri = "data:" + type + ";base64," + (await readFile(file)).toString("base64");
  media.set(file, uri);
  return uri;
}

async function replaceMatches(input, pattern, transform) {
  const parts = [];
  let at = 0;
  for (const match of input.matchAll(pattern)) {
    parts.push(input.slice(at, match.index), await transform(match));
    at = match.index + match[0].length;
  }
  parts.push(input.slice(at));
  return parts.join("");
}

async function compile(entry) {
  const result = await build({
    entryPoints:[entry], bundle:true, format:"iife", target:"chrome60",
    charset:"utf8", minify:true, legalComments:"inline", write:false,
    plugins:[{name:"embedded-assets", setup(builder) {
      builder.onResolve({filter:/(?:^three$|three\.module(?:\.min)?\.js$)/}, () => ({
        path:path.join(three, "build", "three.module.js"),
      }));
      builder.onLoad({filter:/\.m?js$/}, async ({path:file}) => {
        if (!file.startsWith(root + path.sep) || file.includes(path.sep + "node_modules" + path.sep)) return;
        const literal = /(["'])((?:(?:\.\.?\/)+)?assets\/[\w/%.+-]+\.(?:jpe?g|png|webp|svg|woff2|ttf|mp3|ogg|webm))\1/g;
        const source = await readFile(file, "utf8");
        const contents = await replaceMatches(source, literal, async ([, , url]) => {
          const absolute = localPath(file, url);
          const key = path.relative(root, absolute).split(path.sep).join("/");
          scriptMedia.set(key, await dataUri(absolute));
          return "__ORBIT_OFFLINE_ASSETS[" + JSON.stringify(key) + "]";
        });
        return {contents, loader:"js"};
      });
    }}],
  });
  return result.outputFiles[0].text;
}

async function preparePage(index) {
  let html = await readFile(index, "utf8");
  const entry = html.match(entryTag);
  if (!entry) throw new Error("Missing game entry in " + index);
  const code = await compile(localPath(index, entry[1]));
  const cssImages = new Map();
  html = await replaceMatches(html, /<link\b[^>]*\brel=["']stylesheet["'][^>]*>/gi, async ([tag]) => {
    const sheet = localPath(index, tag.match(/\bhref=["']([^"']+)["']/i)?.[1]);
    const css = await replaceMatches(await readFile(sheet, "utf8"), /url\(\s*(["']?)([^'"()]+)\1\s*\)/gi, async ([full, , value]) => {
      const url = value.trim();
      if (url.startsWith("data:") || url.startsWith("#")) return full;
      const uri = await dataUri(localPath(sheet, url));
      if (!uri.startsWith("data:image/")) return 'url("' + uri + '")';
      if (!cssImages.has(uri)) cssImages.set(uri, "--orbit-inline-" + cssImages.size);
      return "var(" + cssImages.get(uri) + ")";
    });
    return "<style>" + css.replace(/<\/style/gi, "<\\/style") + "</style>";
  });
  html = await replaceMatches(html, /<(?:img|link)\b[^>]+\b(?:src|href)=["']((?:(?:\.\.?\/)+)?(?:assets|icon)\/[^"']+)["'][^>]*>/gi, async ([tag, url]) => tag.replace(url, await dataUri(localPath(index, url))));
  if (cssImages.size) {
    const definitions = [...cssImages].map(([uri, key]) => key + ':url("' + uri + '")').join(";");
    html = html.replace("</head>", () => "<style>:root{" + definitions + "}</style></head>");
  }
  return {html, code};
}

function withScript(page, setup) {
  const code = ("\n/* three.js, MIT license\n" + license + "*/\n;(() => {\n" + setup + "\n" + page.code + "\n})();\n").replace(/<\/script/gi, "<\\/script");
  scripts.push("'sha256-" + createHash("sha256").update(code).digest("base64") + "'");
  return page.html.replace(entryTag, () => "<script>" + code + "</script>");
}

const main = await preparePage(path.join(root, "index.html"));
const career = await preparePage(path.join(root, "courier", "index.html"));
// srcdoc has the embedding document's origin. Both games can reuse identical
// planetary maps without duplicating each image in the distributable.
const careerHtml = withScript(career, "const __ORBIT_OFFLINE_ASSETS = parent.__orbitPortableAssets;");
const escapedCareer = careerHtml.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
main.html = main.html.replace(entryTag, tag => '<template id="portableCourier">' + escapedCareer + "</template>" + tag);
const table = Object.fromEntries([...scriptMedia].sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0));
let html = withScript(main, "const __ORBIT_OFFLINE_ASSETS = window.__orbitPortableAssets = " + JSON.stringify(table) + ";");
// The standalone document allows its two compiled scripts and embedded media.
html = html.replace(/<meta\b[^>]*\bhttp-equiv=["']Content-Security-Policy["'][^>]*>/ig, "");
const policy = "default-src 'none'; script-src " + scripts.join(" ") + "; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:; frame-src 'self' about:; connect-src 'none'; base-uri 'none'";
html = html.replace("</head>", () => '<meta http-equiv="Content-Security-Policy" content="' + policy + '"></head>');
await mkdir(path.dirname(output), {recursive:true});
await writeFile(output, html);
console.log("Offline game: " + output + " (" + Buffer.byteLength(html) + " bytes, " + media.size + " embedded assets)");
