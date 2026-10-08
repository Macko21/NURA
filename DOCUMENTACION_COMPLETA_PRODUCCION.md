# Análisis de Producción y Plan de Acción

## 1. Visión General del Proyecto

- **Nombre**: Los 10.000 de Macko
- **Tecnología**: Node.js (>=18, <25), PostgreSQL, Express, WebSockets, Capacitor (Android/iOS), PWA.
- **Componentes**:
  - `backend/` – API y lógica de juego, gestión de pagos, autenticación, torneo, etc.
  - `frontend/` – Cliente web (React/Vanilla) y PWA.
  - `mobile/` – Proyectos Capacitor para Android & iOS.
  - `scripts/` – Herramientas de pruebas, migraciones, generación de reportes.
  - `docker/` (no presente) – Posible contenedorización.
- **Gestión de dependencias**: `package.json` (Node 24, npm).
- **CI/CD**: GitHub Actions (referido en `ESTADO-PRODUCCION.md`), pero sin pipeline de despliegue completo a producción.
- **Documentación existente**:
  - `README.md` (instrucciones de puesta en marcha).
  - `PLAN-PRODUCCION.md` (plan de producción detallado, incluye bloqueos P0‑P5).
  - `ESTADO-PRODUCCION.md` (estado actual, lo implementado y lo pendiente).

---

## PLAN DE PRODUCCIÓN (contenido original)

# Plan de producción — Los 10.000 de Macko

Fecha: 3 de octubre de 2026. Base auditada: código local posterior al commit f6614d7, versión 5.0.2.

[seguro] Este documento es un diagnóstico y plan de implementación. No habilita cobros, no cambia reglas del juego y no certifica una auditoría de penetración.

## 1. Decisión de lanzamiento

[seguro] El repositorio tiene una base de juego multijugador y comercio, pero contiene bloqueos concretos de privacidad, persistencia y liquidación económica. Las pruebas existentes no demuestran integridad ante reinicios ni pagos completos.

[probable] La ruta más acotada para empezar a facturar es lanzar primero web/PWA con partidas gratuitas y venta de contenido cosmético fijo. Mantener apuestas y torneos con entrada pagada deshabilitados hasta resolver recuperación, integridad económica y encuadre del negocio. La moneda sin retiro no elimina por sí sola las cuestiones legales o de aceptación del proveedor.

[seguro] No se verificaron desde el panel del proveedor: plan de hosting, proveedor y plan de PostgreSQL, backups, secretos, cuenta comercial, SMTP, facturación, dominio ni alertas. Su estado operativo debe comprobarse; ausencia de configuración en el repositorio no prueba ausencia en producción.

## 2. Inventario de lo existente

| Área | Evidencia y estado |
|---|---|
| Motor de dados y turnos | [seguro] Reglas ejecutadas en servidor, azar criptográfico, timers y bots; hay pruebas de reglas. |
| Identidad | [seguro] JWT firmado, contraseñas con bcrypt, sesiones versionadas, verificación por correo y recuperación con token hash y vencimiento. La entrega real del correo no está comprobada aquí. |
| Salas | [seguro] Creación pública/privada, código de seis dígitos, cupos, listo, salida y reconexión existen. La aprobación privada de ingreso tardío no se aplica. |
| Recuperación | [seguro] Se conserva el lugar durante desconexiones mientras el proceso vive; salas, partidas y timers siguen en memoria. |
| Economía | [seguro] PostgreSQL almacena saldos, transacciones, inventario y premios. Compras, cofre, misiones e inscripciones tienen operaciones transaccionales. |
| Pagos web | [seguro] Mercado Pago crea preferencias y consulta el pago al recibir notificación. Verifica importe/moneda y evita duplicación mediante payment_events. Falta firma MP, orden persistente y recuperación integral. Stripe tiene backend y firma de webhook; no encontré checkout Stripe en la interfaz. |
| Torneos | [seguro] Inscripción, bracket, avance, premio, cancelación y reembolso existen. La partida de cada cruce no conserva su progreso ante reinicio. |
| Desafío diario | [seguro] Catálogo y recompensa existen; START_DAILY no aplica los modificadores que anuncia. |
| Panel administrativo | [seguro] Roles y registro de acciones existen. [probable] Botones HTML generados con onclick fallan bajo la CSP actual. |
| Móvil | [seguro] Hay PWA y proyectos Capacitor. La última corrección se comprobó visualmente en 320×640; eso no valida barras del sistema en dispositivos físicos ni todas las pantallas. Las compras nativas están deshabilitadas. |
| Operación | [seguro] Hay publicación desde main y comprobación de /api/version. Ese endpoint no verifica disponibilidad de DB ni que haya llegado el commit nuevo. |

## 3. Bloqueos comprobados y prioridades

