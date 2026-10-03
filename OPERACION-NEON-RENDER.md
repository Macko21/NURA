# Operación: Neon + Render

Confirmado por el usuario: base en Neon y aplicación en Render. No se comprobó el plan contratado, ventanas de restauración, secretos ni backups efectivos.

## Antes de publicar esta rama

1. En Neon, identificar proyecto, rama de producción y versión de PostgreSQL. No copiar contraseñas a documentación, capturas o chat. Registrar la ventana real de restauración configurada; no suponer una duración por el nombre del plan.
2. Preparar una rama separada para staging, con credenciales diferentes y sin pagos reales. Una rama derivada puede contener datos personales: limitar acceso, no enviar correos/push y usar cuentas ficticias; preferir datos de prueba en staging.
3. Exportar un respaldo externo cifrado con herramientas PostgreSQL compatibles con la versión del servidor. Guardarlo fuera del repositorio y del disco temporal de Render. Restaurarlo en un destino de prueba vacío, nunca encima de producción, y comprobar usuarios, saldos, inventario, pagos y torneos. Una rama de Neon dentro del mismo proyecto no reemplaza ese respaldo independiente.
4. Revisar pagos anteriores pendientes y el protocolo antiguo de notificaciones. Las nuevas órdenes usan UUID y firmas HMAC. Una referencia antigua queda para conciliación manual: no hacer una segunda acreditación sin revisar `payment_events` y los movimientos del usuario.
5. En Render, comprobar que `PAYMENTS_ENABLED=false` y `PAID_COMPETITION_ENABLED=false`, la rama de despliegue y `/health/ready` como comprobación de disponibilidad. Conservar una sola instancia de juego hasta implementar propiedad/persistencia de salas. No asumir que editar el blueprint cambió las opciones de un servicio ya creado.
6. Esperar a que finalicen partidas en curso antes de publicar. Render puede superponer procesos durante un despliegue y envía SIGTERM al anterior; eso no preserva por sí solo los Maps del motor. La versión 5.1.1 recupera resultados guardados, no una partida todavía en curso.
7. Publicar primero staging, ejecutar pruebas con datos ficticios y registrar el commit exacto. Solo después integrar a main para producción. No cambiar de plan ni contratar servicios automáticamente.

## Prueba operativa de la liquidación

- Usar una cuenta ficticia registrada en staging; terminar una partida y guardar su UUID.
- Verificar que existe una fila en `finished_matches` y movimientos únicos en `game_operations`. Si el final no se pudo guardar, la sala no debe ofrecer una revancha confirmada.
- Provocar indisponibilidad en el entorno de prueba, no en producción. Un resultado ya guardado que aún no pudo liquidarse debe permanecer `pending` y procesarse tras recuperar la conexión/reiniciar.
- Comprobar que monedas, XP y estadísticas cambian una sola vez y que repetir el procesamiento no agrega movimientos ni premios.
- La suite automatizada `scripts/settlement-db-test.js` cubre rollback de escritura parcial, recuperación desde otro proceso, reintentos concurrentes y pérdida de confirmación de COMMIT con PostgreSQL local aislado.

## Informe de solo lectura

En un entorno autorizado con DATABASE_URL configurada, ejecutar `node scripts/production-report.js`. No pasar credenciales como argumentos visibles ni pegarlas en chat.

El informe usa una transacción de solo lectura y devuelve contadores agregados, sin nombres, correos ni claves. Funciona también antes de crear las tablas nuevas. Señala obligaciones de más de 15 minutos y diferencias entre el libro nuevo y los movimientos. No es una conciliación completa de toda la economía anterior ni detecta pagos que el proveedor nunca notificó.

## Retroceso y recuperación

- Conservar las tablas nuevas y el historial al retroceder código. No borrar registros para hacer que una migración parezca pendiente.
- No activar el checkout antiguo: no entiende las órdenes UUID nuevas. Conciliar pendientes antes de cambiar el protocolo.
- Restaurar producción a un instante anterior puede perder órdenes y créditos posteriores. Primero documentar el incidente, conservar evidencia y restaurar a una rama de prueba. Conciliar contra el proveedor y los registros externos antes de autorizar un cambio de producción.
- La aceptación de backup exige fecha, ubicación externa, ensayo de restauración y mediciones reales de pérdida máxima y tiempo de recuperación. Hasta entonces RPO/RTO son objetivos, no garantías.

## Fuentes oficiales consultadas

- Neon: [restauración de ramas](https://github.com/neondatabase/website/blob/main/content/docs/postgres/backup-restore/branch-restore.md).
- Render: [flujo de despliegue y SIGTERM](https://render.com/docs/deploys).
