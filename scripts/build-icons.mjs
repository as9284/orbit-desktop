import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import sharp from "sharp";
import toIco from "to-ico";

const source = resolve("assets/icon.svg");
const target = resolve("assets/icon.ico");
const sizes = [16, 24, 32, 48, 64, 128, 256];

const input = await readFile(source);

// Rasterise each frame straight from the vector at its final size. Scaling one
// large bitmap down instead leaves the 16 and 24px frames muddy, and those are
// the ones Windows actually shows in the taskbar and Alt-Tab.
const frames = await Promise.all(
  sizes.map((size) =>
    sharp(input, { density: 600 })
      .resize(size, size, { fit: "contain" })
      .png()
      .toBuffer(),
  ),
);

await mkdir(dirname(target), { recursive: true });
await writeFile(target, await toIco(frames));
console.log(`Built ${target}`);