P0: bloquea cobros o compromete integridad/privacidad. P1: necesario para lanzamiento comercial confiable. P2: mejora posterior.

### P0-01. Persistir salas y partidas

[seguro] backend/roomManager.js:11 mantiene rooms en Map; backend/diceManager.js:25 mantiene matches en Map. Un snapshot enviado por WebSocket no equivale a una copia persistente.

Implementar:
- Identificador permanente de partida y versión del estado.
- Guardado transaccional de participantes, turnos, puntos, dados, entrada, vidas, reglas y resultado.
- Registro de comandos o eventos con identificador único para evitar repetir una acción por reintento.
- Restauración al iniciar; reconstrucción de timers desde vencimientos absolutos.
- Definición explícita de cómo se pausa o resuelve una partida durante caída del servidor.
- Cierre ordenado al desplegar: detener nuevos ingresos, guardar y cerrar conexiones con reconexión informada.
- Mantener una sola instancia de juego inicialmente. No escalar a varias sin dueño único de sala y coordinación del estado.

### P0-02. Hacer recuperable toda liquidación económica

[seguro] backend/server.js:1888 destruye la partida antes de completar premios normales, XP y apuestas. El pago de pot en :1999 captura errores y no crea una liquidación pendiente recuperable.

Implementar:
- Registro persistente de partida terminada y liquidación pendiente antes de liberar la partida.
- Libro de movimientos con operation_id único, tipo, jugador, partida/orden, moneda, importe, origen y fecha.
- Idempotencia para premio, XP, apuestas, consumibles, inscripción y reembolso.
- Reserva/debito de entrada y resolución formal: pagar, liberar o devolver; registrar comisión si se mantiene.
- Trabajo persistente de liquidación que reintente fallos y se recupere al reiniciar.
- Evitar que errores en estadísticas impidan pagar lo debido.
- Restricciones de saldo, validaciones e informe de conciliación.

### P0-03. Cerrar el ingreso privado y proteger cruces

[seguro] backend/server.js:2310 define requestPrivateJoin, pero no tiene llamadas. REQUEST_JOIN_ACTIVE (:2633) y JOIN_ROOM durante juego (:2724) llaman directamente a joinActiveMatch. Ocultar una sala en el listado no obliga al servidor a pedir aprobación.

Implementar:
- Una única política de entrada aplicada a código, UUID, invitación y reconexión.
- Privada en espera: código o invitación según contrato del producto.
- Privada empezada: aprobación real del dueño para nuevos participantes; miembro previo puede reconectar.
- Cruce de torneo: sólo los participantes asignados; no admitir terceros ni bots externos.
- Partida con apuestas: bloquear ingreso tardío o definir entrada y elegibilidad antes de ofrecerla.
- Rate limit por usuario/IP para búsqueda de códigos; códigos almacenados como texto para conservar ceros iniciales.
- Cupo y permisos comprobados otra vez al aceptar; solicitud vencida no habilita acceso.
- Definir qué ocurre si el dueño sale o está desconectado.

### P0-04. Terminar pagos web

[seguro] backend/server.js:1679 y backend/paymentManagerMP.js:96 no validan x-signature. La consulta autenticada al proveedor y el control de importe existentes son defensas relevantes, pero no reemplazan verificar el origen del webhook.

Implementar:
- Firma MP según documentación vigente, validación temporal y comparación segura; modo test/live explícito.
- Orden de compra creada antes del checkout: order_id, comprador, contenido y precio congelados, moneda, proveedor y estado.
- Clave de idempotencia al crear cobro; doble toque no produce dos compras accidentales.
- Vincular notificación a la orden; verificar pago, vendedor/cuenta esperada, entorno, comprador de la orden, importe y moneda.
- Registrar recepción del evento de forma durable y procesarlo con reintento; responder errores recuperables correctamente.
- Estados creada, pendiente, aprobada, entregada, rechazada, cancelada, reembolsada y disputada.
- Conciliación programada con proveedor: recupera webhooks perdidos y pagos pendientes.
- Devoluciones y contracargos, incluidos objetos/monedas ya gastados, con procedimiento de soporte.
- Pantalla de regreso al juego que consulta la orden en servidor; nunca entrega por mp_success o parámetros de URL.
- Historial de compras y comprobante; asistencia con referencia de orden.
- Precios congelados en la orden: un webhook tardío no debe rechazarse porque cambió el catálogo.
- Ocultar proveedores/productos no configurados. Concluir o retirar del lanzamiento la opción Stripe incompleta.

### P0-05. Evitar salud falsa y publicación falsa

[seguro] startServer en backend/server.js:3617 sigue sirviendo si falla DB. /api/version retorna versión y changelog. .github/workflows/deploy.yml considera éxito cualquier HTTP 200; no comprueba versión/commit nuevo. El CI define DATABASE_URL pero no inicia un servicio PostgreSQL.

