const fs = require('fs');
const c = fs.readFileSync('frontend/app.js', 'utf8');

let modified = c;

// === CHANGE 1: SW message listener ===
// Search for the end of the SW registration block using flexible matching
const marker1 = `/* ── Push Notifications ─────────────────────────────── */`;
const idx1 = modified.indexOf(marker1);
console.log('Marker1 found at:', idx1);

if (idx1 !== -1) {
  // Find the newline before this marker (should be after `}\n\n`)
  // Go back to find the closing `}\n` before the marker
  const before = modified.slice(0, idx1);
  // Check for some typical patterns right before the marker
  const tailLen = 10;
  console.log('Right before marker:', JSON.stringify(modified.slice(idx1 - tailLen, idx1 + tailLen)));

  // The block should end with `}\r\n\r\n/* ── Push...`
  // Find the last `}\r\n` before our marker
  const beforeMarker = modified.slice(0, idx1);
  const lastBraceClose = beforeMarker.lastIndexOf('}');
  if (lastBraceClose !== -1) {
    const afterBrace = beforeMarker.slice(lastBraceClose);
    console.log('After last brace:', JSON.stringify(afterBrace.slice(0, 30)));
  }

  // Insert after `});\r\n  });\r\n}\r\n\r\n` and before the marker
  // Find the exact insertion point
  const regex = /\}\);[\r\n]+  \}\);[\r\n]+}[\r\n]+[\r\n]+/;
  const match = beforeMarker.match(regex);
  if (match) {
    const insertAt = match.index + match[0].length;
    console.log('Insert at:', insertAt);
    console.log('Matches:', JSON.stringify(match[0]));

    const listenerBlock = `  // Escuchar mensajes del Service Worker (push recibidos, actualizaciones, etc.)
  navigator.serviceWorker.addEventListener('message', event => {
    const msg = event.data;
    if (!msg || !msg.type) return;
    if (msg.type === 'PUSH_RECEIVED') {
      // Mostrar badge en el botón de torneos
      const badge = document.getElementById('tournament-push-badge');
      if (badge) {
        badge.classList.remove('hidden');
        badge.textContent = '\uD83D\uDD14';
        clearTimeout(badge._hideTimer);
        badge._hideTimer = setTimeout(() => {
          badge.classList.add('hidden');
        }, 12000);
      }
      // Mostrar toast con el mensaje (truncar body si es muy largo)
      if (msg.title || msg.body) {
        const bodyText = msg.body ? (msg.body.length > 80 ? msg.body.slice(0, 80) + '\u2026' : msg.body) : '';
        const prefix = msg.title ? msg.title + (bodyText ? ': ' : '') : '';
        const fullText = '\uD83D\uDCEB ' + prefix + bodyText;
        const el = document.getElementById('toast');
        if (el) {
          el.textContent = fullText;
          el.classList.remove('hidden');
          clearTimeout(window._toastT);
          window._toastT = setTimeout(() => el.classList.add('hidden'), 5000);
        }
      }
    }
  });
`;

    modified = modified.slice(0, insertAt) + listenerBlock + modified.slice(insertAt);
    console.log('✅ Change 1: SW message listener added');
  } else {
    console.log('❌ Could not match regex at marker position');
  }
} else {
  console.log('❌ Could not find Push Notifications marker');
}

// === CHANGE 2: Badge cleanup in btn-tournaments onclick ===
const btnMarker = `$('btn-tournaments').onclick = async () => {`;
const idx2 = modified.indexOf(btnMarker);
console.log('\nbtn-tournaments onclick found at:', idx2);
if (idx2 !== -1) {
  const after = modified.slice(idx2);
  const afterFirstLine = after.indexOf('\n');
  const firstLine = after.slice(0, afterFirstLine);
  console.log('First line:', JSON.stringify(firstLine));

  // Check if badge cleanup is already there
  if (modified.includes('tournament-push-badge', idx2 - 50) && modified.includes('tournament-push-badge', idx2) && modified.includes('tournament-push-badge', idx2 + 10)) {
    // Try to see if already added
    const afterMarker = modified.slice(idx2, idx2 + 300);
    if (afterMarker.includes('push-badge')) {
      console.log('✅ Badge cleanup already present');
    } else {
      // Find the next line after `$('btn-tournaments').onclick = async () => {`
      const afterBraceColon = modified.indexOf('{)', idx2);
      console.log('After brace-colon:', JSON.stringify(modified.slice(idx2 + 55, idx2 + 85)));

      // The line should be something like `\n    const token = ...`
      const tokenLine = `\n    const token = localStorage.getItem('gameToken');`;
      const tokenIdx = modified.indexOf(tokenLine, idx2);
      console.log('token line found at offset:', tokenIdx >= 0 ? tokenIdx - idx2 : -1);

      if (tokenIdx !== -1) {
        const cleanupLine = `\n    // Limpiar badge de notificación push al abrir torneos\n    const pb = document.getElementById('tournament-push-badge');\n    if (pb) pb.classList.add('hidden');`;
        modified = modified.slice(0, tokenIdx) + cleanupLine + modified.slice(tokenIdx);
        console.log('✅ Change 2: Badge cleanup added to btn-tournaments');
      } else {
        console.log('❌ Could not find token line after btn-tournaments');
      }
    }
  } else {
    // First time adding
    const tokenLine = `\n    const token = localStorage.getItem('gameToken');`;
    const tokenIdx = modified.indexOf(tokenLine, idx2);
    if (tokenIdx !== -1) {
      const cleanupLine = `\n    // Limpiar badge de notificación push al abrir torneos\n    const pb = document.getElementById('tournament-push-badge');\n    if (pb) pb.classList.add('hidden');`;
      modified = modified.slice(0, tokenIdx) + cleanupLine + modified.slice(tokenIdx);
      console.log('✅ Change 2: Badge cleanup added to btn-tournaments');
    } else {
      console.log('❌ Could not find token line after btn-tournaments');
    }
  }
} else {
  console.log('❌ Could not find btn-tournaments onclick');
}

if (modified !== c) {
  fs.writeFileSync('frontend/app.js', modified, 'utf8');
  console.log('✅ File saved');
} else {
  console.log('⚠ No changes made');
}
