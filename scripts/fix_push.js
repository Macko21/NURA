const fs = require('fs');
const c = fs.readFileSync('frontend/app.js', 'utf8');

// Find the SW catch block end
const catchIdx = c.indexOf('.catch(err');
console.log('SW catch at:', catchIdx);
const endOfBlock = c.indexOf('});\n}\n', catchIdx);
console.log('End of SW block at:', endOfBlock);
console.log('Content after:', JSON.stringify(c.slice(endOfBlock, endOfBlock + 60)));

// Find btn-tournaments onclick
const btnIdx = c.indexOf("$('btn-tournaments')");
console.log('\nbtn-tournaments $() at:', btnIdx);
if (btnIdx >= 0) {
  console.log('Content:', JSON.stringify(c.slice(btnIdx, btnIdx + 120)));
}

// Find alternative
const btnIdx2 = c.indexOf("btn-tournaments");
console.log('\nAll btn-tournaments occurrences:');
let idx = -1;
let found = [];
while ((idx = c.indexOf("btn-tournaments", idx + 1)) !== -1) {
  found.push(idx);
}
found.forEach(idx => {
  console.log('  at', idx, ':', JSON.stringify(c.slice(Math.max(0, idx - 20), idx + 60)));
});
