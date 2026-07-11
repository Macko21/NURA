const fs = require('fs');
const path = require('path');

const appJsPath = path.join(__dirname, '..', 'frontend', 'app.js');
let code = fs.readFileSync(appJsPath, 'utf8');

// ============================================================
// 1. UPDATE renderTournaments — show registration status
// ============================================================

const oldRender = `function renderTournaments(tournaments) {
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
    return \`<div class="tournament-card" style="
      background:var(--bg-card2);border:1px solid var(--border2);border-radius:10px;
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
      <div style="margin-top:6px;display:flex;gap:8px;font-size:11px">
        <span style="color:var(--text3)">Ronda \${t.current_round || 0}/\${t.rounds || '?'}</span>
        \${t.status === 'registration' ? \`<button class="btn btn-gold" style="padding:4px 12px;font-size:11px;width:auto;margin-left:auto" onclick="event.stopPropagation();registerTournament('\${t.id}')">Inscribirme</button>\` : ''}
        \${t.status === 'active' ? \`<button class="btn btn-ghost" style="padding:4px 12px;font-size:11px;width:auto;margin-left:auto" onclick="event.stopPropagation();showTournamentBracket('\${t.id}')">Ver bracket</button>\` : ''}
      </div>
    </div>\`;
  }).join('');
}`;

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
    
    // Mostrar info de inscripción según estado
    let actionHtml = '';
    if (t.status === 'registration') {
      if (t.is_registered) {
        // Ya inscripto: badge verde + botón cancelar
        actionHtml = \`<span style="color:var(--green);font-size:11px;font-weight:600;margin-left:auto">✅ Inscripto</span>
          <button class="btn btn-ghost" style="padding:4px 10px;font-size:10px;width:auto;color:var(--red);border-color:rgba(255,80,80,.3)" 
            onclick="event.stopPropagation();unregisterTournament('\${t.id}')">✕ Cancelar</button>\`;
      } else {
        // No inscripto: botón dorado
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

if (code.includes(oldRender)) {
  code = code.replace(oldRender, newRender);
  console.log('✅ renderTournaments actualizada');
} else {
  console.log('❌ renderTournaments: no se encontró el bloque exacto');
  process.exit(1);
}

// ============================================================
// 2. UPDATE registerTournament — add loadNextTournament call
// ============================================================

const oldRegister = `async function registerTournament(tournamentId) {
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
  } catch(err) {
    toast('⚠ ' + err.message);
  }
}`;

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

if (code.includes(oldRegister)) {
  code = code.replace(oldRegister, newRegister);
  console.log('✅ registerTournament actualizada + unregisterTournament agregada');
} else {
  console.log('❌ registerTournament: no se encontró el bloque exacto');
  process.exit(1);
}

// ============================================================
// Write back
// ============================================================
fs.writeFileSync(appJsPath, code, 'utf8');
console.log('✅ frontend/app.js guardado');
console.log('\n✔ Cambios aplicados correctamente');
