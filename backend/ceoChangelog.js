"use strict";

// Detalle operativo visible únicamente desde el endpoint autenticado del CEO.
module.exports = {
  "3.8.5": {
    title: "🏆 Ciclo de vida, seguridad y UX integral de torneos",
    scope: "ceo",
    files: [
      "backend/database.js",
      "backend/server.js",
      "backend/tournamentManager.js",
      "backend/tournamentRules.js",
      "frontend/app.js",
      "frontend/ceo-panel.html",
      "frontend/ceo-panel.js",
      "frontend/styles.css",
      "scripts/game-rules-test.js",
      "frontend/sw.js",
      "frontend/version.js",
      "package.json",
      "package-lock.json"
    ],
    changes: [
      "Retención pública: completed_at/cancelled_at registran el cierre real; finalizados y cancelados se ocultan de la lista pública después de 24 horas sin borrar historial ni bracket.",
      "Migración: torneos históricos reciben fechas de cierre compatibles y un índice optimiza el filtro público por estado y antigüedad.",
      "Inscripción: registro y baja validan estado, plazo, cupo, jugador y saldo dentro de una transacción bloqueada.",
      "Seguridad: el registro por WebSocket toma identidad autenticada del socket e ignora IDs y nombres enviados por el cliente.",
      "Programación: el auto-inicio respeta start_time; recurrencias saltan fechas vencidas, evitan duplicados por intervalo y preservan correctamente premios y anticipación del cierre.",
      "Bracket: estados de eliminado, finalista y campeón quedan persistidos; la final registra completed_at y mantiene premio idempotente.",
      "Recursos: cancelar un torneo limpia salas y referencias activas; detener el manager cancela ambos intervalos internos.",
      "Notificaciones: avisos WebSocket de torneos próximos funcionan incluso cuando las notificaciones push no están configuradas.",
      "Interfaz: cards separan disponibles y resultados recientes, muestran cupos/estado/horario, permiten salir antes del cierre y mejoran bracket horizontal en mobile.",
      "CEO: creación usa fecha y hora, valida cronología y explica correctamente el reintegro al cancelar.",
      "Pruebas: 19 reglas y 31 smoke tests aprobados; versión PWA y caché actualizadas a 3.8.5."
    ]
  },
  "3.8.4": {
    title: "🎲 Normalización de skins y progreso por partidas completadas",
    scope: "ceo",
    files: [
      "backend/cosmeticResolver.js",
      "backend/database.js",
      "backend/playerManager.js",
      "backend/server.js",
      "scripts/game-rules-test.js",
      "frontend/index.html",
      "frontend/ceo-panel.html",
      "frontend/sw.js",
      "frontend/version.js",
      "package.json",
      "package-lock.json"
    ],
    changes: [
      "Cosméticos: los IDs históricos de PostgreSQL se traducen por nombre a la skin visual canónica.",
      "Cosméticos: Tarzan y demás jugadores muestran la skin realmente equipada en sala y partida.",
      "Estadísticas: solo jugadores presentes y no eliminados al finalizar incrementan partidas, puntos y victorias.",
      "Misiones: desconectarse, abandonar o quedar eliminado por inactividad ya no suma progreso diario, semanal ni logros.",
      "PWA: versión y caché actualizadas a 3.8.4."
    ]
  },
  "3.8.3": {
    title: "📱 Safe-area superior aplicada a todas las vistas móviles",
    scope: "ceo",
    files: [
      "frontend/styles.css",
      "frontend/index.html",
      "frontend/ceo-panel.html",
      "frontend/sw.js",
      "frontend/version.js",
      "package.json",
      "package-lock.json"
    ],
    changes: [
      "iOS: Portal, sala de espera y partida suman safe-area-inset-top a sus encabezados.",
      "Interfaz: reloj, conectividad y batería dejan de tapar títulos, códigos de sala y controles.",
      "Responsive: el cambio solo aplica hasta 600 px y no altera la vista de escritorio.",
      "PWA: versión y caché actualizadas a 3.8.3 para forzar la descarga del CSS corregido."
    ]
  },
  "3.8.2": {
    title: "🔊 Audio por canales, push estable y ranking verificado",
    scope: "ceo",
    files: [
      "backend/database.js",
      "backend/playerManager.js",
      "backend/pushManager.js",
      "backend/server.js",
      "frontend/app.js",
      "frontend/audio.js",
      "frontend/index.html",
      "frontend/styles.css",
      "frontend/sw.js"
    ],
    changes: [
      "Audio: panel flotante único disponible desde lobby, sala de espera y partida, posicionado dentro del viewport también en PWA móvil.",
      "Audio: Música y Efectos tienen volumen, mute y persistencia independientes; los efectos conservan un volumen inicial superior.",
      "Audio: las transiciones de pantalla cancelan cargas anteriores y detienen la pista activa antes de iniciar principal, lobby o partida, evitando superposiciones.",
      "Notificaciones: solicitud explícita de permisos, espera acotada del Service Worker y mensajes de error reales sin falsos estados activados.",
      "Notificaciones: renovación automática de suscripciones asociadas a una clave VAPID anterior y resincronización con PostgreSQL.",
      "Notificaciones: asunto VAPID normalizado, validación estructural del endpoint y propagación de errores de persistencia al cliente.",
      "Ranking: consulta limitada por unión a usuarios registrados y ordenada exclusivamente por victorias verificadas.",
      "Estadísticas: el resultado completo se registra en una transacción atómica y suma victorias reales también en partidas contra bots.",
      "Estadísticas: bots e invitados quedan excluidos de victorias, ranking, rachas y progresión persistente.",
      "Interfaz: el ranking identifica jugadores verificados y elimina métricas secundarias que alteraban la lectura por victorias."
    ]
  },
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
