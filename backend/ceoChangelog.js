"use strict";

// Detalle operativo visible únicamente desde el endpoint autenticado del CEO.
module.exports = {
  "4.4.0": {
    title: "📱 Aplicaciones nativas con Capacitor 8 para Android e iOS",
    scope: "ceo",
    files: [
      ".gitignore",
      "README.md",
      "capacitor.config.json",
      "mobile/native-entry.js",
      "scripts/prepare-mobile.js",
      "scripts/mobile-smoke-test.js",
      "scripts/smoke-test.js",
      "android/app/build.gradle",
      "android/app/src/main/AndroidManifest.xml",
      "ios/App/App.xcodeproj/project.pbxproj",
      "ios/App/App/Info.plist",
      "backend/server.js",
      "frontend/app.js",
      "frontend/dice-renderer.js",
      "frontend/dice-renderer-3d.mjs",
      "frontend/index.html",
      "frontend/styles.css",
      "frontend/sw.js",
      "frontend/version.js",
      "package.json",
      "package-lock.json"
    ],
    changes: [
      "Capacitor 8 integrado con proyectos nativos Android e iOS bajo el application ID com.macko.los10000.",
      "Runtime mobile empaquetado localmente: las rutas /api y /ranking apuntan al backend productivo, mientras los recursos visuales y Three.js permanecen dentro de la aplicación.",
      "WebSocket nativo usa wss://los10mildemacko.onrender.com y el backend admite únicamente los origins locales exactos de Capacitor.",
      "Plugins nativos activos: App lifecycle/deep links, Browser, Haptics, Splash Screen y Status Bar.",
      "Deep link los10000:// agregado en Android e iOS; ambas plataformas quedan limitadas a orientación vertical.",
      "Service Worker e instalación PWA se desactivan dentro del contenedor nativo para evitar cachés duplicadas y banners impropios.",
      "Los enlaces de pago se abren en navegador seguro. La compra de bienes digitales queda deshabilitada dentro de las apps hasta integrar Google Play Billing y Apple In-App Purchase.",
      "Scripts mobile:prepare, mobile:sync, mobile:doctor, mobile:android, mobile:ios, mobile:build:android y test:mobile documentados.",
      "Android configurado con compile/target SDK 36, min SDK 24, versionCode 40400 y versionName 4.4.0.",
      "iOS configurado con MARKETING_VERSION 4.4.0 y CURRENT_PROJECT_VERSION 40400; la compilación final requiere macOS, Xcode y firma Apple.",
      "Iconos y splash nativos generados a partir del ícono oficial. Las claves de firma y artefactos compilados permanecen excluidos de Git.",
      "Corregida regresión de dice-renderer.js: el listener de pérdida WebGL ahora está protegido fuera del navegador y vuelve a permitir ejecutar las pruebas Node.",
      "QA: 22 pruebas de reglas, 35 smoke tests, prueba de integración mobile, validación sintáctica, CORS/WebSocket nativo y build APK Android aprobados.",
      "Seguridad: npm audit de dependencias de producción informa 0 vulnerabilidades.",
      "Versionado sincronizado en web, caché PWA, npm, Android e iOS a v4.4.0."
    ]
  },
  "4.3.0": {
    title: "⚡ Sistema XP total, niveles 6000, boosts consumibles y tienda real extendida",
    scope: "game",
    files: [
      "backend/database.js",
      "backend/server.js",
      "backend/commerceCatalog.js",
      "backend/ceoChangelog.js",
      "backend/matchState.js",
      "backend/playerManager.js",
      "frontend/app.js",
      "frontend/dice-renderer.js",
      "frontend/dice-renderer-3d.mjs",
      "frontend/styles.css",
      "frontend/index.html",
      "frontend/version.js",
      "frontend/sw.js"
    ],
    changes: [
      "XP por puesto: 15 base + 35 ganar + 10 top3 + 20 racha (antes 25 fijos para todos). Ganador recibe +25 monedas extra aparte del pozo.",
      "MAX LEVEL 6000: niveles 301-6000 cuestan 3000 XP c/u. RANGOS ahora basados en nivel (no XP): Rookie 0-59, Aprendiz 60-149, Profesional 150-499, Maestro 500-1099, Leyenda 1100-1899, Elite 1900-3399, Mítico 3400-5899, Dios 5900-6000.",
      "Boosts consumibles: item 31 movido a consumibles + 3 nuevos (52=100% XP x1d 3000₡, 53=+50% monedas al ganar x1d 2500₡, 54=+100% monedas al ganar x1d 4000₡). Flujo: comprar → inventario → 'Usar' → 24h de boost → auto-expira + se borra de redemptions.",
      "getOwnedItems: limpia automáticamente consumibles expirados (verifica las 4 columnas boost, elimina redemptions vencidas y resetea columnas).",
      "3D dados reactivado en móvil/PWA. Detección de pérdida de contexto WebGL (webglcontextlost + stage.contextLost) → evento macko-dice-3d-lost → fallback 2D limpio.",
      "Efecto eléctrico (special-48) mejorado: electricAvatar animation en avatar (flash + glow), clase .die.electric-dice en dados 2D (⚡ + borde eléctrico pulsante).",
      "Perfil reordenado: badges antes que historial. Stats reemplazadas: quitado total_score y record, agregado torneos entrados/ganados, mejor turno, mejor racha histórica. Transacciones limitadas a 10 con paginación.",
      "Nivel visible en partida: badge Lv.X bajo el nombre de cada jugador en player cards.",
      "Mejor turno: extraído del historial de la partida (eventos BANKED/SCORED) al terminar el juego. Mejor racha: actualizada vía GREATEST(COALESCE(best_win_streak,0), win_streak).",
      "Dios de los dados (logro): requisito cambiado de nivel 300 a nivel 6000.",
      "Packs de XP en tienda real: 4 nuevos paquetes (XP Inicial 500XP+200🪙, XP Pro 2000XP+500🪙, XP Master 5000XP+1500🪙, XP Legend 15000XP+5000🪙) integrados vía Mercado Pago y Stripe.",
      "grantCommercePack extendido: ahora otorga XP directamente (consulta level desde database.getLevel), actualiza xp/level y registra transacción.",
      "Nuevas columnas DB: boost_xp_expires, boost_coins_win_50_expires, boost_coins_win_100_expires, best_turn, best_win_streak, tournaments_entered, tournaments_won.",
      "EquipItem: fix de scope (parsedId hoisted fuera del if (itemId !== 'default')).",
      "Versión bump 4.2.1→4.3.0 (version.js, sw.js, index.html cache busting)."
    ]
  },
  "4.0.0": {
    title: "🎲 Renovación de cosméticos, bots y monetización determinística",
    scope: "ceo",
    files: ["backend/botManager.js", "backend/botGameHandler.js", "backend/commerceCatalog.js", "backend/database.js", "backend/paymentManager.js", "backend/paymentManagerMP.js", "backend/server.js", "frontend/app.js", "frontend/audio.js", "frontend/dice-renderer.js", "frontend/dice-renderer-3d.mjs", "frontend/styles.css"],
    changes: [
      "Renderer 3D: geometría +10%, cámara más cercana, exposición 1.52, emisión base 0.38, iconos al 58% con opacidad 0.76 y bandeja compacta.",
      "Catálogo: se agregaron 4 dados, 4 avatares, 4 efectos y 3 Ultra; el seed ahora inserta IDs faltantes aunque la tabla ya tenga datos.",
      "Bots: avatares resueltos a emoji, cosméticos derivados del catálogo completo, espera visible de 1.85–3.6 s, temporizadores deduplicados y estrategia difícil adaptativa por riesgo/desventaja.",
      "Audio: firmas tonales nuevas para Océano, Sakura, Tóxico, Vaporwave y Prisma, aplicadas también al impacto 3D.",
      "Comercio: catálogo unificado para Stripe/Mercado Pago con monedas, bundles y Ultra determinísticos; entrega idempotente de propiedad y monedas.",
      "Economía: Ultra deja de venderse por monedas; se mantiene como drop gratuito del cofre diario o compra premium directa, sin loot box paga.",
      "QA: sintaxis completa, 22 pruebas de reglas y 34 smoke tests aprobados."
    ]
  },
  "3.9.2": {
    title: "🎨 Paridad visual exacta entre skins 2D y dados 3D",
    scope: "ceo",
    files: [
      "frontend/app.js",
      "frontend/dice-renderer.js",
      "frontend/dice-renderer-3d.mjs",
      "frontend/styles.css",
      "frontend/index.html",
      "frontend/sw.js",
      "frontend/version.js",
      "frontend/ceo-panel.html",
      "package.json",
      "package-lock.json"
    ],
    changes: [
      "Skins: las 12 variantes 3D usan exactamente la paleta, color de puntos e ícono del catálogo/renderer 2D: Neón, Fuego, Élite, Fantasma, Hielo, Láser, Dorados, Esmeralda, Zombie, Arcoíris, Diamante y Galácticos.",
      "Texturas: el ícono emoji de tienda se dibuja centrado en cada cara debajo de los puntos, con la misma proporción y opacidad visual del dado 2D.",
      "Legibilidad: NeutralToneMapping, exposición ajustada y mapa emisivo de la propia textura conservan degradados vivos sin perder sombras ni volumen.",
      "Animación: caída reducida de 820 ms a 390 ms, impacto adelantado, vibración acortada, partículas reducidas a 12/5 y cola visual limitada a 180/100 ms.",
      "Latencia: al pedir otra tirada se conserva el resultado anterior hasta recibir el nuevo; se elimina el destello de tablero vacío causado por clearDice inmediato.",
      "Estado inicial: el contenedor de dados vacío se oculta y aparece recién con el primer resultado válido.",
      "QA visual: skin Zombie verificada con cinco valores y estados normal, puntuando y caliente; ícono, puntos, color y volumen permanecen visibles."
    ]
  },
  "3.9.1": {
    title: "🎲 Legibilidad de dados y layout estable de partida",
    scope: "ceo",
    files: [
      "frontend/app.js",
      "frontend/dice-renderer-3d.mjs",
      "frontend/styles.css",
      "frontend/index.html",
      "frontend/sw.js",
      "frontend/version.js",
      "frontend/ceo-panel.html",
      "package.json",
      "package-lock.json"
    ],
    changes: [
      "Responsive: calidad automática elige renderer 2D clásico hasta 480 px para priorizar skins, valores, batería y fluidez; la selección manual 3D sigue disponible.",
      "Cámara 3D: FOV, posición y objetivo acercan el conjunto completo sin cortar dados; ResizeObserver reajusta canvas y proyección al cambiar tamaño u orientación.",
      "Efectos 3D: partículas reducidas, pequeñas, semitransparentes y ubicadas detrás de los dados; iluminación lateral menos intensa y animación más corta.",
      "Layout: game-table acepta altura flexible, desplaza solo el contenido central cuando es imprescindible y elimina recortes por overflow.",
      "Acciones: Tirar/Plantarse y estado de espera usan posición sticky sobre el límite inferior del tablero, separados del chat.",
      "Chat: sin mensajes no reserva altura; con contenido queda acotado a 52 px y mantiene el compositor accesible.",
      "PWA: el banner de instalación se oculta durante una partida y deja de superponerse con controles críticos.",
      "QA visual: partida validada a 1280×720 con resultado, mensaje de tirada y chat visible; dados y ambos controles permanecen completos."
    ]
  },
  "3.9.0": {
    title: "✨ Render híbrido 3D de dados y recuperación segura del panel CEO",
    scope: "ceo",
    files: [
      "backend/ceoAuth.js",
      "backend/database.js",
      "backend/server.js",
      "frontend/app.js",
      "frontend/audio.js",
      "frontend/dice-renderer.js",
      "frontend/dice-renderer-3d.mjs",
      "frontend/index.html",
      "frontend/styles.css",
      "frontend/sw.js",
      "scripts/game-rules-test.js",
      "scripts/smoke-test.js",
      "package.json",
      "package-lock.json"
    ],
    changes: [
      "Motor gráfico: Three.js 0.185.1 se integra como capa progresiva sobre el renderer SVG existente; WebGL incompatible, calidad desactivada o error de carga vuelven automáticamente a 2D.",
      "Física visual: dados redondeados reciben orientación determinista por valor, caída, giro, rebote, sombras, iluminación física y partículas aceleradas por GPU.",
      "Materiales: presets propios para base, fuego, hielo, diamante, láser, galaxia, zombie, neón/élite/esmeralda y arcoíris, con texturas de caras generadas localmente.",
      "Estados: tirada normal, puntuación, dado caliente y dado perdido modifican brillo, escala, partículas y sonido de impacto sin alterar reglas del servidor.",
      "Tienda: la vista previa grande rota en 3D y conserva debajo las tarjetas 2D de estados; cerrar el modal libera escena, materiales, texturas y animación.",
      "Rendimiento: selector Automática/3D alta/3D ahorro/2D clásica persistente; automática evalúa memoria, CPU y viewport, limita pixel ratio y reduce partículas.",
      "Accesibilidad: prefers-reduced-motion reduce giros, rebotes y transiciones; el renderer mantiene contenido y controles fuera del canvas.",
      "Audio: cada familia de skin agrega impacto sincronizado con la animación y vibración compatible, respetando volumen y mute de efectos.",
      "Distribución: Three.js y RoundedBoxGeometry se sirven desde dependencias locales, incluido el chunk three.core.min.js, y quedan precacheados para PWA.",
      "Dependencias: body-parser y brace-expansion transitivos se actualizaron a revisiones seguras; npm audit informa 0 vulnerabilidades.",
      "Panel CEO: si CEO_SECRET falta o es corto, la sesión administrativa deriva una clave aislada y estable desde JWT_SECRET mediante HMAC-SHA256; las credenciales CEO ya guardadas siguen siendo las únicas válidas y el panel deja de responder 'no configurado'.",
      "Seguridad CEO: CEO_SECRET válido continúa teniendo prioridad; la derivación usa separación de dominio y nunca expone ni modifica usuario, hash o contraseña administrativa.",
      "Pruebas: reglas cubren la clave administrativa derivada; smoke verifica renderer, ambos módulos locales de Three.js y que un login CEO inválido responda 401 en vez de 503."
    ]
  },
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
