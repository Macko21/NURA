const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'frontend', 'app.js');
let code = fs.readFileSync(filePath, 'utf8');

// Find registerTournament and its ending
const start = 'async function registerTournament(tournamentId) {';
const idx = code.indexOf(start);
if (idx === -1) {
  // Try without 'async'
  const start2 = 'function registerTournament(tournamentId) {';
  const idx2 = code.indexOf(start2);
  if (idx2 === -1) {
    console.log('❌ registerTournament not found at all');
    process.exit(1);
  }
  console.log('Found without async');
  // Fall through to the other approach
}

// Find the next function after registerTournament to know where it ends
const nextFunc = code.indexOf('\n\nasync function showTournamentBracket', idx);
if (nextFunc === -1) {
  console.log('❌ Cant find end boundary');
  process.exit(1);
}

const oldText = code.slice(idx, nextFunc).trimEnd();

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

code = code.replace(oldText, newText);
fs.writeFileSync(filePath, code, 'utf8');

console.log('✅ registerTournament updated + unregisterTournament added');
console.log('File saved:', (code.length > 140000 ? 'large file ok' : 'ok'));
