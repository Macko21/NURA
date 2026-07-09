"use strict";

/**
 * ============================================================
 * LOS 10.000 DE MACKO — emailManager.js
 * Envío de emails usando Nodemailer
 * ============================================================
 */

const nodemailer = require("nodemailer");

let transporter = null;
let emailReady = false;

function initEmail() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || "noreply@los10000demacko.com";

  if (host && user && pass) {
    transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass }
    });
    emailReady = true;
    console.log("📧 Email configurado (" + host + ":" + port + ")");
  } else {
    console.warn("⚠️  Email: Sin configuración SMTP — reportes por email deshabilitados");
    console.warn("   Configurá SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS en el env");
  }
}

function isEmailReady() {
  return emailReady;
}

async function sendReportEmail(to, reportHtml) {
  if (!emailReady || !transporter) {
    throw new Error("Email no configurado");
  }
  const from = process.env.SMTP_FROM || "noreply@los10000demacko.com";
  const info = await transporter.sendMail({
    from: `"CEO Panel" <${from}>`,
    to,
    subject: "📊 Reporte Semanal — Los 10.000 de Macko",
    html: reportHtml
  });
  return { success: true, messageId: info.messageId };
}

module.exports = {
  initEmail,
  isEmailReady,
  sendReportEmail
};
