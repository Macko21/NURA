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

const GAME_VERSION = "3.0.0";

const CHANGELOG = [
  // scope: 'game' = visible para jugadores, 'ceo' = solo CEO Panel, 'all' = ambos
  {
    version: "3.0.0",
    date: "2026-07-10",
    title: "🏆 Torneos automáticos + CEO Panel expandido",
    scope: "all",
    changes: [
      "🏆 Sistema de torneos automáticos con bracket single-elimination",
      "📝 Jugadores pueden inscribirse en torneos con fee de monedas",
      "🔀 Bracket generado automáticamente con seeds aleatorios",
      "👑 CEO Panel: crear torneos, generar brackets, avanzar matches",
      "🏆 Visualización de brackets en vivo con rondas y ganadores",
      "💰 Prize pool dinámico calculado automáticamente",
      "📋 CEO Panel: pestaña de Torneos con CRUD completo",
      "🔔 Notificaciones en tiempo real de avances de torneo via WebSocket",
      "📊 CEO Panel: estadísticas de torneos activos y completados",
      "🧹 Eliminados archivos basura (nul, server_log.txt)",
    ]
  },
  {
    version: "2.5.0",
    date: "2026-07-10",
    title: "🧹 Botón de cambios único + CEO Panel dinámico",
    scope: "game",
    changes: [
      "🧹 Eliminado botón de cambios duplicado dentro del formulario (se queda solo el de afuera)",
      "📋 Changelog cacheado: carga instantánea aunque el servidor esté reiniciando",
      "👑 CEO Panel: botón de versiones ahora muestra el número dinámico (no más hardcode v2.3.0)",
      "🔖 Versión 2.5.0 consolidada con todos los cambios de UX, bugs y mejoras",
    ]
  },
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
  {
    version: "2.3.0",
    date: "2026-07-10",
    title: "🐛 Correcciones y mejoras de UX",
    scope: "game",
    changes: [
      "🔧 Versión dinámica: login y lobby muestran la versión actual automáticamente",
      "🐛 Fecha inválida reparada en historial de transacciones del perfil",
      "🧹 Cache local se limpia al detectar nueva versión del juego",
      "📋 Changelog del CEO Panel ahora muestra TODAS las versiones (game + ceo)",
    ]
  },
  {
    version: "2.2.0",
    date: "2026-07-09",
    title: "🎯 Sistema de versiones y cache busting",
    scope: "game",
    changes: [
      "📋 Botón de historial de cambios en el lobby con registro completo",
      "🧹 Cache automático: PWA y navegador cargan siempre la última versión",
      "🔬 Analytics con gráficos más grandes y heatmap de actividad",
    ]
  },
  {
    version: "2.1.0",
    date: "2026-07-08",
    title: "👑 Mejoras internas",
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
      "🔑 Reseteo de contraseña para usuarios y admines desde el panel",
      "🔍 Buscador de items en la pestaña Tienda del CEO Panel",
      "🔄 Limpieza automática de invitados fantasma",
    ]
  },
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
      "🏪 Compra de monedas vía Stripe y Mercado Pago"
    ]
  },
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
      "🌙 Tema oscuro"
    ]
  }
];

// Dual-use: backend (Node.js) y frontend (browser)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { GAME_VERSION, CHANGELOG };
}
