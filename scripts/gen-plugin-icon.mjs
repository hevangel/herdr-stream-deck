// Generates herdr.sdPlugin/plugin-icon.png (256x256) and plugin-icon@2x.png (512x512).
// Pure Node - no image dependencies. Run: npm run icons
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function crc32(buf) {
    let c;
    const table = [];
    for (let n = 0; n < 256; n++) {
        c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c >>> 0;
    }
    let crc = 0xffffffff;
    for (const byte of buf) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
}

function encodePng(w, h, rgba) {
    const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0);
    ihdr.writeUInt32BE(h, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 6; // color type RGBA
    const raw = Buffer.alloc((w * 4 + 1) * h);
    for (let y = 0; y < h; y++) {
        raw[y * (w * 4 + 1)] = 0; // filter: none
        rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
    }
    return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

const BG = [16, 20, 24, 255];
const RING = [126, 226, 168, 255]; // herdr green
const DOT = [237, 240, 243, 255];

function drawIcon(size) {
    const rgba = Buffer.alloc(size * size * 4);
    const cx = size / 2;
    const cy = size / 2;
    const ringR = size * 0.3;
    const ringW = size * 0.055;
    const dotR = size * 0.09;
    const dotCx = cx + ringR * 0.95;
    const dotCy = cy - ringR * 0.95;
    const corner = size * 0.18; // rounded-rect corner radius

    const inRoundedRect = (x, y) => {
        const dx = Math.max(corner - x, x - (size - corner), 0);
        const dy = Math.max(corner - y, y - (size - corner), 0);
        return dx * dx + dy * dy <= corner * corner;
    };
    const inRing = (x, y) => {
        const d = Math.hypot(x - cx, y - cy);
        return d >= ringR - ringW && d <= ringR + ringW;
    };
    const inDot = (x, y) => Math.hypot(x - dotCx, y - dotCy) <= dotR;

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            if (!inRoundedRect(x, y)) continue;
            const i = (y * size + x) * 4;
            const c = inRing(x, y) ? RING : inDot(x, y) ? DOT : BG;
            rgba[i] = c[0];
            rgba[i + 1] = c[1];
            rgba[i + 2] = c[2];
            rgba[i + 3] = 255;
        }
    }
    return encodePng(size, size, rgba);
}

mkdirSync(join(root, "dev.hevangel.herdr.sdPlugin"), { recursive: true });
writeFileSync(join(root, "dev.hevangel.herdr.sdPlugin", "plugin-icon.png"), drawIcon(256));
writeFileSync(join(root, "dev.hevangel.herdr.sdPlugin", "plugin-icon@2x.png"), drawIcon(512));
console.log("plugin icons written");
