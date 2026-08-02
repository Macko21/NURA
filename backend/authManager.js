"use strict";

const bcrypt = require("bcrypt");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const {
  createUserTransaction,
  getUserByEmailOrUsername,
  getPlayerByUserId,
  checkIfBanned,
  pool
} = require("./database");
const { isEmailReady, sendEmail } = require("./emailManager");

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || Buffer.byteLength(JWT_SECRET, "utf8") < 32) {
  console.error("JWT_SECRET debe estar definido y tener al menos 32 bytes");
  process.exit(1);
}

function verifyGameToken(token) {
  if (!token || typeof token !== "string") throw new Error("Token faltante");
  return jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });
}

function createGuestSession(req, res) {
  const playerId = `guest_${crypto.randomUUID()}`;
  const token = jwt.sign(
    { guest: true, playerId, username: "Jugador" },
    JWT_SECRET,
    { algorithm: "HS256", expiresIn: "24h" }
  );
  res.status(201).json({ token, player: { id: playerId, alias: "Jugador" } });
}

function normalizeRegistration(body = {}) {
  return {
    email: String(body.email || "").trim().toLowerCase(),
    username: String(body.username || "").trim(),
    password: body.password
  };
}

function registrationValidation({ email, username, password }) {
  if (!email || !username || !password) return "Faltan datos requeridos";
  if (!/^[\p{L}][\p{L}\p{N}_.-]{2,23}$/u.test(username)) {
    return "El usuario debe tener 3 a 24 caracteres y comenzar con una letra";
  }
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return "Correo electronico invalido";
  }
  if (typeof password !== "string" || password.length < 10 || password.length > 128) {
    return "La contraseña debe tener entre 10 y 128 caracteres";
  }
  return null;
}

