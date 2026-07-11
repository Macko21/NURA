/**
 * ═══════════════════════════════════════════════════════
 * LOS 10.000 DE MACKO — version.js
 * Control de versiones y changelog del juego
 * ═══════════════════════════════════════════════════════
 * 
 * Cómo actualizar la versión:
 *   1. Incrementá VERSION (ej: "2.2.0" → "2.3.0")
 *   2. Agregá un entry al inicio de CHANGELOG con la fecha actual
 *   3. Comprometé los cambios
 */

const GAME_VERSION = "3.4.1";

const CHANGELOG = [
  // ═══ 3.4.1 — GAME ═══
  {
    version: "3.4.1",
    date: "2026-07-11",
    title: "🔴 Badge de nueva versión en el lobby",
    scope: "game",
    changes: [
      "🔴 Badge de nueva versión: punto rojo pulsante en el botón de versiones cuando hay cambios",
    ]
  },
  // ═══ 3.4.1 — CEO ═══
  {
    version: "3.4.1",
    date: "2026-07-11",
    title: "🤖 CI/CD: GitHub Actions + auto-deploy a Render",
    scope: "ceo",
    changes: [
      "📦 CI/CD pipeline con GitHub Actions: syntax check, smoke tests y deploy automático",
      "🧪 Smoke tests: verifican que el server arranque y endpoints clave respondan",
      "🚀 Auto-deploy a Render vía Deploy Hook cuando los tests pasan en main",
      "🩺 Health check en /api/version para monitoreo de Render",
      "📋 .env.example con todas las variables de entorno documentadas",
      "🎯 npm test y npm run test:syntax agregados a package.json",
    ]
  },
  // ═══ 3.4.0 — GAME ═══
  {
    version: "3.4.0",
    date: "2026-07-11",
    title: "🔧 Modularización + Rate limiting + Preview dados",
    scope: "game",
    changes: [
      "📦 Refactor: app.js dividido en módulos (dice-renderer.js + audio.js), -18KB",
      "🎲 Preview real de skins de dados (SVG con colores y animación) en la tienda",
      "🔒 Rate limiting: protección contra spam en shop, feedback, pagos y torneos",
      "🐛 Bugfix: generateBracket no importado en tournamentManager.js",
      "🐛 Bugfix: startMatchForRoom anidado dentro del handler WS",
      "🐛 Bugfix: className roto en shop items",
    ]
  },
  // ═══ 3.4.0 — CEO ═══
  {
    version: "3.4.0",
    date: "2026-07-11",
    title: "🔧 Mejoras CEO Panel",
    scope: "ceo",
    changes: [
      "🔧 CEO Panel: login JWT ya implementado correctamente",
      "🧹 Eliminados scripts temporales de /scripts",
    ]
  },
  // ═══ 3.3.0 — GAME ═══
  {
    version: "3.3.0",
    date: "2026-07-09",
    title: "🐛 Fix chat + mejoras de rendimiento",
    scope: "game",
    changes: [
      "Fix: chat global y privado no llegaban (faltaba connect() post-login)",
      "Fix: invitaciones de partida no se recibían",
      "Fix: chat privado perdía mensajes al cambiar de amigo",
      "Debounce en búsqueda del portal (300ms)",
      "Límite DOM en chat de sala (60 mensajes)",
    ]
  },
  // ═══ 3.2.0 — GAME ═══
  {
    version: "3.2.0",
    date: "2026-07-10",
    title: "🔔 Notificaciones + Amistad + Invitaciones + Fix tienda",
    scope: "game",
    changes: [
      "Centro de notificaciones con panel deslizante y badge de no leídas",
      "Switch de push notifications con persistencia en localStorage",
      "Solicitudes de amistad con aceptar/rechazar en notificaciones",
      "Invitaciones a partida con buscador de jugadores",
      "Broadcasts del CEO se ven en notificaciones en tiempo real",
      "Fix: tienda mostraba items comprados incorrectamente",
      "Fix: inventario perfil 5 columnas cuadradas compactas",
      "Fix: invalid date en notificaciones",
      "Torneos envían notificación a participantes conectados",
      "Deduplicación de mensajes de broadcast",
    ]
  },
  // ═══ 3.1.0 — GAME ═══
  {
    version: "3.1.0",
    date: "2026-07-10",
    title: "⏰ Torneos automáticos programados + countdown",
    scope: "game",
    changes: [
      "⏰ Auto-inicio: cuando la inscripción vence, el torneo arranca automáticamente",
      "❌ Auto-cancelación: si no hay suficientes jugadores, se cancela solo",
      "🔄 Torneos recurrentes: cada 1h, 2h, 4h, 8h, 12h, diarios y semanales",
      "⏳ Lobby: banner con countdown del próximo torneo programado",
      "🔄 Auto-creación del siguiente torneo al completarse el anterior",
    ]
  },
  // ═══ 3.1.0 — CEO ═══
  {
    version: "3.1.0",
    date: "2026-07-10",
    title: "👑 Programación de torneos en CEO Panel",
    scope: "ceo",
    changes: [
      "👑 CEO Panel: nuevo campo 'Programación' al crear torneos (recurrencia)",
      "📡 Endpoint /api/tournaments/next para consultar próximos torneos",
    ]
  },
  // ═══ 3.0.0 — GAME ═══
  {
    version: "3.0.0",
    date: "2026-07-10",
    title: "🏆 Torneos automáticos con bracket single-elimination",
    scope: "game",
    changes: [
      "🏆 Sistema de torneos automáticos con bracket single-elimination",
      "📝 Jugadores pueden inscribirse en torneos con fee de monedas",
      "🔀 Bracket generado automáticamente con seeds aleatorios",
      "🏆 Visualización de brackets en vivo con rondas y ganadores",
      "💰 Prize pool dinámico calculado automáticamente",
      "🔔 Notificaciones en tiempo real de avances de torneo via WebSocket",
    ]
  },
  // ═══ 2.5.0 — GAME ═══
  {
    version: "2.5.0",
    date: "2026-07-10",
    title: "🧹 Botón de cambios único + caché de versiones",
    scope: "game",
    changes: [
      "🧹 Eliminado botón de cambios duplicado dentro del formulario",
      "📋 Changelog cacheado: carga instantánea aunque el servidor esté reiniciando",
      "🔖 Versión 2.5.0 consolidada con todos los cambios de UX, bugs y mejoras",
    ]
  },
  // ═══ 2.5.0 — CEO ═══
  {
    version: "2.5.0",
    date: "2026-07-10",
    title: "👑 CEO Panel dinámico",
    scope: "ceo",
    changes: [
      "👑 CEO Panel: botón de versiones ahora muestra el número dinámico",
    ]
  },
  // ═══ 2.4.0 — GAME ═══
  {
    version: "2.4.0",
    date: "2026-07-10",
    title: "🐛 Corrección doble victoria + UI rediseñada",
    scope: "game",
    changes: [
      "🐛 Fix: el cartel de victoria ya no aparece dos veces cuando alguien gana",
      "🐛 Fix: los avatares y skins de dados se cargan siempre al empezar una revancha",
      "🐛 Fix: botón de notificaciones ahora cambia de estado visual correctamente",
      "🎨 Cerrar sesión movido a la topbar derecha junto a la tienda",
      "🎨 Notificaciones (campana) movidas a la topbar izquierda junto al avatar",
      "🎨 Barra PWA rediseñada: más chica, flotando abajo centrada",
      "🎨 Botón de cambios (changelog) movido abajo del formulario, centrado",
      "🔒 Volver al login solo visible para invitados",
    ]
  },
  // ═══ 2.3.0 — GAME ═══
  {
    version: "2.3.0",
    date: "2026-07-10",
    title: "🐛 Correcciones y mejoras de UX",
    scope: "game",
    changes: [
      "🔧 Versión dinámica: login y lobby muestran la versión actual automáticamente",
      "🐛 Fecha inválida reparada en historial de transacciones del perfil",
      "🧹 Cache local se limpia al detectar nueva versión del juego",
    ]
  },
  // ═══ 2.3.0 — CEO ═══
  {
    version: "2.3.0",
    date: "2026-07-10",
    title: "📋 Changelog completo en CEO Panel",
    scope: "ceo",
    changes: [
      "📋 CEO Panel: changelog ahora muestra TODAS las versiones (game + ceo)",
    ]
  },
  // ═══ 2.2.0 — GAME ═══
  {
    version: "2.2.0",
    date: "2026-07-09",
    title: "🎯 Sistema de versiones y cache busting",
    scope: "game",
    changes: [
      "📋 Botón de historial de cambios en el lobby con registro completo",
      "🧹 Cache automático: PWA y navegador cargan siempre la última versión",
    ]
  },
  // ═══ 2.2.0 — CEO ═══
  {
    version: "2.2.0",
    date: "2026-07-09",
    title: "📊 Analytics en CEO Panel",
    scope: "ceo",
    changes: [
      "🔬 Analytics con gráficos más grandes y heatmap de actividad",
    ]
  },
  // ═══ 2.1.0 — CEO ═══
  {
    version: "2.1.0",
    date: "2026-07-08",
    title: "👑 CEO Panel completo",
    scope: "ceo",
    changes: [
      "🏛️ CEO Panel con login independiente y dashboard de stats",
      "👥 Gestión de usuarios: banear, suspender, ajustar monedas",
      "💬 Feedback de jugadores con respuesta del admin",
      "📋 Audit log de todas las acciones del panel",
      "📧 Reporte semanal por email",
      "🛒 CRUD completo de items de la tienda desde el panel",
      "🔔 Push notifications con VAPID y broadcast masivo",
      "🔐 Roles de admin: Viewer, Editor y Admin con permisos graduales",
      "🔑 Reseteo de contraseña para usuarios y admins desde el panel",
      "🔍 Buscador de items en la pestaña Tienda del CEO Panel",
      "🔄 Limpieza automática de invitados fantasma",
      "👑 CEO Panel: crear torneos, generar brackets, avanzar matches",
      "📋 CEO Panel: pestaña de Torneos con CRUD completo",
      "📊 CEO Panel: estadísticas de torneos activos y completados",
      "🧹 Eliminados archivos basura (nul, server_log.txt)",
    ]
  },
  // ═══ 2.0.0 — GAME ═══
  {
    version: "2.0.0",
    date: "2026-07-07",
    title: "🎲 Rediseño total + Skins",
    scope: "game",
    changes: [
      "✨ Rediseño visual completo con tema oscuro premium",
      "🎨 Sistema de skins: 13 diseños de dados con efectos visuales",
      "👤 Avatares personalizados: 13 avatares únicos",
      "💎 Items especiales: Emotes VIP, Marco Premium, Nick Dorado y más",
      "🛒 Tienda con monedas virtuales",
      "🎯 Misiones diarias, semanales y logros",
      "🏆 Ranking global con puntuaciones",
      "👥 Amigos y chat global entre jugadores",
      "💬 Chat de voz (audio efímero) en partidas",
      "💰 Sistema de monedas con boost +50%",
      "🎁 Cofre diario con items ultra raros",
      "🏪 Compra de monedas vía Stripe y Mercado Pago",
    ]
  },
  // ═══ 1.0.0 — GAME ═══
  {
    version: "1.0.0",
    date: "2026-06-20",
    title: "🚀 Lanzamiento inicial",
    scope: "game",
    changes: [
      "🎲 Juego completo de 10.000 con dados realistas",
      "👥 Salas privadas de 2 a 10 jugadores",
      "🔌 WebSocket en tiempo real con reconexión automática",
      "📱 PWA instalable como app",
      "🔐 Registro y login con JWT",
      "🌙 Tema oscuro",
    ]
  },
];

// Dual-use: backend (Node.js) y frontend (browser)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { GAME_VERSION, CHANGELOG };
}
