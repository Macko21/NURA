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
- P0-04 parcial: compras apagadas por defecto; Stripe sin checkout deshabilitado; webhook MP con HMAC, recurso coherente y consulta al proveedor; orden persistida con precio y contenido congelados; clave de compra idempotente; una entrega por orden/pago; validación de vendedor y entorno; bandeja persistente de reintentos. Historial propio en web y estados de reembolso/contracargo. No se deducen automáticamente bienes gastados ante reembolso: requiere soporte.
- P0-05 parcial: endpoint de disponibilidad verifica inicialización y conexión DB; producción no arranca ante fallo de esquema; migración nueva versionada, transaccional y con bloqueo; CI con PostgreSQL real, runtime Node 24, validación del commit publicado, errores de publicación no ocultos.
- Sesiones: identificación no concede permisos antes de verificar cuenta; mensajes secuenciales con cola limitada; acciones de cuentas registradas vuelven a comprobar versión de sesión; expiración comprobada; error de recuperación de contraseña controlado.
- Motor: corregida importación faltante que impedía crear estado completo de un jugador tardío.
- Competencia paga: apuestas nuevas e inscripción de torneos con costo bloqueadas por defecto. Salida/reembolso de inscripciones anteriores no se bloquean.
- Versión web/PWA/Android/iOS sincronizada. Preparación de bundle móvil verificada; no equivale a prueba física.
- Dependencias: Nodemailer actualizado para cerrar avisos altos; vigilancia local usa Node `--watch`, retirando la cadena vulnerable de Nodemon. Auditoría de dependencias añadida como puerta de CI.

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

La implementación está en `codex/production-foundation`; no se integró a `main` y no se disparó el despliegue de esta etapa a Render. Antes de esa integración se necesita inventario de pagos pendientes y confirmación de backup/restauración. Cambiar el protocolo de compras sin esa comprobación puede dejar compradores antiguos esperando acreditación.

- El usuario confirmó Neon como proveedor de PostgreSQL y Render como hosting. Falta acceso operativo para verificar staging, plan, instancias, backups, exportación externa cifrada y ensayo de restauración. No modificar el plan pago sin autorización.
- Dominio HTTPS, SMTP entregando mensajes, reputación y registros DNS.
- Cuenta comercial MP, vendedor correcto, secreto de firma, credenciales sandbox y configuración de webhook. Introducir secretos en el proveedor, nunca en este documento ni por chat.
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

Referencia de firma: https://www.mercadopago.com.ar/developers/en/docs/wallet-connect/notifications