Implementar:
- Separar proceso vivo de servicio listo: readiness exige DB y esquema compatible.
- En producción bloquear operaciones económicas y altas cuando almacenamiento no esté listo; mostrar mantenimiento informado.
- Endpoint de identificación de build con SHA/versión, sin secretos.
- Pipeline con DB real de prueba, migraciones y verificaciones de compra, torneos y recuperación.
- Confirmar resultado del hook de Render y esperar el SHA esperado, no sólo HTTP 200.
- Entorno de pruebas independiente con correo y pagos de prueba.
- Runtime soportado y compatible, dependencias revisadas y actualizaciones controladas.
- Rollback de aplicación probado con esquema compatible.

---

## ESTADO DE PRODUCCIÓN (contenido original)

# Ejecución del plan de producción

Actualizado: 3 de octubre de 2026. Entrega: 5.1.1, segunda etapa. El plan completo no está terminado y esta versión NO habilita el lanzamiento comercial.

## Segunda etapa: resultados y liquidación recuperable

- Identificador UUID nuevo para cada partida, distinto del código de sala y de una revancha.
- Resultado completo y derechos de premio guardados antes de confirmar GAME_OVER o destruir la partida. Fallo de guardado conserva el resultado en memoria y reintenta; no libera una revancha durante ese fallo.
- Registro durable de obligaciones pendientes; reintento al arrancar y cada 15 segundos. Monedas, experiencia, estadísticas e identificadores únicos de movimientos se confirman juntos, con bloqueo de fila y transacción.
- Premios guardados congelan los boosts vigentes al finalizar. La clasificación excluye bots, invitados sin cuenta, desconectados y eliminados; el ganador real ocupa el primer puesto. El progreso anterior no se reescribe.
- Resultado diario congela el día y premio para que un reintento después de medianoche no lo aplique a otro desafío.
- Cruces de torneo se avanzan idempotentemente antes de liquidar; un resultado no registrado no se descarta. Apuestas de una partida no pasan a una revancha.
- Prueba nueva: fallo después de escribir parte del libro, rollback completo, recuperación desde otro proceso Node, 100 reintentos simultáneos y pérdida de confirmación después del COMMIT. Aprobada en PostgreSQL 16 en GitHub Actions: https://github.com/Macko21/LOS10MILDEMACKO/actions/runs/37146978221 (implementación 965cc29).
- Informe de solo lectura `scripts/production-report.js`: contadores sin datos personales, obligaciones de más de 15 minutos y diferencias en los movimientos nuevos. Procedimiento específico de Neon/Render en `OPERACION-NEON-RENDER.md`; no se ejecutó una restauración real ni se alteró producción.
- Límite importante: esto recupera resultados que llegaron a guardarse; NO restaura aún puntos, dados ni turno de una partida que estaba en curso al caer. Tampoco implementa reserva durable de apuestas/consumibles. Cobros y competencia paga siguen apagados.

## Implementado en esta etapa

- P0-03 parcial: ingreso a partidas privadas mediante solicitud y aprobación del creador; UUID solo no autoriza; cruces de torneo exclusivos; ingreso tardío bloqueado si hay apuestas; límites de búsqueda por identidad e IP. Revalidación después de cargar datos evita ingresar a una partida que terminó durante la consulta.
- P0-04 parcial: compras apagadas por defecto; Stripe sin checkout deshabilitado; webhook MP con HMAC, recurso coherente y consulta al proveedor; orden persistida con precio y contenido congelados; clave de idempotencia; una entrega por orden/pago; validación de vendedor y entorno; bandeja persistente de reintentos. Historial propio en web y estados de reembolso/contracargo. No se deducen automáticamente bienes gastados ante reembolso: requiere soporte.
- P0-05 parcial: endpoint de disponibilidad verifica inicialización y conexión DB; producción no arranca ante fallo de esquema; migración nueva versionada, transaccional y con bloqueo; CI con PostgreSQL real, runtime Node 24, validación del commit publicado, errores de publicación no ocultos.
- Sesiones: identificación no concede permisos antes de verificar cuenta; mensajes secuenciales con cola limitada; acciones de cuentas registradas vuelven a comprobar versión de sesión; expiración comprobada; error de recuperación de contraseña controlado.
- Motor: corregida importación faltante que impedía crear estado completo de un jugador tardío.
- Competencia paga: apuestas nuevas e inscripción de torneos con costo bloqueadas por defecto. Salida/reembolso de inscripciones anteriores no se bloquean.
- Versión web/PWA/Android/iOS sincronizada. Preparación de bundle móvil verificada; no equivale a prueba física.
- Dependencias: Nodemailer actualizado para cerrar avisos altos, vigilancia local usa Node `--watch`, retirando la cadena vulnerable de Nodemon. Auditoría de dependencias añadida como puerta de CI.

