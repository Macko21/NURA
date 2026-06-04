"use strict";

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { 
  createUserTransaction, 
  getUserByEmailOrUsername, 
  getPlayerByUserId,
  pool 
} = require("./database");

// Si no hay variable de entorno, usa este secreto por defecto
const JWT_SECRET = process.env.JWT_SECRET || "secreto_macko_10000";

async function register(req, res) {
  const { email, username, password } = req.body;

  if (!email || !username || !password) {
    return res.status(400).json({ error: "Faltan datos requeridos" });
  }

  try {
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    await createUserTransaction(email, username, passwordHash);
    
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

  try {
    const user = await getUserByEmailOrUsername(identifier);
    if (!user) {
      return res.status(401).json({ error: "Credenciales incorrectas" });
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: "Credenciales incorrectas" });
    }

    const player = await getPlayerByUserId(user.id);

    // Generar el Token
    const token = jwt.sign(
      { userId: user.id, playerId: player.id, username: user.username },
      JWT_SECRET,
      { expiresIn: "7d" }
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
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ error: "Sesión expirada o inválida" });
  }
}

const nodemailer = require("nodemailer");
const crypto = require("crypto");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

async function requestPasswordReset(req, res) {
  const { email } = req.body;
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 3600000); // 1 hora de validez

  // Guardar en Neon
  await pool.query("UPDATE users SET reset_token = $1, reset_expires = $2 WHERE email = $3", 
    [token, expires, email]);

const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
const resetLink = `${baseUrl}/reset-password.html?token=${token}`;
  
  await transporter.sendMail({
  from: '"Macko Juegos" <matiasoyarzo7@gmail.com>',
  to: email,
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
});

  res.json({ message: "Email enviado" });
}

module.exports = {
  register,
  login,
  requireAuth,
  requestPasswordReset
};