import { build } from "esbuild";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.join(root, "www");
await rm(output, {recursive:true, force:true});
await mkdir(path.join(output, "courier"), {recursive:true});
const three = path.join(root, "node_modules/three/build/three.module.js");
await mkdir(path.join(root, "vendor"), {recursive:true});
await cp(three, path.join(root, "vendor/three.module.js"));

async function buildPage(folder, entry) {
  const source = path.join(root, folder);
  const destination = path.join(output, folder);
  const html = await readFile(path.join(source, "index.html"), "utf8");
  const script = /<script\b[^>]*\bsrc=["'][^"']+["'][^>]*>\s*<\/script>/i;
  if (!script.test(html)) throw new Error("Missing game entry in " + source);
  await build({
    entryPoints:[path.join(source, entry)], outfile:path.join(destination, "game.js"),
    target:"chrome60", bundle:true, format:"iife", charset:"utf8", minify:true, legalComments:"eof",
    plugins:[{name:"installed-three", setup(builder) {
      builder.onResolve({filter:/three\.module(?:\.min)?\.js$/}, () => ({path:three}));
    }}],
  });
  const policy = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'self'";
  const page = html.replace("<head>", "<head>\n    <meta http-equiv=\"Content-Security-Policy\" content=\"" + policy + "\" />")
    .replace(script, '<script defer src="./game.js"></script>');
  await writeFile(path.join(destination, "index.html"), page);
  for (const file of await readdir(source)) {
    if (file.endsWith(".css")) await cp(path.join(source, file), path.join(destination, file));
  }
}

await Promise.all([
  buildPage("", "launch.js"), buildPage("courier", "bootstrap.mjs"),
  cp(path.join(root, "assets"), path.join(output, "assets"), {recursive:true}),
  cp(path.join(root, "courier/assets"), path.join(output, "courier/assets"), {recursive:true}),
  cp(path.join(root, "unsupported.html"), path.join(output, "unsupported.html")),
]);
await cp(path.join(root,"node_modules/three/LICENSE"), path.join(output,"assets/LICENSE-three.txt"));
console.log("Built both offline Android game entries in www/.");
