// Generates flat-colour placeholder PNG icons into public/ (zero deps).
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

const BG = [0x1f, 0x3a, 0x5f];
const FG = [0xf2, 0xc9, 0x4c];
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
// Opaque RGB PNG: background with a centred square of `inner` fraction of the size.
function png(size, inner) {
  const lo = Math.floor((size * (1 - inner)) / 2);
  const hi = size - lo;
  const row = size * 3 + 1;
  const raw = Buffer.alloc(row * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const c = x >= lo && x < hi && y >= lo && y < hi ? FG : BG;
      raw.set(c, y * row + 1 + x * 3);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
mkdirSync("public", { recursive: true });
writeFileSync("public/icon-192.png", png(192, 0.5));
writeFileSync("public/icon-512.png", png(512, 0.5));
writeFileSync("public/icon-maskable-512.png", png(512, 0.4)); // inside the 80% safe zone
writeFileSync("public/apple-touch-icon.png", png(180, 0.5));
