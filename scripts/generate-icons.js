const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const src = path.join(__dirname, '..', 'frontend', 'icon-1024.png');
const resDir = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');

const sizes = {
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192
};

async function generate() {
  for (const [folder, size] of Object.entries(sizes)) {
    const dir = path.join(resDir, folder);

    await sharp(src).resize(size, size).png().toFile(path.join(dir, 'ic_launcher.png'));

    const roundSvg = `<svg width="${size}" height="${size}"><circle cx="${size/2}" cy="${size/2}" r="${size/2}"/></svg>`;
    const buf = await sharp(src).resize(size, size).png().toBuffer();
    await sharp(buf).composite([{ input: Buffer.from(roundSvg), blend: 'dest-in' }]).png().toFile(path.join(dir, 'ic_launcher_round.png'));

    const fgSize = Math.round(size * 1.5);
    const pad = Math.round(size * 0.25);
    await sharp(src).resize(size, size).extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 12, g: 12, b: 20, alpha: 1 } }).resize(fgSize, fgSize).png().toFile(path.join(dir, 'ic_launcher_foreground.png'));

    console.log(folder + ': OK (' + size + 'px)');
  }

  const adaptiveDir = path.join(resDir, 'mipmap-anydpi-v26');
  const xml = '<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n  <background android:drawable="@color/ic_launcher_background"/>\n  <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n</adaptive-icon>';
  fs.writeFileSync(path.join(adaptiveDir, 'ic_launcher.xml'), xml);
  fs.writeFileSync(path.join(adaptiveDir, 'ic_launcher_round.xml'), xml);
  console.log('adaptive icons: OK');
}

generate().catch(e => console.error(e));