async function register(req, res) {
  const input = normalizeRegistration(req.body);
  const validationError = registrationValidation(input);
  if (validationError) return res.status(400).json({ error: validationError });
  if (!isEmailReady()) {
    return res.status(503).json({ error: "El servicio de email no esta disponible. Intenta nuevamente mas tarde." });
  }

  try {
    const existing = await pool.query(
      `SELECT 1 FROM users WHERE email = $1 OR LOWER(username) = LOWER($2) LIMIT 1`,
      [input.email, input.username]
    );
    if (existing.rows.length) {
      return res.status(400).json({ error: "El email o usuario ya existe" });
    }

    const passwordHash = await bcrypt.hash(input.password, 12);
    const code = String(crypto.randomInt(100000, 1000000));
    const codeHash = crypto.createHash("sha256").update(code).digest("hex");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await pool.query(
      `INSERT INTO pending_registrations
       (email, username, password_hash, code_hash, expires_at, attempts, created_at)
       VALUES ($1,$2,$3,$4,$5,0,$6)
       ON CONFLICT (email) DO UPDATE SET
         username = EXCLUDED.username,
         password_hash = EXCLUDED.password_hash,
         code_hash = EXCLUDED.code_hash,
         expires_at = EXCLUDED.expires_at,
         attempts = 0,
         created_at = EXCLUDED.created_at`,
      [input.email, input.username, passwordHash, codeHash, expiresAt, Date.now()]
    );

    try {
      await sendEmail({
        to: input.email,
        subject: "Tu codigo de verificacion - Los 10.000",
        text: `Tu codigo de verificacion es ${code}. Vence en 10 minutos.`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px;color:#172033">
            <h2 style="color:#C8961E">Los 10.000 de Macko</h2>
            <p>Usa este codigo para confirmar tu cuenta:</p>
            <p style="font-size:34px;font-weight:800;letter-spacing:8px;margin:24px 0">${code}</p>
            <p>Vence en 10 minutos. Si no pediste esta cuenta, ignora el mensaje.</p>
          </div>`
      });
    } catch (mailError) {
      await pool.query(`DELETE FROM pending_registrations WHERE email = $1`, [input.email]);
      console.error("Error enviando verificacion:", mailError.message);
      return res.status(503).json({ error: "No pudimos enviar el codigo. Intenta nuevamente." });
    }

    return res.status(202).json({
      message: "Te enviamos un codigo de 6 digitos",
      verificationRequired: true,
      email: input.email
    });
  } catch (error) {
    console.error("Error en registro:", error);
    if (error.code === "23505") {
      return res.status(400).json({ error: "El email o usuario ya existe o esta pendiente de verificacion" });
    }
    return res.status(500).json({ error: "Error interno del servidor" });
  }
}

async function verifyRegistration(req, res) {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const code = String(req.body?.code || "").replace(/\D/g, "");
  if (!email || !/^\d{6}$/.test(code)) {
    return res.status(400).json({ error: "Ingresa el codigo de 6 digitos" });
  }

  try {
    const pendingResult = await pool.query(
      `SELECT * FROM pending_registrations WHERE email = $1`,
      [email]
    );
    const pending = pendingResult.rows[0];
    if (!pending || new Date(pending.expires_at).getTime() <= Date.now()) {
      await pool.query(`DELETE FROM pending_registrations WHERE email = $1`, [email]);
      return res.status(400).json({ error: "El codigo vencio. Solicita uno nuevo." });
    }
    if (Number(pending.attempts) >= 5) {
      await pool.query(`DELETE FROM pending_registrations WHERE email = $1`, [email]);
      return res.status(429).json({ error: "Demasiados intentos. Solicita un codigo nuevo." });
    }

    const submittedHash = crypto.createHash("sha256").update(code).digest("hex");
    const expected = Buffer.from(pending.code_hash, "hex");
    const submitted = Buffer.from(submittedHash, "hex");
    if (expected.length !== submitted.length || !crypto.timingSafeEqual(expected, submitted)) {
      await pool.query(
        `UPDATE pending_registrations SET attempts = attempts + 1 WHERE email = $1`,
        [email]
      );
      return res.status(400).json({ error: "Codigo incorrecto" });
    }

    await createUserTransaction(email, pending.username, pending.password_hash);
    await pool.query(`DELETE FROM pending_registrations WHERE email = $1`, [email]);
    return res.status(201).json({ message: "Cuenta verificada y creada" });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(400).json({ error: "El email o usuario ya existe" });
    }
    console.error("Error verificando registro:", error);
    return res.status(500).json({ error: "No se pudo verificar la cuenta" });
  }
}

async function login(req, res) {
  const { identifier, password } = req.body;
  if (typeof identifier !== "string" || typeof password !== "string" || !identifier.trim() || !password) {
    return res.status(400).json({ error: "Faltan credenciales" });
  }
  try {
    const user = await getUserByEmailOrUsername(identifier.trim());
    if (!user || !await bcrypt.compare(password, user.password_hash)) {
      return res.status(401).json({ error: "Credenciales incorrectas" });
    }
    const banStatus = await checkIfBanned(user.id);
    if (banStatus.banned) {
      return res.status(403).json({
        error: banStatus.reason === "permanente"
          ? "Tu cuenta ha sido baneada permanentemente"
          : `Tu cuenta esta ${banStatus.reason}`
      });
    }
    const player = await getPlayerByUserId(user.id);
    if (!player) return res.status(500).json({ error: "No se encontro el perfil del jugador" });
    const token = jwt.sign(
      { userId: user.id, playerId: player.id, username: user.username },
      JWT_SECRET,
      { algorithm: "HS256", expiresIn: "30d" }
    );
    return res.json({
      message: "Login exitoso",
      token,
      player: { id: player.id, alias: player.alias, coins: player.coins }
    });
  } catch (error) {
    console.error("Error en login:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
}

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Debes iniciar sesion para ver esto" });
  }
  try {
    req.user = jwt.verify(authHeader.slice(7), JWT_SECRET, { algorithms: ["HS256"] });
    next();
  } catch (_) {
    return res.status(403).json({ error: "Sesion expirada o invalida" });
  }
}

async function requestPasswordReset(req, res) {
  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!email) return res.status(400).json({ error: "Email requerido" });
  if (!isEmailReady()) {
    return res.status(503).json({ error: "El servicio de email no esta disponible. Intenta nuevamente mas tarde." });
  }

  try {
    const userCheck = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
    if (!userCheck.rows.length) {
      return res.json({ message: "Si el correo esta registrado, recibiras instrucciones" });
    }
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const expires = new Date(Date.now() + 60 * 60 * 1000);
    await pool.query(
      "UPDATE users SET reset_token = $1, reset_expires = $2 WHERE email = $3",
      [tokenHash, expires, email]
    );
    const baseUrl = String(process.env.BASE_URL || `${req.protocol}://${req.get("host")}`).replace(/\/+$/, "");
    const resetLink = `${baseUrl}/reset-password.html?token=${encodeURIComponent(token)}`;
    try {
      await sendEmail({
        to: email,
        subject: "Recuperacion de cuenta - Los 10.000",
        text: `Abri este enlace para cambiar tu contraseña: ${resetLink}. Vence en 1 hora.`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px;color:#172033">
            <h2 style="color:#C8961E">Los 10.000 de Macko</h2>
            <p>Recibimos una solicitud para recuperar tu contraseña.</p>
            <p style="margin:28px 0"><a href="${resetLink}" style="background:#C8961E;color:#fff;padding:12px 22px;border-radius:7px;text-decoration:none;font-weight:bold">Cambiar contraseña</a></p>
            <p>El enlace vence en 1 hora. Si no lo pediste, ignora este mensaje.</p>
          </div>`
      });
    } catch (mailError) {
      await pool.query(
        "UPDATE users SET reset_token = NULL, reset_expires = NULL WHERE email = $1",
        [email]
      );
      console.error("Error enviando recuperacion:", mailError.message);
      return res.status(503).json({ error: "No pudimos enviar el email. Intenta nuevamente." });
    }
    return res.json({ message: "Si el correo esta registrado, recibiras instrucciones" });
  } catch (error) {
    console.error("Error solicitando recuperacion:", error);
    return res.status(500).json({ error: "No se pudo procesar la solicitud" });
  }
}

module.exports = {
  register,
  verifyRegistration,
  login,
  requireAuth,
  requestPasswordReset,
  createGuestSession,
  verifyGameToken
};
