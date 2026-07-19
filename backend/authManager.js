"use strict";

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { 
  createUserTransaction, 
  getUserByEmailOrUsername, 
  getPlayerByUserId,
  checkIfBanned,
  pool 
} = require("./database");

// Usar exclusivamente variable de entorno. Si no está definida, fallar explícitamente.
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET || Buffer.byteLength(JWT_SECRET, "utf8") < 32) {
  console.error("❌ JWT_SECRET debe estar definido y tener al menos 32 bytes");
  process.exit(1);
}

function verifyGameToken(token) {
  if (!token || typeof token !== "string") throw new Error("Token faltante");
  return jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });
}

function createGuestSession(req, res) {
  const playerId = `guest_${require("crypto").randomUUID()}`;
  const token = jwt.sign(
    { guest: true, playerId, username: "Jugador" },
    JWT_SECRET,
    { algorithm: "HS256", expiresIn: "12h" }
  );
  res.status(201).json({ token, player: { id: playerId, alias: "Jugador" } });
}

async function register(req, res) {
  const { email, username, password } = req.body;

  if (!email || !username || !password) {
    return res.status(400).json({ error: "Faltan datos requeridos" });
  }
  const normalizedUsername = String(username).trim();
  const normalizedEmail = String(email).trim().toLowerCase();
  if (!/^[\p{L}][\p{L}\p{N}_.-]{2,23}$/u.test(normalizedUsername)) {
    return res.status(400).json({ error: "El usuario debe tener 3 a 24 caracteres y comenzar con una letra" });
  }
  if (normalizedEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return res.status(400).json({ error: "Correo electrónico inválido" });
  }
  if (typeof password !== "string" || password.length < 10 || password.length > 128) {
    return res.status(400).json({ error: "La contraseña debe tener entre 10 y 128 caracteres" });
  }

  try {
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    await createUserTransaction(normalizedEmail, normalizedUsername, passwordHash);
    
    res.status(201).json({ message: "Usuario registrado con éxito" });
  } catch (error) {
    console.error("Error en registro:", error);
    if (error.code === "23505") { // Código de PostgreSQL para UNIQUE violation
      return res.status(400).json({ error: "El email o usuario ya existe" });
    }
    res.status(500).json({ error: "Error interno del servidor" });
  }
}

async function login(req, res) {
  const { identifier, password } = req.body; // identifier puede ser email o username

  if (typeof identifier !== "string" || typeof password !== "string" || !identifier.trim() || !password) {
    return res.status(400).json({ error: "Faltan credenciales" });
  }

  try {
    const user = await getUserByEmailOrUsername(identifier.trim());
    if (!user) {
      return res.status(401).json({ error: "Credenciales incorrectas" });
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: "Credenciales incorrectas" });
    }

    // Verificar si el usuario está baneado
    const banStatus = await checkIfBanned(user.id);
    if (banStatus.banned) {
      if (banStatus.reason === 'permanente') {
        return res.status(403).json({ error: '🚫 Tu cuenta ha sido baneada permanentemente' });
      } else {
        return res.status(403).json({ error: `🚫 Tu cuenta está ${banStatus.reason}` });
      }
    }

    const player = await getPlayerByUserId(user.id);

    // Generar el Token
    const token = jwt.sign(
      { userId: user.id, playerId: player.id, username: user.username },
      JWT_SECRET,
      { algorithm: "HS256", expiresIn: "7d" }
    );

    res.json({
      message: "Login exitoso",
      token,
      player: {
        id: player.id,
        alias: player.alias,
        coins: player.coins
      }
    });
  } catch (error) {
    console.error("Error en login:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
}

// Middleware para proteger rutas (como el ranking)
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Debes iniciar sesión para ver esto" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ error: "Sesión expirada o inválida" });
  }
}

const nodemailer = require("nodemailer");
const crypto = require("crypto");

// Verificar que las credenciales de email estén configuradas
const hasEmailConfig = !!(process.env.EMAIL_USER && process.env.EMAIL_PASS);

if (!hasEmailConfig) {
  console.warn("⚠ EMAIL_USER/EMAIL_PASS no configurados — recuperación de contraseña no disponible");
}

const transporter = nodemailer.createTransport({
  service: "gmail",
  disableFileAccess: true,
  disableUrlAccess: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Verificar conexión SMTP al iniciar (no bloqueante)
if (hasEmailConfig) {
  transporter.verify().then(() => {
    console.log("✅ Conexión SMTP (Gmail) verificada");
  }).catch(err => {
    console.warn("⚠ Error verificando SMTP:", err.message);
    console.warn("  → Si usás Gmail, necesitás una Contraseña de Aplicación");
    console.warn("  → https://myaccount.google.com/apppasswords");
  });
}

async function requestPasswordReset(req, res) {
  const { email } = req.body;

  if (typeof email !== 'string' || !email.trim()) {
    return res.status(400).json({ error: "Email requerido" });
  }
  const normalizedEmail = email.trim().toLowerCase();

  // Verificar que el email existe antes de hacer cualquier cosa
  const userCheck = await pool.query("SELECT id FROM users WHERE email = $1", [normalizedEmail]);
  if (userCheck.rows.length === 0) {
    // No revelar si el email existe o no por seguridad
    return res.json({ message: "Si el correo está registrado, recibirás instrucciones" });
  }

  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expires = new Date(Date.now() + 3600000); // 1 hora de validez

  // Guardar en Neon
  await pool.query("UPDATE users SET reset_token = $1, reset_expires = $2 WHERE email = $3", 
    [tokenHash, expires, normalizedEmail]);

  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  const resetLink = `${baseUrl}/reset-password.html?token=${token}`;
  
  // Si no hay credenciales de email, ni intentamos enviar
  if (!hasEmailConfig) {
    console.warn("No se puede enviar email: EMAIL_USER/EMAIL_PASS no configurados");
    return res.json({ message: "Si el correo está registrado, recibirás instrucciones" });
  }

  try {
    console.log('📧 Enviando correo de recuperación...');
    // Timeout de 10s para que no se cuelgue si Gmail falla
    await Promise.race([
      transporter.sendMail({
        from: process.env.EMAIL_FROM || `"Macko Juegos" <${process.env.EMAIL_USER}>`,
        to: normalizedEmail,
        subject: "Recuperación de cuenta - Los 10.000",
        html: `
          <div style="font-family: sans-serif; max-width: 500px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
            <h2 style="color: #C8961E; text-align: center;">Los 10.000 de Macko</h2>
            <p>Hola, recibimos una solicitud para recuperar tu contraseña.</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetLink}" style="background-color: #C8961E; color: #fff; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                Cambiar contraseña
              </a>
            </div>
            <p style="font-size: 12px; color: #888;">Si no solicitaste esto, ignora este correo. El enlace caduca en 1 hora.</p>
          </div>
        `
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout email 10s")), 10000))
    ]);
    console.log('✅ Email de recuperación enviado');
  } catch (err) {
    console.error("❌ Error al enviar email de recuperación:", err.message);
    if (err.code === 'EAUTH') {
      console.error("   → Credenciales de Gmail incorrectas. Necesitás una Contraseña de Aplicación:");
      console.error("   → https://myaccount.google.com/apppasswords");
    }
    // No devolvemos error al cliente por seguridad (no revelar si el email existe)
  }

  res.json({ message: "Si el correo está registrado, recibirás instrucciones" });
}

module.exports = {
  register,
  login,
  requireAuth,
  requestPasswordReset,
  createGuestSession,
  verifyGameToken
};
