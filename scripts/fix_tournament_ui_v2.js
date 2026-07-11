const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'frontend', 'app.js');
let code = fs.readFileSync(filePath, 'utf8');

const origLen = code.length;

// ── 1. renderTournaments ──
const r1Start = 'function renderTournaments(tournaments) {';
const r1Idx = code.indexOf(r1Start);
if (r1Idx === -1) { console.log('❌ renderTournaments not found'); process.exit(1); }

const r1End = code.indexOf('async function showTournamentBracket', r1Idx);
const oldRender = code.slice(r1Idx, r1End).trimEnd();

const newRender = `function renderTournaments(tournaments) {
  const list = $('tournament-list');
  if (!list) return;
  if (!tournaments.length) {
    list.innerHTML = '<p style="text-align:center;padding:20px;color:var(--text3);font-size:13px">No hay torneos activos ahora</p>';
    return;
  }
  list.innerHTML = tournaments.map(t => {
    const statusIcon = t.status === 'active' ? '⚔️' : t.status === 'registration' ? '📝' : t.status === 'completed' ? '✅' : '❌';
    const feeText = parseInt(t.fee) > 0 ? \`Fee: \${formatNum(parseInt(t.fee))} 🪙\` : 'Gratis';
    const prizeText = parseInt(t.prize_pool) > 0 ? \`Premios: \${formatNum(parseInt(t.prize_pool))} 🪙\` : '';
    
    let actionHtml = '';
    if (t.status === 'registration') {
      if (t.is_registered) {
        actionHtml = \`<span style="color:var(--green);font-size:11px;font-weight:600;margin-left:auto">✅ Inscripto</span>
          <button class="btn btn-ghost" style="padding:4px 10px;font-size:10px;width:auto;color:var(--red);border-color:rgba(255,80,80,.3)" 
            onclick="event.stopPropagation();unregisterTournament('\${t.id}')">✕ Cancelar</button>\`;
      } else {
        actionHtml = \`<button class="btn btn-gold" style="padding:4px 12px;font-size:11px;width:auto;margin-left:auto" 
          onclick="event.stopPropagation();registerTournament('\${t.id}')">📝 Inscribirme</button>\`;
      }
    } else if (t.status === 'active') {
      actionHtml = \`<button class="btn btn-ghost" style="padding:4px 12px;font-size:11px;width:auto;margin-left:auto" 
        onclick="event.stopPropagation();showTournamentBracket('\${t.id}')">Ver bracket</button>\`;
    }
    
    return \`<div class="tournament-card" style="
      background:var(--bg-card2);border:1px solid \${t.is_registered ? 'var(--green)' : 'var(--border2)'};border-radius:10px;
      padding:14px;margin-bottom:8px;cursor:pointer;
      transition:border-color .2s
    " onclick="showTournamentBracket('\${t.id}')">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
        <div>
          <div style="font-size:14px;font-weight:600;color:var(--text)">\${statusIcon} \${esc(t.name)}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:2px">\${esc(t.description || '')}</div>
        </div>
        <div style="text-align:right;font-size:12px;color:var(--text2);white-space:nowrap">
          <div>\${parseInt(t.registered_count || 0)}/\${t.max_players}</div>
          <div style="font-size:10px;color:var(--gold)">\${feeText}</div>
          \${prizeText ? \`<div style="font-size:10px;color:var(--gold)">\${prizeText}</div>\` : ''}
        </div>
      </div>
      <div style="margin-top:6px;display:flex;gap:8px;font-size:11px;align-items:center">
        <span style="color:var(--text3)">Ronda \${t.current_round || 0}/\${t.rounds || '?'}</span>
        \${actionHtml}
      </div>
    </div>\`;
  }).join('');
}`;

code = code.replace(oldRender, newRender);
console.log('✅ renderTournaments updated');

// ── 2. registerTournament → add loadNextTournament ──
const r2Start = 'async function registerTournament(tournamentId) {';
const r2Idx = code.indexOf(r2Start);
if (r2Idx === -1) { console.log('❌ registerTournament not found'); process.exit(1); }

const afterRegister = code.indexOf('async function showTournamentBracket', r2Idx);
const oldRegister = code.slice(r2Idx, afterRegister).trimEnd();

const newRegister = `async function registerTournament(tournamentId) {
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

code = code.replace(oldRegister, newRegister);
console.log('✅ registerTournament + unregisterTournament added');

fs.writeFileSync(filePath, code, 'utf8');
console.log('✅ frontend/app.js saved');
console.log(`   Size: ${origLen} → ${code.length} chars`);
