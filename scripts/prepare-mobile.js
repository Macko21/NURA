"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const frontend = path.join(root, "frontend");
const output = path.join(root, "mobile-dist");

fs.rmSync(output, { recursive: true, force: true });
fs.cpSync(frontend, output, { recursive: true });

const vendor = path.join(output, "vendor");
fs.mkdirSync(vendor, { recursive: true });
fs.copyFileSync(path.join(root, "node_modules/three/build/three.module.min.js"), path.join(vendor, "three.module.js"));
fs.copyFileSync(path.join(root, "node_modules/three/build/three.core.min.js"), path.join(vendor, "three.core.min.js"));
const roundedSource = fs.readFileSync(path.join(root, "node_modules/three/examples/jsm/geometries/RoundedBoxGeometry.js"), "utf8")
  .replace("from 'three';", "from '/vendor/three.module.js';");
fs.writeFileSync(path.join(vendor, "RoundedBoxGeometry.js"), roundedSource);

fs.copyFileSync(path.join(root, "mobile/native-entry.js"), path.join(output, "native-runtime.js"));

const indexPath = path.join(output, "index.html");
let index = fs.readFileSync(indexPath, "utf8");
const marker = /<script>\r?\n\/\/ Cache-busting/;
if (!marker.test(index)) throw new Error("No se encontró el punto de inserción del runtime nativo");
index = index.replace(marker, '<script src="/native-runtime.js"></script>\n<script>\n// Cache-busting');
fs.writeFileSync(indexPath, index);

console.log("Mobile web bundle preparado en mobile-dist");
