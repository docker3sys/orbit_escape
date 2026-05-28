import { cp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const www = join(root, "www");
const vendor = join(www, "vendor");
const rootVendor = join(root, "vendor");

await rm(www, { recursive: true, force: true });
await mkdir(vendor, { recursive: true });
await mkdir(rootVendor, { recursive: true });

await Promise.all([
  cp(join(root, "index.html"), join(www, "index.html")),
  cp(join(root, "styles.css"), join(www, "styles.css")),
  cp(join(root, "app.js"), join(www, "app.js")),
  cp(join(root, "assets"), join(www, "assets"), { recursive: true }),
  cp(join(root, "node_modules", "three", "build", "three.module.js"), join(vendor, "three.module.js")),
  cp(join(root, "node_modules", "three", "build", "three.module.js"), join(rootVendor, "three.module.js")),
]);

console.log("Built Android web assets in www/");