## Pruebas y límites

- 23 pruebas de reglas, 24 pruebas de controles de producción, regresiones de seguridad, 52 comprobaciones HTTP/WebSocket y comprobación estática de bundle móvil pasan localmente. Auditoría npm de producción y desarrollo: cero vulnerabilidades informadas en esta revisión; no equivale a auditoría de seguridad integral.
- Nueva suite PostgreSQL prueba migración repetida, 20 notificaciones concurrentes, una sola entrega, contenido congelado distinto del catálogo, importe incorrecto, reembolso/replay y bandeja persistente tras error del proveedor. Ejecuta únicamente contra localhost y base terminada en `_test`; nunca contra producción. Aprobada en GitHub Actions con PostgreSQL 16: https://github.com/Macko21/LOS10MILDEMACKO/actions/runs/37146081665 (commit de implementación a351ae9).
- La firma sigue el manifiesto de la documentación oficial de Mercado Pago. Los reintentos firmados no se descartan por antigüedad; su efecto se deduplica en base de datos.
- No se realizaron pagos reales ni verificación de firma real del proveedor. No activar compras por el solo hecho de que CI pase.

## Pendiente de implementación (no confundir con requisitos externos)

1. P0-01: persistencia/restauración de salas y partidas, comandos deduplicados, vencimientos absolutos, cierre ordenado y dueño único de sala. Las partidas siguen en memoria.
2. P0-02 parcial: premios, XP y estadísticas de resultados guardados tienen liquidación recuperable y operaciones únicas. Falta reserva durable de entradas/apuestas, consumibles y conciliación integral de la economía; no habilitar competencia paga.
3. P0-04: conciliación periódica de pagos sin webhook, devolución y revocación formal de contenido, soporte de compras antiguas, pruebas sandbox completas y límites comerciales.
4. P0-05: hacer observables los errores de migraciones históricas que hoy se ignoran, preparar rollback operativo y staging aislado.
5. P1: restauración/no-shows/BYE de torneos; funciones administrativas generadas con onclick bajo CSP; listados públicos en espera; modificadores diarios; equidad de ingresos tardíos; MFA administrativo, cuotas adicionales, moderación, métricas, carga, conciliación de economía y tests integrales faltantes.
6. P1/P2: revisar progresión y power-ups frente a monetización cosmética; publicación nativa con Billing/StoreKit solo después de su integración y validación.

## Requisitos externos aún no comprobados

- La implementación está en `codex/production-foundation`; no se integró a `main` y no se disparó el despliegue de esta etapa a Render. Antes de esa integración se necesita inventario de pagos pendientes y confirmación de backup/restauración.
- Dominio HTTPS, SMTP entregando mensajes, reputación y registros DNS.
- Cuenta comercial MP, vendedor correcto, secreto de firma, credenciales sandbox y configuración de webhook.
- Modelo comercial definitivo, jurisdicción, condiciones, privacidad, reembolsos, facturación y asesoramiento legal cuando corresponda.
- Android/iPhone físicos y Mac/Xcode para validar aplicaciones nativas.

## Operación segura de esta etapa

1. Mantener `PAYMENTS_ENABLED=false` y `PAID_COMPETITION_ENABLED=false`. En Render estas variables se declaran apagadas en el blueprint; servicios existentes pueden requerir comprobar manualmente que lo aplicaron. Por ausencia de variable también quedan apagadas.
2. Mantener una sola instancia del servidor. Un deploy puede cortar partidas hasta terminar P0-01.
3. Hacer backup externo comprobado antes del primer despliegue con nueva migración. Las tablas nuevas se agregan; no eliminan ni transforman registros existentes.
4. MP nuevo usa órdenes UUID. Referencias antiguas JSON no se acreditan automáticamente: quedan en bandeja de reintento con `unknown_or_legacy_order_requires_review`. Antes de desplegar, inventariar pagos antiguos pendientes y resolverlos con soporte sin duplicar los ya acreditados.
5. Configurar `MP_WEBHOOK_SECRET`, `MP_COLLECTOR_ID` y `MP_LIVE_MODE` correctamente incluso para procesar pagos con compras apagadas. No aceptar IPN sin firma.
6. Para retroceder el código, conservar las tablas nuevas y el historial. No retirar la migración ni borrar órdenes. La versión antigua no comprende órdenes UUID: no reactivar su checkout; mantener compras apagadas hasta conciliar todas las órdenes.
7. Comprobar `/health/ready` con `ready=true` y `build` igual al commit esperado. `/api/version` solo informa versión, no disponibilidad económica ni salud de partidas.

---

*Este documento combina el análisis generado, el plan de producción original y el estado actual del proyecto.*
