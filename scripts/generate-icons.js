/**
 * Generador de iconos PNG para PWA
 * Usa solo módulos nativos de Node.js (fs + zlib)
 * No requiere dependencias externas.
 *
 * Uso: node scripts/generate-icons.js
 */

const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

// ── Funciones para crear PNG desde cero ──────────────────────

function createPNG(width, height, pixels) {
  // pixels: array de [R, G, B, A] en orden de filas (de arriba a abajo)
  
  function crc32(data) {
    let crc = 0xFFFFFFFF;
    const table = new Int32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[i] = c;
    }
    for (let i = 0; i < data.length; i++) {
      crc = table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const typeB = Buffer.from(type, 'ascii');
    const crcData = Buffer.concat([typeB, data]);
    const crcVal = crc32(crcData);
    const crcB = Buffer.alloc(4);
    crcB.writeUInt32BE(crcVal);
    return Buffer.concat([len, typeB, data, crcB]);
  }

  // Signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // IDAT - raw image data with filter bytes
  const rawData = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const offset = y * (1 + width * 4);
    rawData[offset] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const px = (y * width + x) * 4;
      const outOffset = offset + 1 + x * 4;
      rawData[outOffset] = pixels[px];
      rawData[outOffset + 1] = pixels[px + 1];
      rawData[outOffset + 2] = pixels[px + 2];
      rawData[outOffset + 3] = pixels[px + 3];
    }
  }

  const compressed = zlib.deflateSync(rawData);
  
  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0))
  ]);
}

function createGradientCirclePNG(size, color1, color2) {
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.42;
  const pixels = [];
  
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      // Calculate gradient based on distance from center
      const t = Math.min(1, dist / radius);
      
      let r = Math.round(color1[0] * (1 - t) + color2[0] * t);
      let g = Math.round(color1[1] * (1 - t) + color2[1] * t);
      let b = Math.round(color1[2] * (1 - t) + color2[2] * t);
      
      if (dist <= radius) {
        // Inside circle - full color
        pixels.push(r, g, b, 255);
      } else if (dist <= radius + 2) {
        // Anti-aliased edge
        const alpha = Math.max(0, 1 - (dist - radius) / 2);
        pixels.push(r, g, b, Math.round(alpha * 255));
      } else {
        // Outside - transparent
        pixels.push(0, 0, 0, 0);
      }
    }
  }
  
  return createPNG(size, size, pixels);
}

// ── Colores del tema dorado oscuro ─────────────────────────
const GOLD1 = [212, 175, 55];
const GOLD2 = [166, 124, 0];

const ICONS_DIR = path.join(__dirname, '..', ''); // frontend (project root serves frontend)

console.log('🎨 Generando iconos PWA...');

const sizes = [
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'icon-1024.png', size: 1024 },
  { name: 'apple-touch-icon.png', size: 180 }
];

for (const { name, size } of sizes) {
  const png = createGradientCirclePNG(size, GOLD1, GOLD2);
  const filePath = path.join(ICONS_DIR, name);
  fs.writeFileSync(filePath, png);
  console.log(`✅ ${name} (${size}x${size}) — ${png.length} bytes`);
}

console.log('🎉 Todos los iconos generados correctamente.');
