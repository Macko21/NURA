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

const GAME_VERSION = "3.4.3";

const CHANGELOG = [
  // ═══ 3.4.3 — GAME ═══
  {
    version: "3.4.3",
    date: "2026-07-11",
    title: "🔧 Fix: preview de tienda corregido",
    scope: "game",
    changes: [
      "🔧 Fix: openItemPreview no estaba definida por cache stale del Service Worker",
      "✨ Función ahora se declara globalmente para máxima compatibilidad",
    ]
  },
  // ═══ 3.4.2 — GAME ═══
  {

    version: "3.4.2",
    date: "2026-07-11",
    title: "🖱️ Preview en tienda + Misiones diarias corregidas",
    scope: "game",
    changes: [
      "🖱️ Click en cualquier item de la tienda para ver preview",
      "🎲 Preview de dados: todos los estados (sin puntuar, en juego, sumando, dados calientes)",
      "👤 Preview de avatares en tamaño grande",
      "✨ Preview de items especiales con descripción del efecto",
      "📅 Misiones diarias se reinician a la medianoche (00:00)",
      "📅 Misiones semanales se reinician los lunes",
    ]
  },
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
    title: "🎲 Preview de dados en tienda + Protección anti-spam",
    scope: "game",
    changes: [
      "🎲 Tienda: preview visual de dados con todos los estados del juego",
      "📦 Juego más liviano y rápido con código optimizado",
      "🔒 Protección contra spam en tienda, feedback y torneos",
      "🐛 Varios bugs corregidos",
    ]
  },
  // ═══ 3.4.0 — CEO ═══
  {
    version: "3.4.0",
    date: "2026-07-11",
    title: "🔧 Mejoras CEO Panel",
    scope: "ceo",
    changes: [
      "🔧 CEO Panel: login JWT implementado correctamente",
      "🧹 Eliminados scripts temporales",
    ]
  },
  // ═══ 3.3.0 — GAME ═══
  {
    version: "3.3.0",
    date: "2026-07-09",
    title: "🐛 Fix chat + mejoras",
    scope: "game",
    changes: [
      "Fix: chat no funcionaba después de iniciar sesión",
      "Fix: invitaciones a partidas no se recibían",
      "Fix: mensajes privados se perdían al cambiar de chat",
      "Búsqueda optimizada en el portal",
      "Límite de mensajes en chat para mejor rendimiento",
    ]
  },
  // ═══ 3.2.0 — GAME ═══
  {
    version: "3.2.0",
    date: "2026-07-10",
    title: "🔔 Notificaciones + Amistad + Invitaciones",
    scope: "game",
    changes: [
      "Centro de notificaciones con panel deslizante",
      "Push notifications activables desde el juego",
      "Solicitudes de amistad con aceptar/rechazar",
      "Invitaciones a partidas desde el buscador",
      "Notificaciones del CEO en tiempo real",
      "Fix: tienda mostraba items comprados incorrectamente",
      "Fix: diseño del inventario mejorado",
      "Fix: fechas incorrectas en notificaciones",
      "Notificaciones de torneos para participantes",
    ]
  },
  // ═══ 3.1.0 — GAME ═══
  {
    version: "3.1.0",
    date: "2026-07-10",
    title: "⏰ Torneos automáticos programados",
    scope: "game",
    changes: [
      "⏰ Torneos con inicio automático cuando vence la inscripción",
      "❌ Cancelación automática si no hay suficientes jugadores",
      "🔄 Torneos recurrentes: cada 1h, 2h, 4h, 8h, 12h o diarios",
      "⏳ Banner con cuenta regresiva del próximo torneo",
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
    title: "🏆 Torneos automáticos con bracket",
    scope: "game",
    changes: [
      "🏆 Sistema de torneos con bracket single-eliminación",
      "📝 Inscripción con fee de monedas",
      "🔀 Brackets generados automáticamente",
      "👀 Visualización de brackets en vivo",
      "💰 Premios calculados automáticamente",
      "🔔 Notificaciones en tiempo real de avances",
    ]
  },
  // ═══ 2.5.0 — GAME ═══
  {
    version: "2.5.0",
    date: "2026-07-10",
    title: "🧹 Botón de cambios único + caché",
    scope: "game",
    changes: [
      "🧹 Botón de cambios más limpio y ordenado",
      "📋 Historial de versiones con carga instantánea",
      "🔖 Múltiples mejoras de UX",
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
    title: "🐛 Fix doble victoria + UI renovada",
    scope: "game",
    changes: [
      "🐛 Fix: cartel de victoria ya no aparece dos veces",
      "🐛 Fix: avatares y skins se cargan siempre en revanchas",
      "🎨 Diseño mejorado de la interfaz del lobby",
      "🎨 Barra PWA rediseñada más compacta",
      "🔒 Botón volver al login solo para invitados",
    ]
  },
  // ═══ 2.3.0 — GAME ═══
  {
    version: "2.3.0",
    date: "2026-07-10",
    title: "🐛 Correcciones de UX",
    scope: "game",
    changes: [
      "🔧 Versión actual mostrada automáticamente en el lobby",
      "🐛 Fechas correctas en historial de transacciones",
      "🧹 Cache local se limpia al actualizar el juego",
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
    title: "📋 Historial de cambios",
    scope: "game",
    changes: [
      "📋 Botón con historial completo de cambios del juego",
      "🧹 Cache automático para siempre tener la última versión",
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
      "🎨 13 skins de dados con efectos visuales únicos",
      "👤 13 avatares personalizados",
      "💎 Items especiales: Emotes VIP, Marco Premium, Nick Dorado",
      "🛒 Tienda con monedas virtuales",
      "🎯 Misiones diarias y logros",
      "🏆 Ranking global",
      "👥 Amigos y chat global",
      "💬 Chat de voz en partidas",
      "💰 Sistema de monedas con boost",
      "🎁 Cofre diario con items raros",
      "🏪 Compra de monedas vía Stripe y Mercado Pago",
    ]
  },
  // ═══ 1.0.0 — GAME ═══
  {
    version: "1.0.0",
    date: "2026-06-20",
    title: "🚀 Lanzamiento",
    scope: "game",
    changes: [
      "🎲 Juego completo de 10.000",
      "👥 Salas de 2 a 10 jugadores",
      "🔌 Conexión en tiempo real",
      "📱 App instalable (PWA)",
      "🔐 Registro e inicio de sesión",
      "🌙 Tema oscuro",
    ]
  },
];

// Dual-use: backend (Node.js) y frontend (browser)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { GAME_VERSION, CHANGELOG };
}
