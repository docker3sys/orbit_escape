import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const www = join(root, "www");
const vendor = join(www, "vendor");
const rootVendor = join(root, "vendor");

await rm(www, { recursive: true, force: true });
await mkdir(vendor, { recursive: true });
await mkdir(rootVendor, { recursive: true });

await Promise.all([
  ...(await readdir(root)).filter((file) => /\.(?:html|css|js)$/.test(file))
    .map((file) => cp(join(root, file), join(www, file))),
  cp(join(root, "assets"), join(www, "assets"), { recursive: true }),
  cp(join(root, "node_modules", "three", "build", "three.module.js"), join(vendor, "three.module.js")),
  cp(join(root, "node_modules", "three", "build", "three.module.js"), join(rootVendor, "three.module.js")),
]);

console.log("Built Android web assets in www/");
