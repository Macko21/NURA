const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'backend', 'server.js');
let code = fs.readFileSync(filePath, 'utf8');

// 1. Update require to include new database functions
code = code.replace(
  "const { initializeDatabase, buyShopItem, getShopCatalog, rewardWinner, pool } = require(\"./database\");",
  "const { initializeDatabase, buyShopItem, getShopCatalog, rewardWinner, pool, getUserProfile, awardXP, getPlayerMissions, claimMissionReward, checkMissionsCompleted, getLevel, getRank } = require(\"./database\");"
);

// 2. Add XP awarding in onMatchWon - after the rewardWinner calls
code = code.replace(
  `          await rewardWinner(player.id, amount);
          console.log(\`💰 \${amount} monedas → \${player.name || player.id} (puesto \${i + 1})\`);`,
  `          await rewardWinner(player.id, amount);
          console.log(\`💰 \${amount} monedas → \${player.name || player.id} (puesto \${i + 1})\`);
          // Dar XP por quedar en top 3
          try { await awardXP(player.id, XP_PER_TOP3 + (i === 0 ? XP_PER_WIN : 0)); } catch(e) {}
`);
  
// 3. After the for loop in onMatchWon, add XP for all players
code = code.replace(
  `    for (const p of match.players) {`,
  `    // Dar XP base a todos los jugadores
    for (const p of match.players) {
      try { await awardXP(p.id, XP_PER_GAME); } catch(e) {}
    }
    for (const p of match.players) {`
);

// 4. Add XP_PER_GAME constant (used in onMatchWon)
code = code.replace(
  "const RECONN_MS    = 120_000;  // 2 minutos de gracia (era 30s)",
  "const RECONN_MS    = 120_000;\nconst XP_PER_GAME   = 25;\nconst XP_PER_WIN    = 50;\nconst XP_PER_TOP3   = 15;"
);

// 5. Add profile endpoint AFTER the balance endpoint
code = code.replace(
  `// ── STRIPE ──────────────────────────────────────────────────`,
  `// ── PERFIL DE USUARIO ──────────────────────────────────────
app.get("/api/user/profile", requireAuth, async (req, res) => {
  try {
    const profile = await getUserProfile(req.user.userId);
    if (!profile) return res.status(404).json({ error: "Perfil no encontrado" });
    res.json(profile);
  } catch (err) {
    console.error("Error perfil:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── MISIONES ─────────────────────────────────────────────────
app.get("/api/user/missions", requireAuth, async (req, res) => {
  try {
    const playerId = req.user.playerId;
    const missions = await getPlayerMissions(playerId);
    res.json({ missions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/user/missions/claim", requireAuth, async (req, res) => {
  try {
    const { missionId } = req.body;
    const playerId = req.user.playerId;
    const result = await claimMissionReward(playerId, missionId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── STRIPE ──────────────────────────────────────────────────`
);

fs.writeFileSync(filePath, code, 'utf8');
console.log('✅ server.js updated!');
