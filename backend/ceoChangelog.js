"use strict";

// Detalle operativo visible únicamente desde el endpoint autenticado del CEO.
module.exports = {
  "3.8.1": {
    title: "🛡️ Endurecimiento de producción, audio móvil y limpieza integral",
    scope: "ceo",
    files: [
      "backend/authManager.js",
      "backend/database.js",
      "backend/server.js",
      "backend/tournamentManager.js",
      "frontend/app.js",
      "frontend/audio.js",
      "frontend/ceo-panel.js",
      "frontend/styles.css",
      "frontend/sw.js"
    ],
    changes: [
      "Móvil: la barra superior ahora ocupa espacio real, respeta safe-area y no es cubierta por el dado animado.",
      "Audio: panel independiente del menú de usuario, volumen persistente, silencio real en 0 y estado visual de activado/desactivado.",
      "Sala: código, copiar y sonido quedaron agrupados y alineados a la derecha en el orden solicitado.",
      "WebSocket: identificación obligatoria mediante JWT firmado, sesiones invitadas generadas por servidor y bloqueo de suplantación por ID o nombre.",
      "WebSocket: validación de origen, límite de payload, timeout de autenticación, rate limits por conexión y cooldowns por acción.",
      "Autoridad de partida: el servidor reemplaza identidad enviada por cliente y exige pertenencia real a la sala para cada acción.",
      "Contenido dinámico: sanitización de nombres, chats, avatares, tienda, torneos y panel CEO contra inyección HTML/JavaScript.",
      "Panel CEO: secretos mínimos de 32 bytes, contraseñas administrativas de 14 caracteres, roles validados y exportación CSV protegida.",
      "Recuperación de contraseña: tokens guardados como hash SHA-256 y mensajes que no revelan si existe una cuenta.",
      "Pagos Stripe y Mercado Pago: importes calculados desde packs del servidor, webhooks idempotentes y acreditación atómica por ID de pago.",
      "Economía: misiones, cofres, ajustes, inscripción y reembolso de torneos protegidos con transacciones y bloqueos de fila.",
      "Amistades: pareja única bidireccional, aceptación autoritativa y validación de amistad para chats privados.",
      "Torneos: salas reales por match, propagación de BYE, avance de bracket, premio único al campeón y reintento seguro ante fallas de PostgreSQL.",
      "PWA: caché sincronizada con 3.8.1, recursos de audio incluidos y navegación de notificaciones limitada al mismo origen.",
      "Dependencias: uuid reemplazado por crypto.randomUUID, Nodemailer actualizado y endurecido; npm audit informa 0 vulnerabilidades.",
      "Limpieza: eliminados SQLite, recursos raíz duplicados, scripts de parche históricos y archivos de depuración sin uso.",
      "Operación: se eliminó un script histórico que contenía una URL real de Neon; sigue siendo obligatorio rotar esa credencial y purgarla del historial si el repositorio fue compartido.",
      "Verificación: 13 pruebas de reglas, 30 smoke tests, controles de sintaxis, seguridad HTTP, sesión invitada y rechazo WebSocket sin autenticación."
    ]
  }
};
