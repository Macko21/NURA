const fs = require('fs');
const code = fs.readFileSync('frontend/app.js', 'utf8');

// Find registerTournament
const marker = 'async function registerTournament(tournamentId) {';
const idx = code.indexOf(marker);
if (idx === -1) {
  console.log('NOT FOUND: ' + marker);
  process.exit(1);
}

// The ending is where the next function starts (showTournamentBracket)
const nextFunc = '\n\nasync function showTournamentBracket(';
const endIdx = code.indexOf(nextFunc, idx);

if (endIdx === -1) {
  // Try different spacing
  const altNext = '\n\nasync function showTournamentBracket (';
  const endIdx2 = code.indexOf(altNext, idx);
  if (endIdx2 === -1) {
    // Just log the surrounding text to debug
    console.log('Text from 2030 to 2040:');
    const lines = code.split('\n');
    for (let i = 2025; i < 2040 && i < lines.length; i++) {
      console.log((i+1) + ': ' + JSON.stringify(lines[i]));
    }
    process.exit(1);
  }
  var endIdx3 = endIdx2;
}

const oldText = code.slice(idx, (endIdx || endIdx3)).trimEnd();

const newText = `async function registerTournament(tournamentId) {
  const token = localStorage.getItem('gameToken');
  if (!token) { toast('Debés iniciar sesión'); return; }
  try {
    const res = await fetch('/api/tournaments/' + tournamentId + '/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': \`Bearer \${token}\` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    toast('✅ Te inscribiste al torneo!', 'success');
    loadTournaments();
    loadUserBalance();
    loadNextTournament();
  } catch(err) {
    toast('⚠ ' + err.message);
  }
}

async function unregisterTournament(tournamentId) {
  const token = localStorage.getItem('gameToken');
  if (!token) { toast('Debés iniciar sesión'); return; }
  try {
    const res = await fetch('/api/tournaments/' + tournamentId + '/unregister', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': \`Bearer \${token}\` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    toast('❌ Cancelaste tu inscripción al torneo', 'info');
    loadTournaments();
    loadNextTournament();
  } catch(err) {
    toast('⚠ ' + err.message);
  }
}`;

const newCode = code.replace(oldText, newText);
fs.writeFileSync('frontend/app.js', newCode, 'utf8');
console.log('✅ Success! registerTournament + unregisterTournament');
