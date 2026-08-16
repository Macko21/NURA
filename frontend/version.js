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

const GAME_VERSION = "4.11.0";

const CHANGELOG = [
  {
    version: "4.11.0",
    date: "2026-08-16",
    title: "🔧 UI limpieza y fixes",
    scope: "ui",
    files: ["index.html", "styles.css", "app.js"],
    changes: [
      "🔧 FIX: la visibilidad Privada/Pública ahora solo aparece en los modales de Crear Sala y Jugar vs Bots",
      "🔧 FIX: el flotante de instalación PWA ya no tapa el menú inferior",
      "🧹 LIMPIEZA: se removió el toggle de visibilidad del menú principal del lobby",
      "📱 PWA: barra de instalación reposicionada para mejor UX"
    ]
  },
  {
    version: "4.10.0",
    date: "2026-08-15",
    title: "💰 Apuestas entre jugadores",
    scope: "game",
    files: ["roomManager.js", "server.js", "app.js", "index.html", "styles.css"],
    changes: [
      "💰 APUESTAS: elegí un monto antes de empezar la partida (0, 100, 200, 500, 1000, 2000, 5000 🪙)",
      "💰 POT: se muestra el total apostado por todos los jugadores en la sala de espera",
      "🏆 GANADOR: el ganador se lleva el pot completo (menos 10% de comisión)",
      "✔ CONFIRMACIÓN: cada jugador debe confirmar su apuesta antes de que empiece la partida",
      "🔒 ANTI-CHEAT: validación server-side de monedas, monto máximo 5000, límites estrictos",
      "📱 UI: sección de apuestas en sala de espera con presets y estado de cada jugador",
      "🔔 NOTIFICACION: toast cuando alguien gana la apuesta y cuando se completa el pot"
    ]
  },
  {
    version: "4.9.1",
    date: "2026-08-15",
    title: "✨ Tablero animado de fondo",
    scope: "game",
    files: ["app.js", "index.html", "styles.css"],
    changes: [
      "✨ FONDO ANIMADO: partículas flotantes sutiles sobre el tablero de juego",
      "🎨 MODO IDLE: partículas azules suaves cuando no es tu turno",
      "🎮 MODO MI TURNO: partículas cyan más brillantes cuando jugás",
      "🔥 MODO HOT DICE: partículas doradas cuando tenés dados calientes",
      "🔴 MODO TENSIÓN: partículas rojas cuando superás 9.000 puntos",
      "⚡ PERFORMANCE: canvas ligero con requestAnimationFrame, auto-limpieza al salir"
    ]
  },
  {
    version: "4.9.0",
    date: "2026-08-15",
    title: "🎯 Desafío Diario con ranking",
    scope: "game",
    files: ["database.js", "server.js", "app.js", "index.html", "styles.css"],
    changes: [
      "🎯 DESAFÍO DIARIO: cada día hay un desafío nuevo con nombre y temática única",
      "🤖 PARTIDA SOLO: jugás contra 1 bot fácil para lograr el mejor puntaje",
      "🏆 RANKING DIARIO: leaderboard de todos los jugadores del día con mejores puntajes",
      "💰 RECOMPENSA: 500 monedas al completar el desafío (llegar a 10.000)",
      "📊 MI MEJOR: tu mejor puntaje del día se guarda y muestra en el modal",
      "🎨 8 TEMAS: Fuego y Hielo, Supervivencia, Relámpago, Dados Locos, Monte Callejero, Amanecer, Marea Alta, Eclipse Total",
      "📅 DETERMINISTICO: todos los jugadores ven el mismo desafío cada día"
    ]
  },
  {
    version: "4.8.5",
    date: "2026-08-15",
    title: "🎮 Power-ups comprables en partida",
    scope: "game",
    files: ["diceManager.js", "server.js", "app.js", "index.html", "styles.css"],
    changes: [
      "🛡️ SEGURO (300 🪙): si tirás muerto, no perdés el turno — el seguro se consume y seguís",
      "🎲 DADO EXTRA (200 🪙): tirás 6 dados en vez de 5 para este turno",
      "🔮 MIRAR FUTURO (400 🪙): ves qué vas a sacar antes de decidir",
      "💰 Se compran con monedas del jugador durante la partida",
      "🔒 Anti-cheat: validación server-side de monedas y estado del turno",
      "📱 UI: barra de power-ups con botones que se deshabilitan si no hay monedas o no es tu turno",
      "✨ Toast visual cuando se activa un power-up"
    ]
  },
  {
    version: "4.8.4",
    date: "2026-08-15",
    title: "💬 Emotes reactivos en partida",
    scope: "game",
    files: ["server.js", "app.js", "index.html", "styles.css"],
    changes: [
      "💬 EMOTES: botón 💬 en la barra de juego que abre un picker con 8 emojis",
      "💬 BUBBLE: el emote aparece como burbuja flotante sobre el avatar del jugador",
      "💬 ANIMACIÓN: bounce al aparecer + float hacia arriba + fade out en 3 segundos",
      "🔒 ANTI-SPAM: cooldown de 2 segundos entre emotes por jugador en el backend",
      "🌍 SYNC: todos los jugadores de la sala ven los emotes en tiempo real",
      "8 EMOTES: 😂 🔥 💀 😱 🏆 👏 🤬 😈"
    ]
  },
  {
    version: "4.8.3",
    date: "2026-08-15",
    title: "💥 Flash overlays y screen shake mejorado",
    scope: "game",
    files: ["dice-renderer.js", "styles.css", "app.js"],
    changes: [
      "💥 FLASH ROJO: overlay rojo fullscreen al tirar muerto o pasarte — TODO el mundo lo ve",
      "🏆 FLASH DORADO: overlay dorado brillante al ganar — celebración visual inmediata",
      "🔥 HOT FLASH MEJORADO: borde dorado + glow intenso en la bandeja de dados",
      "📱 SCREEN SHAKE: ahora visible para TODOS los jugadores (espectadores incluidos)",
      "⚡ TIMEOUT: auto-tirada muerta/bust también tiene flash + shake + reset combo",
      "💪 SHAKE INTENSO: victoria usa shake más fuerte (.6s) para máxima dramatización"
    ]
  },
  {
    version: "4.8.2",
    date: "2026-08-15",
    title: "🔥 Combo counter — rachas de turnos ganadores",
    scope: "game",
    files: ["matchState.js", "diceManager.js", "app.js", "index.html", "styles.css"],
    changes: [
      "🔥 COMBO: counter visual que aparece cuando anotás 2+ turnos seguidos — todos los jugadores lo ven",
      "🔥 COMBO x2: borde naranja con fuego 🔥 — primer nivel de combo",
      "🔥 COMBO x3+: borde rojo intenso con fuego 🔥🔥 — modo caliente",
      "⚡ MEGACOMBO x5+: borde dorado brillante con rayo ⚡ — máxima adrenalina",
      "💥 POP: animación de crecimiento al incrementar el combo",
      "🔄 RESET: el combo se pierde al tirar muerto o pasarse de 10.000",
      "🎯 BACKEND: tracking de combo por jugador en matchState + envío en eventos BANKED/DEAD_ROLL/BUST"
    ]
  },
  {
    version: "4.8.1",
    date: "2026-08-15",
    title: "🎲 Dados dramáticos con tensión y efectos de impacto",
    scope: "game",
    files: ["dice-renderer.js", "styles.css", "app.js"],
    changes: [
      "🎲 ANIMACIÓN: dados caen uno por uno con delay escalonado exponencial — los primeros son rápidos, los últimos tardan más para generar tensión",
      "🎲 WOBBLE: el último dado tiene una animación de balanceo más larga antes de asentarse (tipo tragamenedas)",
      "💥 SCREEN SHAKE: la pantalla se sacude al tirar muerto (farkle) o pasarte de 10.000 — feedback táctil del error",
      "✨ FLASH DORADO: la bandeja de dados brilla al recibir dados calientes — señal visual de éxito",
      "🔴 MODO TENSO: cuando tu puntaje supera 9.000, el borde del tablero pulsa en rojo — todos ven que estás cerca de ganar",
      "🎯 LAND: dados tienen un mini-impacto al aterrizar para sensación de peso"
    ]
  },
  {
    version: "4.8.0",
    date: "2026-08-15",
    title: "🎲 Dados 2D puros + fixes de estabilidad",
    scope: "game",
    files: ["app.js", "dice-renderer.js", "styles.css", "index.html", "sw.js", "server.js", "diceManager.js"],
    changes: [
      "🎲 DADOS: eliminado el modo 3D completo — ahora el juego usa exclusivamente dados 2D SVG con skins",
      "🧹 LIMPIEZA: removido selector de calidad, canvas 3D, vendor Three.js y cache del Service Worker",
      "🐛 FIX: constante XP_PER_STREAK_WIN declarada (causaba ReferenceError post-victoria)",
      "🛡️ FIX: onMatchWon garantiza GAME_OVER aunque falle pre-broadcast",
      "🛡️ FIX: _advanceTurn termina partida si todos quedan eliminados",
      "📱 FIX: flags _winShown/_gameOverShown reseteados al iniciar partida nueva"
    ]
  },
  {
    version: "4.7.0",
    date: "2026-08-02",
    title: "🔄 Partidas estables, acceso seguro y dados renovados",
    scope: "game",
    files: [
      "authManager.js", "emailManager.js", "database.js", "server.js",
      "roomManager.js", "matchState.js", "diceManager.js", "playerManager.js",
      "botManager.js", "botGameHandler.js", "app.js", "index.html",
      "reset-password.html", "dice-renderer.js", "dice-renderer-3d.mjs",
      "styles.css", "sw.js"
    ],
    changes: [
      "🔄 CONEXIÓN: las partidas conservan el lugar durante suspensiones largas y permiten volver sin quedar afuera",
      "🎲 REVANCHA: el botón vuelve a responder siempre y la sala se recupera sin depender de una segunda respuesta de red",
      "➕ INGRESO TARDÍO: cualquier jugador puede entrar a una partida empezada mientras todavía haya cupo",
      "🔐 REGISTRO: la cuenta sólo se crea después de validar el código de 6 dígitos enviado por email",
      "📧 RECUPERACIÓN: el enlace para cambiar la contraseña vuelve a enviarse, vence en una hora y reporta fallos reales del correo",
      "🛡️ SESIÓN: el acceso registrado dura 30 días y la configuración de email quedó unificada y protegida",
      "✨ DADOS: el selector ahora ofrece sólo 2D clásico o 3D mejorado, con animación más rápida, más brillo y colores vivos",
      "🤖 BOTS: los rivales automáticos eligen avatares visuales válidos de forma estable",
      "🧪 CALIDAD: reglas, servidor, sintaxis y empaquetado móvil fueron verificados automáticamente"
    ]
  },
  {
    version: "4.6.5",
    date: "2026-07-26",
    title: "🎲 Skins nítidas y acceso sin bloqueos",
    scope: "game",
    files: ["dice-renderer-3d.mjs", "app.js", "styles.css", "index.html"],
    changes: [
      "🎨 DADOS 3D: iconos más grandes, colores vivos y el mismo brillo antes y después de entrar",
      "🟢 PUNTOS: los dados que suman usan puntos verdes; los calientes, puntos dorados bien contrastados",
      "✨ SEÑAL: el brillo de estado queda pegado debajo del dado y ya no parece un aro flotante",
      "📱 MISIONES: en PWA vuelve el botón compacto; el cobro rápido permanece en desktop",
      "🔐 ACCESO: invitados e inicio de sesión dejan de compartir bloqueos por intentos",
      "🔄 PWA: una sesión invitada se recupera automáticamente al cerrar y volver a abrir"
    ]
  },
  {
    version: "4.6.4",
    date: "2026-07-25",
    title: "🎯 Puntos adaptativos sin alterar las skins",
    scope: "game",
    files: ["dice-renderer-3d.mjs", "dice-renderer.js"],
    changes: [
      "🎨 SKINS: los dados conservan su color y diseño original, sin tintes opacos ni marcos",
      "🎯 PUNTOS: los puntos que suman cambian a un color luminoso de alto contraste",
      "🧟 ADAPTATIVO: una skin verde usa puntos magenta; las skins doradas calientes usan rojo",
      "💡 SEÑAL: una base luminosa fina debajo del dado ayuda a identificarlo sin taparlo"
    ]
  },
  {
    version: "4.6.3",
    date: "2026-07-25",
    title: "💡 Marcos LED clásicos y skins siempre brillantes",
    scope: "game",
    files: ["dice-renderer-3d.mjs", "dice-renderer.js"],
    changes: [
      "🟢 PUNTOS: los dados que suman ahora llevan un marco LED verde sólido, sin bordes blancos",
      "🟡 CALIENTES: el marco cambia a dorado intenso y el dado toma un tono cálido",
      "🎨 COLOR: el dado puntuable también recibe color, manteniendo visible el icono de su skin",
      "✨ SIN ENTRAR: los dados conservan el mismo brillo y color antes de que el jugador entre"
    ]
  },
  {
    version: "4.6.2",
    date: "2026-07-25",
    title: "✨ Dados más vivos, misiones rápidas y PWA estable",
    scope: "game",
    files: ["dice-renderer-3d.mjs", "app.js", "styles.css", "index.html", "sw.js"],
    changes: [
      "🎲 DADOS 3D: skins más luminosas, nítidas y sin el aspecto de vidrio oscuro",
      "🟢 PUNTOS: bordes verdes mucho más visibles; los dados calientes brillan en dorado",
      "🎯 MISIONES: las diarias se pueden cobrar desde la vista principal y tienen acceso a todas las misiones",
      "🔄 PWA: al reabrir se sincronizan saldo, inventario y misiones sin cerrar sesión",
      "📲 ACTUALIZACIÓN: el aviso «Actualizar ahora» aparece al detectar una versión nueva"
    ]
  },
  {
    version: "4.6.1",
    date: "2026-07-25",
    title: "🔐 Corrección de sesión al abrir el juego",
    scope: "game",
    files: ["app.js", "version.js", "sw.js", "index.html"],
    changes: [
      "🔐 SESIÓN: el juego comprueba el acceso antes de cargar el lobby",
      "🪙 DATOS: monedas, misiones, inventario, cofre y notificaciones dejan de fallar en cadena",
      "🔄 RECUPERACIÓN: una sesión vencida vuelve al ingreso una sola vez, sin bucles de reconexión"
    ]
  },
  {
    version: "4.6.0",
    date: "2026-07-25",
    title: "🎮 Partidas más estables y dados 3D renovados",
    scope: "game",
    files: ["app.js", "dice-renderer-3d.mjs", "dice-renderer.js", "styles.css", "index.html"],
    changes: [
      "🔄 CONEXIÓN: reconexión más estable al volver a la PWA y entre partidas consecutivas",
      "🎲 PARTIDAS: ahora podés salir, crear, unirte y jugar otra vez sin reiniciar la app",
      "🛒 TIENDA: carga más confiable y botón para reintentar si la red tarda",
      "✨ DADOS 3D: más color, brillo y señales claras para puntos y dados calientes",
      "👤 JUGADORES: tarjetas más amplias con nivel real y rango",
      "📢 ENTRADA: el aviso de entrada aparece debajo de las acciones de juego"
    ]
  },
  {
    version: "4.5.1",
    date: "2026-07-23",
    title: "🎲 Fix: rotaciones 3D correctas + entrada termina el turno",
    scope: "game",
    files: ["dice-renderer-3d.mjs", "dice-renderer.js", "diceManager.js", "version.js", "index.html"],
    changes: [
      "🎲 3D FIX: targetQuaternion corregido (rotaciones de caras apuntaban a valores incorrectos)",
      "🎲 3D GLOW: materialsFor restaurado con brillo emissivo verde/dorado según estado",
      "🎲 CACHE: _3D_CACHE_BUST para forzar recarga del módulo 3D",
      "🎮 ENTRY: al entrar el turno termina y pasa al siguiente (vuelve _advanceTurn)",
      "📢 BANNER: mensaje cambiado a 'en tu próximo turno sumás'",
      "📦 VERSION: bump a 4.5.1 para limpiar cache del navegador"
    ]
  },
  {
    version: "4.5.0",
    date: "2026-07-23",
    title: "🎨 Fix visual: dados 3D blancos, skins pre-entry, shop PWA y perfil",
    scope: "game",
    files: ["dice-renderer-3d.mjs", "dice-renderer.js", "app.js", "styles.css"],
    changes: [
      "🎲 3D FIX: DataTexture→CanvasTexture (datos no se subían a GPU, dados siempre blancos)",
      "🎲 3D FIX: emissiveMap restaurado para estados normales, desactivado en dead",
      "🎲 SKINS PRE-ENTRY: Dados en dead ahora muestran la skin del jugador grisada con ícono",
      "🎲 shadeColor(): helper para oscurecer colores hex en estado dead",
      "🛒 SHOP PWA: max-height:90vh + overflow scroll para tienda y tabs",
      "📖 RULES MODAL: 85dvh, sticky footer, padding reducido en mobile",
      "👤 PERFIL: eliminado doble render de loadInventoryData (flicker + error consumibles)",
      "👤 PERFIL: catch handler renderiza inventario aunque falle carga de boosts",
      "👤 PERFIL: (boosts || {}) defensivo en renderInventoryItem"
    ]
  },
  {
    version: "4.4.0",
    date: "2026-07-23",
    title: "📱 Preparación para Android y iPhone",
    scope: "game",
    files: [],
    changes: [
      "📱 El juego ya cuenta con una base nativa preparada para Android y iPhone",
      "🎮 Mejor respuesta en dispositivos móviles con vibración, pantalla de inicio y barra de estado integradas",
      "🔗 Los enlaces externos y el regreso al juego ahora se comportan mejor dentro de la aplicación",
      "🛡️ Se reforzó la conexión móvil y la recuperación automática de los dados si el modo 3D no está disponible"
    ]
  },
  {
    version: "4.3.1",
    date: "2026-07-22",
    title: "🔧 Fix dados 3D blancos: tonemapping, DataTexture y fallback 2D",
    scope: "game",
    files: ["dice-renderer-3d.mjs", "dice-renderer.js"],
    changes: [
      "🎲 3D FIX: tonemapping Neutral→ACESFilmic, exposure 2.1→1.0 (blancos por sobreexposición)",
      "🎲 3D FIX: DataTexture reemplaza CanvasTexture (bypass problema canvas→WebGL en algunos GPUs)",
      "🎲 3D FIX: reducido lighting total (hemisphere 1.2→1.0, directional 1.5→1.2, point 3→2)",
      "🎲 3D FIX: fallback 2D limpia container antes de recrear dados (solapa canvas+2D)",
      "🎲 3D FIX: handler macko-dice-3d-lost restaura dados 2D desde último estado conocido",
      "🎲 2D FIX: restore2D limpieza de container antes de recrear dados HTML"
    ]
  },
  {
    version: "4.3.0",
    date: "2026-07-22",
    title: "⚡ XP total, niveles 6000, boosts consumibles y perfil renovado",
    scope: "game",
    files: ["database.js", "server.js", "dice-renderer-3d.mjs", "dice-renderer.js", "styles.css", "app.js", "index.html", "version.js", "sw.js", "matchState.js", "playerManager.js"],
    changes: [
      "🎲 3D DADOS: reactivado en móvil/PWA, pérdida de contexto WebGL → fallback 2D limpio",
      "🧪 ENTRADA RELÁMPAGO: efecto eléctrico en dados 2D con ⚡ + glow pulsante",
      "📊 XP POR PUESTO: 15 XP base + 35 ganar + 10 top3 + 20 racha (antes 25 fijos)",
      "🏆 GANADOR: +25 monedas extra aparte de XP",
      "📈 MAX LEVEL 6000: rangos basados en nivel (Rookie 0-59…Dios 5900-6000)",
      "🏅 RANGOS CORREGIDOS: ahora se basan en NIVEL, no en XP (Tarzán ya no es Leyenda siendo Rookie)",
      "🧪 BOOSTS CONSUMIBLES: item 31 rework + 3 nuevos (100% XP, +50%/+100% monedas al ganar)",
      "⏱ TIMERS: boosts muestran tiempo restante en inventario y tienda",
      "🔄 PERFIL: badges antes que historial, historial limitado a 10, puntaje total → torneos",
      "🎯 MEJOR TURNO: tracking automático del turno más alto en cada partida",
      "🏆 MEJOR RACHA: tracking de racha máxima histórica",
      "👑 DIOS DE LOS DADOS: requisito cambiado de nivel 300 a nivel 6000",
      "🏟️ NIVEL EN PARTIDA: se muestra Lv.X debajo del nombre de cada jugador"
    ]
  },
  {
    version: "4.2.1",
    date: "2026-07-21",
    title: "🔧 Fix crítico: skins de dados, modales, 3D móvil y layout",
    scope: "game",
    files: ["cosmeticResolver.js", "database.js", "dice-renderer-3d.mjs", "dice-renderer.js", "styles.css", "app.js"],
    changes: [
      "🐛 FIX SKINS: Fantasma se mostraba como Diamante — faltaban 5 mapeos en cosmeticResolver.js (Océano→37, Sakura→38, Tóxicos→39, Vaporwave→40, Prisma→49)",
      "🐛 FIX SKINS: Catálogo de tienda ahora actualiza nombre/icono/categoría al importar (antes DO NOTHING no sobreescribía datos viejos)",
      "🐛 FIX MODAL X: Botón de cierre salía fuera del modal en móvil — header ahora es position:sticky dentro del scroll del modal",
      "🐛 FIX MODAL: Overlay con overscroll-behavior:contain + safe-area insets para que no se superponga con barra de estado en PWA",
      "🐛 FIX 3D MÓVIL: Dados 3D deshabilitados en celular — WebGL falla en PWA y mostraba dados completamente blancos sin diseño",
      "📱 SELECTOR CALIDAD: Muestra 'Solo 2D en celular' y se desactiva cuando detecta dispositivo móvil (Mobi/Android/iPhone/iPad)",
      "📐 LAYOUT: Gap entre zona de dados y cajas de jugadores aumentado (6-12px → 10-18px) para mejor separación visual",
      "📐 LAYOUT: Separación interna de la zona de dados aumentada (6px → 10px)"
    ]
  },
  {
    version: "4.2.0",
    date: "2026-07-21",
    title: "🎯 Dados grises, preview de inventario, efectos renovados y light mode",
    scope: "game",
    files: ["dice-renderer.js", "dice-renderer-3d.mjs", "styles.css", "app.js", "index.html"],
    changes: [
      "🎲 DADOS DEAD: Jugadores que no entraron muestran dados sólidos grises (#999/#777) ignorando colores de skin — antes se veían con los colores de la skin comprada",
      "🎲 DADOS 3D DEAD: Textura neutral gris cacheada (createNeutralFaceMap), roughness .9, metalness 0, clearcoat 0 — apariencia mate sin brillo",
      "🎲 DADOS 2D DEAD: Background gris sólido, dots #555, sin skin icon, sin clase die-skin-*, opacity .65",
      "🎉 CARTEL ENTRADA: Reemplazado overlay fullscreen (z-index:500, blur) por toast flotante arriba que no bloquea la vista de dados",
      "📱 INVENTARIO CELLS: Grid de 72px (antes 64px), iconos 22px (antes 18px), nombres 8px con better line-height",
      "👁️ INVENTARIO PREVIEW: Click en item abre modal con vista previa + descripción + botón 'Equipar' (antes equipaba directo sin preguntar)",
      "🎲 TIENDA PREVIEW DADOS: Muestra dado 3D real con createPreview() + los 4 estados (dead/normal/scoring/hot) via makeDie()",
      "👤 TIENDA PREVIEW AVATARES: Avatar grande con marco premium si corresponde (specialEquipped === '15')",
      "✨ TIENDA PREVIEW ESPECIALES: Avatar animado con el CSS effect real aplicado (special-45, special-46, etc.) + descripción del efecto",
      "🌟 ESTELA CÓSMICA (45): Anillos orbitales más gruesos (2.5px), más rápidos (2.5s/3.5s), glow más fuerte",
      "👑 AURA REAL (46): Glow dorado más intenso (28px + 56px), corona más grande (13px), animación más rápida (1.8s)",
      "🌈 CONFETI ARCOÍRIS (47): Opacidad .65 (antes .55), blur 2px, animación 1.5s (antes 2s)",
      "⚡ ENTRADA RELÁMPAGO (48): Emoji ⚡ visible, glow 48px, ring más rápido (.5s), keyframe lightningBolt nuevo",
      "🌑 ECLIPSE (51): Glow 32px + 64px, vignette más oscuro (35%→70%→100%), animación 2.5s (antes 3s)",
      "📋 SPECIAL_EFFECTS: Items 45-51 agregados con descripciones completas (antes solo llegaba hasta 36)",
      "💡 TEXT 'Click para ver preview': Agregado en items de tienda no-ultra para claridad",
      "☀️ LIGHT MODE: Panel de sonido, toast de puntos, partículas de fondo, botones de bots, banner de torneo — todos adaptados con CSS variables",
      "☀️ LIGHT MODE: User-top-bar gradient ahora usa var(--bg-card) en vez de hardcoded dark",
      "☀️ LIGHT MODE: Botón tema toggle, tag-wait, timer-ring-bg, shop-tabs, avatar-preview, special-preview — todos con var(--bg-input)"
    ]
  },
  {
    version: "4.1.0",
    date: "2026-07-21",
    title: "✨ Dados brillantes, efectos vivos y badge arreglado",
    scope: "game",
    files: ["dice-renderer-3d.mjs", "styles.css", "app.js", "server.js"],
    changes: [
      "Dados 3D más brillantes y separados entre sí",
      "Anillo feo debajo de los dados reemplazado por bordes luminosos en dados que suman puntos",
      "Insignia Perfecto ahora solo se desbloquea si ganás con cinco 1s",
      "Estela Cósmica: anillos orbitales animados alrededor del avatar",
      "Aura Real: resplandor dorado pulsante con corona flotante",
      "Confeti Arcoíris: borde arcoíris giratorio + lluvia de confeti multicolor al ganar",
      "Entrada Relámpago: anillo eléctrico pulsante alrededor del avatar",
      "Efecto Eclipse: vignette oscuro + brillo púrpura al ganar",
      "Efecto Láser mejorado: más rayos, colores arcoíris, brillo más intenso",
      "Sonido de dados: eliminado el doble sonido al aterrizar"
    ]
  },
  {
    version: "4.2.1",
    date: "2026-07-21",
    title: "🔧 Backend: resolver de skins y sincronización de catálogo",
    scope: "ceo",
    files: ["cosmeticResolver.js", "database.js"],
    changes: [
      "🔧 cosmeticResolver: 5 skins agregadas al mapa DICE_SKIN_IDS_BY_NAME (ocean/37, sakura/38, toxicos/39, vaporwave/40, prisma/49)",
      "🔧 database.js: seedShopItemsFromCatalog ahora usa ON CONFLICT DO UPDATE SET name, icon, category (antes DO NOTHING no actualizaba datos viejos)",
      "🔧 Esto corrige el bug donde Fantasma se mostraba como Diamante — el DB tenía el ID correcto pero el nombre/icono podían estar desactualizados"
    ]
  },
  {
    version: "4.0.0",
    date: "2026-07-20",
    title: "🎲 Dados vivos, bots mejores y tienda ampliada",
    scope: "game",
    files: [],
    changes: [
      "Los dados se ven más claros, grandes y cercanos, conservando el ícono de cada skin",
      "Los bots dejan ver sus tiradas, usan cosméticos variados y el nivel difícil juega con mejor estrategia",
      "Llegaron nuevas skins, avatares, efectos, sonidos y packs de contenido fijo",
      "Los artículos Ultra siguen disponibles en el cofre diario y ahora también tienen packs premium directos"
    ]
  },
  // ═══ 3.9.2 — PRODUCCIÓN ═══
  {
    version: "3.9.2",
    date: "2026-07-20",
    title: "🎨 Tus skins 2D, ahora en 3D",
    scope: "game",
    files: [],
    changes: [
      "Cada dado 3D conserva los mismos colores, degradados e íconos de la skin comprada en la tienda",
      "Los puntos y símbolos tienen más luz y contraste para reconocer cada resultado al instante",
      "La caída y los efectos terminan mucho más rápido",
      "El tablero ya no queda como una barra negra mientras espera el resultado de la tirada"
    ]
  },
  // ═══ 3.9.1 — PRODUCCIÓN ═══
  {
    version: "3.9.1",
    date: "2026-07-20",
    title: "🎲 Partida más clara y cómoda",
    scope: "game",
    files: [],
    changes: [
      "Los dados se ven más grandes y cercanos, con valores claros y efectos más suaves",
      "En teléfonos vuelve automáticamente la vista 2D clásica para destacar las skins compradas",
      "Tirar y Plantarse permanecen visibles aunque aparezcan mensajes o crezca el chat",
      "La partida aprovecha mejor la altura disponible y evita superposiciones con el aviso de instalación"
    ]
  },
  // ═══ 3.9.0 — PRODUCCIÓN ═══
  {
    version: "3.9.0",
    date: "2026-07-20",
    title: "✨ Dados y skins con nueva vida",
    scope: "game",
    files: [],
    changes: [
      "Los dados ahora tienen volumen, iluminación, rebotes y materiales propios para cada skin compatible",
      "Fuego, hielo, diamante, láser, galaxia, zombie, neón, esmeralda y arcoíris suman efectos visuales distintivos",
      "La tienda permite ver las skins animadas antes de elegirlas",
      "La calidad se adapta al dispositivo y siempre conserva una versión 2D rápida y accesible"
    ]
  },
  // ═══ 3.8.5 — PRODUCCIÓN ═══
  {
    version: "3.8.5",
    date: "2026-07-20",
    title: "🏆 Torneos más claros y confiables",
    scope: "game",
    files: [],
    changes: [
      "Los resultados recientes permanecen visibles durante 24 horas y luego salen de la lista de torneos",
      "Las inscripciones, horarios y torneos recurrentes ahora funcionan de forma más confiable",
      "La lista de torneos y el bracket se ven mejor y son más fáciles de usar desde el celular"
    ]
  },
  // ═══ 3.8.4 — PRODUCCIÓN ═══
  {
    version: "3.8.4",
    date: "2026-07-20",
    title: "🎲 Skins correctas y partidas completadas",
    scope: "game",
    files: ["backend/cosmeticResolver.js", "backend/server.js", "backend/playerManager.js", "backend/database.js"],
    changes: [
      "Las skins de dados respetan el cosmético comprado aunque existan IDs históricos en la tienda",
      "Dados Fantasma ya no aparecen como Élite o Diamante durante la partida",
      "Misiones diarias, semanales y logros solo cuentan partidas terminadas",
      "Abandonos, desconexiones y eliminaciones por inactividad no suman progreso"
    ]
  },
  // ═══ 3.8.3 — PRODUCCIÓN ═══
  {
    version: "3.8.3",
    date: "2026-07-20",
    title: "📱 Encabezados corregidos en iPhone",
    scope: "game",
    files: ["frontend/styles.css", "frontend/index.html", "frontend/sw.js", "frontend/version.js"],
    changes: [
      "Portal, sala de espera y partida respetan el área segura superior de iOS",
      "El reloj, la señal y la batería ya no se superponen con títulos, códigos ni controles",
      "La corrección queda limitada a pantallas móviles y conserva la vista de escritorio"
    ]
  },
  // ═══ 3.8.2 — PRODUCCIÓN ═══
  {
    version: "3.8.2",
    date: "2026-07-19",
    title: "✨ Mejoras generales",
    scope: "game",
    changes: [
      "Mejoras de sonido",
      "Mejoras de notificaciones",
      "Mejoras de seguridad",
      "Correcciones generales"
    ]
  },
  // ═══ 3.8.1 — PRODUCCIÓN ═══
  {
    version: "3.8.1",
    date: "2026-07-19",
    title: "✨ Mejoras generales",
    scope: "game",
    changes: [
      "Mejoras de seguridad",
      "Mejoras de estabilidad y rendimiento",
      "Mejoras en la experiencia móvil",
      "Correcciones generales"
    ]
  },
  // ═══ 3.8.0 — PRODUCCIÓN ═══
  {
    version: "3.8.0",
    date: "2026-07-19",
    title: "🛡️ Interfaz móvil, audio independiente y seguridad de producción",
    scope: "game",
    files: ["frontend", "backend", "README.md", "render.yaml"],
    changes: [
      "📱 La barra móvil ya no se superpone con el dado animado",
      "🎵 Panel de música independiente, volumen persistente y silencio real al llegar a cero",
      "🏠 Código de sala, copiar y sonido agrupados a la derecha",
      "🔐 Identidad WebSocket firmada y acciones limitadas al jugador y a su sala",
      "💳 Pagos y recompensas protegidos contra acreditaciones duplicadas",
      "🏆 Inscripciones y partidas de torneo conectadas al bracket real",
      "🧹 Retiro de SQLite, copias de recursos y scripts históricos sin uso"
    ]
  },
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
