"use strict";

const nodemailer = require("nodemailer");

let transporter = null;
let emailReady = false;
let defaultFrom = "";

function initEmail() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT, 10) || 587;
  const user = process.env.SMTP_USER || process.env.EMAIL_USER;
  const pass = process.env.SMTP_PASS || process.env.EMAIL_PASS;
  defaultFrom = process.env.SMTP_FROM || process.env.EMAIL_FROM || user || "noreply@los10000demacko.com";

  if (!user || !pass) {
    console.warn("Email sin configurar: verificacion y recuperacion deshabilitadas");
    return;
  }

  transporter = nodemailer.createTransport({
    ...(host ? { host, port, secure: port === 465 } : { service: "gmail" }),
    disableFileAccess: true,
    disableUrlAccess: true,
    auth: { user, pass }
  });
  emailReady = true;
  console.log(host ? `Email configurado (${host}:${port})` : "Email configurado (Gmail)");
  transporter.verify().catch(err => {
    emailReady = false;
    console.error("No se pudo verificar el servicio de email:", err.message);
  });
}

function isEmailReady() {
  return emailReady && !!transporter;
}

async function sendEmail({ to, subject, html, text, fromName = "Macko Juegos" }) {
  if (!isEmailReady()) throw new Error("Servicio de email no disponible");
  const info = await transporter.sendMail({
    from: defaultFrom.includes("<") ? defaultFrom : `"${fromName}" <${defaultFrom}>`,
    to,
    subject,
    html,
    text
  });
  return { success: true, messageId: info.messageId };
}

async function sendReportEmail(to, reportHtml) {
  return sendEmail({
    to,
    subject: "Reporte Semanal - Los 10.000 de Macko",
    html: reportHtml,
    fromName: "CEO Panel"
  });
}

module.exports = {
  initEmail,
  isEmailReady,
  sendEmail,
  sendReportEmail
};
