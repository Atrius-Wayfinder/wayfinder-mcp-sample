import { createRequire } from "module";
import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join } from "path";

const require = createRequire(import.meta.url);
const JSZip = require("jszip");

const zip = new JSZip();
const distDir = "dist";

for (const file of readdirSync(distDir)) {
  zip.file(file, readFileSync(join(distDir, file)));
}

zip.generateAsync({ type: "nodebuffer" }).then((buf) => {
  writeFileSync("function.zip", buf);
  console.log("Zip created: " + buf.length + " bytes");
});
