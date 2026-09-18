import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import sharp from "sharp";
import toIco from "to-ico";

const source = resolve("src/renderer/public/icons/icon-512.png");
const target = resolve("assets/icon.ico");
const sizes = [16, 24, 32, 48, 64, 128, 256];

const input = await readFile(source);
const frames = await Promise.all(
  sizes.map((size) =>
    sharp(input)
      .resize(size, size, { fit: "contain" })
      .png()
      .toBuffer(),
  ),
);

await mkdir(dirname(target), { recursive: true });
await writeFile(target, await toIco(frames));
console.log(`Built ${target}`);
