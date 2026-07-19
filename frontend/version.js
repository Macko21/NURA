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

const GAME_VERSION = "3.7.7";

const CHANGELOG = [
  // ═══ 3.7.7 — GAME ═══
  {
    version: "3.7.7",
    date: "2026-07-19",
    title: "🔊 Volumen unificado + avatares en amigos + fix ocultar conexión",
    scope: "game",
    files: ["backend/server.js", "frontend/audio.js", "frontend/app.js", "frontend/index.html", "frontend/styles.css", "frontend/version.js"],
    changes: [
      "👤 Fix: amigos ahora muestran avatar (icono) o 👤 por defecto, no números",
      "🔒 Fix: toggle 'Ocultar última conexión' persiste correctamente con localStorage",
      "🎵 Volumen unificado: se quitó el flyout flotante, ahora todo se controla desde el slider en el menú del usuario (click en nombre)",
      "🔊 btn-music-toggle abre el menú de usuario con el slider de volumen",
      "🎮 btn-sound en partida: mute rápido de efectos",
      "🏠 btn-room-sound en sala espera: mute rápido de música",
      "🧹 CSS: eliminados estilos del flyout de sonido (sound-flyout)",
    ]
  },
  // ═══ 3.7.5 — GAME ═══
  {
    version: "3.7.5",
    date: "2026-07-18",
    title: "🎨 Bots con items de tienda + volumen en mobile",
    scope: "game",
    files: ["backend/botManager.js", "backend/botGameHandler.js", "frontend/audio.js"],
    changes: [
      "🎨 Bots ahora usan skins de dados, avatares y efectos especiales aleatorios de la tienda",
      "📢 Propaganda integrada: los jugadores ven items que pueden comprar al jugar contra bots",
      "📱 Fix: volumen de música ahora funciona en mobile y PWA — usa Web Audio API con GainNode",
    ]
  },
  // ═══ 3.7.4 — GAME ═══
  {
    version: "3.7.4",
    date: "2026-07-18",
    title: "🔊 Audio siempre activo + indicador visual de mute",
    scope: "game",
    files: ["frontend/audio.js", "frontend/app.js", "frontend/styles.css"],
    changes: [
      "🔊 Música y efectos arrancan automáticamente al hacer el primer click en el juego",
      "🔇 Indicador visual de mute: línea roja cruzada sobre el botón cuando está desactivado",
      "🎚️ Sliders de volumen siempre visibles al presionar el botón de sonido",
      "🗑️ Ya no se persiste el estado mute — siempre arranca con sonido activo",
    ]
  },
  // ═══ 3.7.3 — GAME ═══
  {
    version: "3.7.3",
    date: "2026-07-18",
    title: "🔊 Audio con mp3 reales + panel de sonido unificado",
    scope: "game",
    files: ["frontend/sounds/*", "frontend/audio.js", "frontend/app.js", "frontend/index.html", "frontend/styles.css"],
    changes: [
      "🎵 Música real en mp3: principal.mp3 (navegación), lobby.mp3 (sala espera), partida.mp3 (juego)",
      "💀 game-over.mp3 real cuando perdés contra bots",
      "🔊 Botón único de sonido en la partida → al clickearlo se despliega un flyout",
      "🎚️ Flyout con dos sliders de volumen: uno para Música y otro para Efectos",
      "🔇 Botón mute individual para cada canal (música y efectos por separado)",
      "🧹 Eliminados los sonidos sintetizados de música — ahora todo suena con mp3 reales"
    ]
  },
  // ═══ 3.7.2 — GAME ═══
  {
    version: "3.7.2",
    date: "2026-07-18",
    title: "🔊 Sistema de audio rediseñado + tutorial corregido",
    scope: "game",
    files: ["frontend/audio.js", "frontend/app.js", "frontend/index.html", "frontend/styles.css", "frontend/version.js"],
    changes: [
      "🔊 Música y SFX ahora tienen controles separados: podés silenciar la música o los efectos de forma independiente",
      "🎵 Tema principal (principal.mp3 sintetizado): suena en lobby, tienda, portal, perfil y ranking — con volumen ajustable",
      "🎵 Música de sala de espera (lobby.mp3): solo suena en la sala de espera (screen-room) y al volver de revancha",
      "🎵 Música de partida suave (partida.mp3): ambiente bajito para que se escuchen bien los dados, controles separados en el juego",
      "💀 Sonido de game-over: se reproduce cuando perdés contra bots",
      "📖 Tutorial corregido: escaleras 1-2-3-4-5, 2-3-4-5-6 y 1-3-4-5-6 dan 500 pts + dados calientes (no 3.000 pts)",
      "📖 Hot dice funciona aunque hayas tirado 3 veces — ahora explicado correctamente",
      "🔇 Dos botones en la pantalla de juego: 🎵 (música on/off) y 🔊 (efectos on/off)"
    ]
  },
  // ═══ 3.7.1 — GAME ═══
  {
    version: "3.7.1",
    date: "2026-07-18",
    title: "🐛 Fix bots, música de partida y tutorial",
    scope: "game",
    files: ["backend/diceManager.js", "backend/server.js", "frontend/audio.js", "frontend/index.html", "frontend/styles.css", "frontend/app.js"],
    changes: [
      "🤖 Fix: los bots ahora juegan automáticamente — se agregó callback en cada cambio de turno",
      "🎵 Fix: música de partida cambiada a un ambiente sutil y relajante (ondas senoidales suaves)",
      "📖 Fix: tutorial corregido — dice 'Tirá los 5 dados' (antes decía 6)",
      "🔇 Nuevo: botón de silenciar música durante la partida (al lado de Salir)",
    ]
  },
  // ═══ 3.7.0 — GAME ═══
  {
    version: "3.7.0",
    date: "2026-07-18",
    title: "🤖 Partidas contra bots + Música ambiente + Sonido mejorado",
    scope: "game",
    files: ["backend/botManager.js", "backend/botGameHandler.js", "backend/server.js", "backend/matchState.js", "backend/diceManager.js", "frontend/index.html", "frontend/app.js", "frontend/styles.css", "frontend/audio.js"],
    changes: [
      "🤖 Jugar contra bots: hasta 5 oponentes con 3 niveles de dificultad (Fácil/Normal/Difícil)",
      "🎵 Música ambiente para las pantallas de Perfil, Portal Social y Ranking",
      "🔊 Slider de volumen para la música en el menú de usuario",
      "🖱️ Efectos de sonido al hacer click en botones y hover en el menú principal",
      "🤔 Indicadores visuales en el marcador cuando un bot está pensando o jugando",
      "🎮 Los bots tienen nombres temáticos (🤖 Tron, ⚡ Byte, 🎲 D20, etc.)"
    ]
  },
  // ═══ 3.6.3 — GAME ═══
  {
    version: "3.6.3",
    date: "2026-07-16",
    title: "🔔 Notificaciones, perfil y actualización real",
    scope: "game",
    files: ["backend/database.js", "backend/server.js", "backend/pushManager.js", "backend/playerManager.js", "backend/authManager.js", "frontend/index.html", "frontend/app.js", "frontend/styles.css", "frontend/sw.js"],
    changes: [
      "🔔 Push se configura automáticamente y conserva sus claves en la base de datos",
      "🧹 Notificaciones vencen en 24 h y las invitaciones se borran al aceptar o rechazar",
      "📊 Estadísticas, ranking y misiones usan progreso real y actualizaciones seguras",
      "🛍️ Los artículos comprados pueden aplicarse y los efectos pertenecen al jugador correcto",
      "🔄 Actualizar instala la versión nueva y después abre sus notas",
      "👤 Menú de usuario desplegable, inventario compacto y perfil con mejor separación",
      "🎁 Cuenta regresiva del cofre más clara en escritorio, tablet y móvil",
      "💬 El Portal Social conserva los últimos dos días en su limpieza semanal"
    ]
  },
  // ═══ 3.6.2 — GAME ═══
  {
    version: "3.6.2",
    date: "2026-07-16",
    title: "🎲 Reglas restauradas + revancha, identidad y cosméticos",
    scope: "game",
    files: ["backend/gameEngine.js", "backend/diceManager.js", "backend/server.js", "frontend/app.js", "frontend/dice-renderer.js", "frontend/audio.js"],
    changes: [
      "🎯 Cinco 6 vuelven a valer 6600; no existe la jugada de 7000 puntos",
      "🚪 Entrar consume exactamente 1000 puntos y conserva solo el excedente",
      "🔥 Dados calientes pueden encadenarse y muestran el total 1,6s antes de anotarlo",
      "🔄 Revancha usa un solo cartel y restaura siempre el botón Estoy listo",
      "👤 Crear/unirse recupera la identidad autenticada sin exigir nombre de invitado",
      "🎨 Dados y avatares usan los cosméticos del jugador correcto, incluidos los Ultra",
      "🔔 El interruptor push refleja y conserva la suscripción real del navegador"
    ]
  },
  // ═══ 3.6.1 — GAME ═══
  {
    version: "3.6.1",
    date: "2026-07-16",
    title: "🔔 Push invite + fijar puntaje 7000 + leave delegar + avatar init",
    scope: "game",
    files: ["frontend/app.js", "frontend/sw.js", "backend/server.js", "backend/pushManager.js", "backend/gameEngine.js"],
    changes: [
      "🔔 Fix: invitación push desde OS tray ahora funciona (WS offline → push notification)",
      "🎲 Fix: puntaje máximo 7000 (5 seis = 7000, antes 6600)",
      "🚪 Fix: dueño puede salir de sala sin cancelarla (delega al siguiente)",
      "👤 Fix: avatar/skin cargado al primer ingreso (loadEquippedItems en IDENTIFIED)",
      "📩 Fix: GAME_INVITE_ACCEPT con connection guard y playerId/playerName",
      "🛡️ macko_equipped preservado en cache busting",
    ]
  },
  // ═══ 3.6.0 — GAME ═══
  {
    version: "3.6.0",
    date: "2026-07-16",
    title: "🐛 Bugfixes masivos: tienda, login, sala, victoria + revancha",
    scope: "game",
    files: ["frontend/app.js", "backend/server.js", "backend/database.js", "backend/diceManager.js", "backend/gameEngine.js", "backend/roomManager.js"],
    changes: [
      "🛒 Fix: items comprados ahora aparecen como 'Tuyo' (IDs inconsistentes entre BD y catálogo)",
      "🔐 Fix: login 'debe ingresar un nombre' — helper getPlayerName() con fallbacks robustos",
      "🏆 Fix: doble cartel de victoria al terminar la partida (flags _winShown/_gameOverShown)",
      "🎲 Fix: error 'recoger recompensa' no crashea la pantalla de victoria (try/catch)",
      "🔄 Fix: revancha funcionando correctamente (PLAY_AGAIN con flag _rematchInProgress)",
      "👑 Fix: al irse el creador, el dueño se reasigna al siguiente jugador",
      "💰 Fix: cuatro 1s ahora dan 1100 puntos (no 2000)",
      "⚡ Fix: auto-bank instantáneo (sin delay de 1.5s)",
      "🔧 Fix: safePlayerName en JOIN_ROOM del server",
      "🧹 Código muerto eliminado (_lastRoomData)",
    ]
  },
  // ═══ 3.5.0 — GAME ═══
  {
    version: "3.5.0",
    date: "2026-07-11",
    title: "🎮 Auto-roll por timeout + XP no-lineal + UX mejorada",
    scope: "game",
    files: ["frontend/app.js", "backend/diceManager.js", "backend/matchState.js", "backend/database.js", "frontend/index.html", "frontend/styles.css"],
    changes: [
      "🎲 Timeout: auto-tira dados en vez de saltar turno",
      "❤️ Sistema de 5 vidas: 0 vidas = eliminado de la partida",
      "📈 XP no-lineal: niveles altos requieren mucho más XP",
      "🏆 Perfil muestra progreso de XP al siguiente nivel",
      "⏳ Botón listo: sin countdown, muestra Esperando + Salir",
      "📋 Changelog: CEO ve archivos modificados por versión",
    ]
  },
  // ═══ 3.4.5 — GAME ═══
  {
    version: "3.4.5",
    date: "2026-07-11",
    title: "🚨 Fix: syntax error login",
    scope: "game",
    files: ["frontend/app.js"],
    changes: [
      "🔧 Fix: sendRecoveryEmail faltaba cerrar la función (stray brace fix anterior la rompió)",
    ]
  },
  // ═══ 3.4.4 — GAME ═══
  {
    version: "3.4.4",
    date: "2026-07-11",
    title: "🔧 Fix: openItemPreview + sintaxis",
    scope: "game",
    files: ["frontend/app.js"],
    changes: [
      "🔧 Fix: preview de tienda roto por syntax error (stray closing brace al final de app.js)",
      "🔧 Fix: doble punto y coma eliminado",
      "🐛 Fix: chat/invitaciones no funcionaban por falta de connect() post-login",
      "🐛 Fix: chat privado perdia mensajes al cambiar de amigo (type mismatch object/array)",
    ]
  },
  // ═══ 3.4.3 — GAME ═══
  {
    version: "3.4.3",
    date: "2026-07-11",
    title: "🔧 Fix: preview de tienda corregido",
    scope: "game",
    files: ["frontend/app.js"],
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
    files: ["frontend/app.js", "frontend/styles.css"],
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
