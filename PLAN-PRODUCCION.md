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

Aceptación: reiniciar a mitad de partida y recuperar los mismos puntos, participantes y reglas; una acción confirmada no se pierde ni se procesa dos veces; desplegar no borra partidas; reiniciar un torneo conserva el progreso de su cruce.

### P0-02. Hacer recuperable toda liquidación económica

[seguro] backend/server.js:1888 destruye la partida antes de completar premios normales, XP y apuestas. El pago de pot en :1999 captura errores y no crea una liquidación pendiente recuperable. El débito inicial en :2094 usa una transacción, pero el pot queda asociado a la partida en memoria.

Implementar:

- Registro persistente de partida terminada y liquidación pendiente antes de liberar la partida.
- Libro de movimientos con operation_id único, tipo, jugador, partida/orden, moneda, importe, origen y fecha.
- Idempotencia para premio, XP, apuestas, consumibles, inscripción y reembolso.
- Reserva/debito de entrada y resolución formal: pagar, liberar o devolver; registrar comisión si se mantiene.
- Trabajo persistente de liquidación que reintente fallos y se recupere al reiniciar.
- Evitar que errores en estadísticas impidan pagar lo debido.
- Restricciones de saldo, validaciones e informe de conciliación.

Aceptación: caída inmediatamente después de debitar, antes de acreditar y después de acreditar; en todos los casos el jugador recibe exactamente lo debido. Reprocesar cien veces no duplica. El saldo se explica mediante movimientos y ajustes autorizados.

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

Aceptación: intentar entrar por cada vía sin autorización, con solicitud rechazada, vencida, cupo completo o identidad ajena; ninguna consigue acceso privado. Dos ingresos simultáneos no superan cupo.

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

Aceptación: pago aprobado con usuario desconectado, pendiente y luego aprobado, rechazo, doble webhook, webhook fuera de orden, firma falsa, importe manipulado, reinicio durante entrega, devolución y disputa. No debe existir pago aprobado sin entrega ni entrega sin pago aprobado.

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

Aceptación: DB caída nunca produce estado listo; build anterior no pasa la verificación de despliegue; pipeline no aprueba integración económica con DB ausente.

## 4. Trabajo P1 por área

### Torneos

[seguro] El bracket se almacena en DB y hay avance/reembolso transaccionales. checkPendingMatches reconstruye salas desde cruces pendientes, no el estado de dados y puntuación de una partida interrumpida.

- Máquina de estados explícita: registro, cerrado, preparado, en curso, terminado, cancelado.
- Permisos de administración y auditoría de cambios de resultados.
- Ausencia de rival, plazo para presentarse, abandono, ambos ausentes y pausa por caída: reglas visibles y ejecución de servidor.
- Cupos y cobro concurrente; inscripción/cancelación durante inicio.
- BYE, rondas siguientes, campeón y premio una sola vez.
- Reprogramación y ejecución única del planificador aun si hubiera varias instancias.
- Estado claro para cada jugador: siguiente rival, sala, horario, resultado y motivo de descalificación.

Aceptación: torneos de 2, 3, 5, 8 y 16 inscritos; último cupo simultáneo; cancelación antes/durante inicio; reinicio en cruce y final; desconexión de uno o ambos; doble notificación de ganador; premio y devolución correctos.

### Cuentas y recuperación

[seguro] Hay registro con código y recuperación con vencimiento. [probable] Falta evidencia operativa de entrega y recuperación completa entre dispositivos.

- SMTP comercial verificado, dominio remitente autenticado, alertas por rebotes y fallos.
- Pruebas de código vencido/usado, reenvío, límites e intento simultáneo.
- Cambiar contraseña, cerrar todas las sesiones y revocar también WebSockets ya abiertos.
- Definir política de sesión, múltiples dispositivos y conversión invitado → cuenta conservando progreso permitido.
- Sesiones web resistentes a XSS: evaluar cookie HttpOnly con protección CSRF; almacenamiento seguro y flujo propio para nativo.
- MFA administrativo, permisos mínimos y auditoría persistente de operaciones sensibles.
- Revisar rutas async que pueden rechazar fuera de try/catch; devolver error controlado.

Aceptación: alta y reset reales con cuenta de prueba; enlace usado una vez; revocación corta acceso HTTP y conexión WS existente; otro usuario no accede a perfil, inventario, órdenes o mensajes ajenos.

### Backups y desastre

[seguro] No encontré en el repositorio una política ni un ensayo de restauración. Eso no establece cómo está configurado el proveedor real.

- Inventariar DB real, plan, retención, cifrado y permisos del proveedor.
- Copias automáticas y exportación externa con acceso separado y alertas de fallo.
- Documentar recuperación de cuenta, orden, inventario, saldo y torneo; no confundir DB backup con persistencia de partidas.
- Restaurar periódicamente en una DB aislada y verificar conteos, inventario, saldos y órdenes.
- Después de restauración conciliar pagos posteriores al punto recuperado con el proveedor antes de abrir cobros.
- Registrar migraciones versionadas y fallar si la migración crítica no completa. Evitar catch vacío que oculta esquema incompleto.
- Procedimiento escrito para caída, corrupción, eliminación accidental y filtración de credenciales.

[probable] Objetivos iniciales propuestos: RPO de datos generales ≤15 min y RTO ≤2 h. Para dinero/entregas, el objetivo es ninguna pérdida económica sin posibilidad de conciliación; los backups por sí solos no lo aseguran. Validar estos objetivos contra infraestructura y presupuesto.

### Seguridad, abuso y moderación

[seguro] Existen CSP, headers, límites HTTP/WS, autenticación y consultas parametrizadas en los flujos revisados. Su presencia no certifica ausencia de vulnerabilidades en todo el sistema.

- Pruebas adversarias con usuarios reales de test: identidad ajena, permisos, replay, carreras y modificación de comandos.
- Límites de conexiones, salas, invitaciones, intentos de código y audio por usuario/IP; tamaño y esquema por mensaje.
- Expiración/revocación en sockets de larga duración; ban debe tener efecto inmediato.
- Impedir cosméticos/equipamiento no adquirido a través de fallbacks del cliente.
- Revisar renderizado de datos del usuario en todo el frontend/panel, enlaces y contenido del catálogo.
- Cambiar onclick generado del CEO por listeners compatibles con CSP y probar cada botón operativo.
- Revisar dependencias y exposición histórica de secretos; rotar si hubo filtración, nunca publicar valores.
- Separar credenciales y roles de app, backups y administrador; monitorear ajustes de saldo y resultados manuales.
- Bloquear/reportar usuario, moderación de chat/audio y política de conservación.

Aceptación: permisos e integridad comprobados mediante comportamiento, no sólo búsqueda de texto en código. Resolver hallazgos críticos/altos antes de abrir cobros.

### Juego, economía y UX

- Hacer coincidir reglas, tutorial y motor. Implementar modificadores diarios desde catálogo de servidor o dejar de anunciarlos.
- Bloquear ingreso a partidas competitivas incompatibles con ingreso tardío.
- Revisar premios versus emisión de monedas y precio de packs; ensayar explotación mediante múltiples cuentas, abandonos y victorias pactadas.
- No vender ventajas competitivas en torneos hasta definir equidad; separar cosméticos de poderes/XP competitivo.
- Salas públicas en espera visibles y unibles; el listado actual sólo publica partidas empezadas.
- Lobby, sala, partida, tienda, perfil, torneo y modales en 320–430 px, tablet y escritorio.
- Dispositivos físicos: Safari iOS, Chrome Android y PWA instalada, teclado, notch, gesto inferior, rotación, suspensión y cambio de red.
- Accesibilidad básica: contraste, foco, etiquetas, tamaño táctil y reducción de movimiento.
- Asegurar que una actualización PWA no interrumpe una partida ni mezcla frontend viejo con protocolo nuevo.

### Operación y soporte

- Logs estructurados con correlación por orden/partida, sin tokens ni datos sensibles innecesarios.
- Métricas y alarmas: DB, reconexiones, latencia, partidas trabadas, pago aprobado sin entregar y saldo inconsistente.
- Panel de órdenes, reintentos y compensaciones auditadas; evitar reparaciones improvisadas editando SQL.
- Botón operativo para pausar pagos, nuevas partidas o torneos por separado.
- Pruebas de carga con objetivo acordado y margen de seguridad; medir latencia, memoria, conexiones y event loop.
- Dominio, HTTPS, soporte de compras, política de devoluciones y comprobantes/facturación definidos antes de vender.
- Privacidad, términos, reglas de concursos, edades admitidas y derechos sobre gráficos/sonidos; validar con responsables legales/contables según mercado.

## 5. Cobros y canales

[probable] Lanzamiento sugerido: cosméticos de contenido fijo en web/PWA, cuenta registrada obligatoria para comprar, torneos gratuitos durante beta, sin retiro ni premios de dinero. Apuestas con moneda comprable requieren revisión específica del proveedor y del encuadre legal; no asumir aprobación por llamarla moneda virtual.

[seguro] Los proyectos nativos no contienen integración terminada de compras de las tiendas; el botón de compra se deshabilita en frontend/app.js:5945. Planificar Google Play Billing y StoreKit, verificación de compra en servidor, notificaciones de devolución, restauración de derechos y productos por tienda. Las excepciones de cobro externo dependen de región/programa; no tratarlas como autorización general.

Fuentes primarias consultadas:

- [Mercado Pago: autenticidad de webhooks](https://www.mercadopago.com.ar/developers/en/docs/zero-dollar-auth/additional-content/your-integrations/notifications/webhooks).
- [Stripe: negocios restringidos](https://stripe.com/legal/restricted-businesses).
- [Google Play: pagos](https://support.google.com/googleplay/android-developer/answer/9858738?hl=en).
- [Apple: compras integradas](https://developer.apple.com/in-app-purchase/).
- [Render: backups y recuperación](https://render.com/docs/postgresql-backups). Si DB estuviera en Render, el plan gratuito no incluye estas capacidades administradas; verificar primero el proveedor real.

## 6. Orden de ejecución y entregas

| Etapa | Trabajo | Condición para avanzar |
|---|---|---|
| A. Inventario operativo | [probable] Confirmar modelo comercial, proveedores, backups, dominio, secretos configurados, SMTP y ambiente de test; reproducir hallazgos en test. | Matriz de configuraciones y decisiones comerciales, sin copiar secretos al repo. |
| B. Contención y seguridad funcional | [probable] Ingreso privado/torneos, panel CSP, mantenimiento ante DB caída, CI con DB real y switches económicos. | Privacidad y permisos probados; despliegue identifica build real. |
| C. Persistencia y recuperación | [probable] Partidas durables, comandos únicos, resultados y liquidación recuperable, backups y migraciones. | Reinicios y restauración ensayados sin pérdida económica ni duplicados. |
| D. Comercio web | [probable] Órdenes, firma MP, idempotencia, conciliación, devoluciones y UI de compras. | Matriz de pagos de prueba completa; entrega y saldo correctos. |
| E. Juego y torneos | [probable] Regla diaria, ausencias, bracket, interfaz y reconexión móvil. | Casos de juego/torneo y dispositivos físicos aprobados. |
| F. Beta comercial controlada | [probable] Usuarios limitados, observación, soporte, un cobro real pequeño y su devolución autorizados. | Evidencia de cobro, entrega, comprobante y recuperación; sin fallos críticos/altos abiertos. |
| G. Lanzamiento web/PWA | [probable] Abrir gradualmente, revisar métricas y economía. | Capacidad y alertas suficientes; operación documentada. |
| H. Nativo y crecimiento | [probable] Compras de tiendas, publicación, promoción y escala basada en mediciones. | Cumplimiento del canal y compras nativas verificadas. |

[adivinando] Sin inventario de infraestructura y sin reproducir todas las carreras no hay plazo confiable. El alcance debe presupuestarse por etapa después de A; no prometer terminar todo en pocos días. Las correcciones visibles son menores que construir recuperación económica y probarla.

## 7. Puerta de salida: cuándo se puede cobrar

- Ningún P0 abierto ni hallazgo crítico/alto pendiente en flujos de cuenta, salas y dinero.
- Cuenta comercial, modelo permitido, facturación y términos definidos.
- Cada cobro se asocia a una orden y termina entregado, pendiente recuperable o reembolsado.
- Webhook repetido, reintento y reinicio no duplican saldo/inventario/premio.
- Firma falsa y monto/moneda/entorno incorrectos no acreditan.
- Recuperación de DB ensayada y pagos posteriores conciliados.
- Partida y cruce de torneo sobreviven a despliegue; o existe política explícita y automática de cancelación/reembolso antes de ofertarlos.
- Registro, email, reset y revocación comprobados de extremo a extremo.
- Salas privadas no se atraviesan por otra ruta; terceros no entran a un cruce.
- Panel permite asistir al cliente sin vulnerar roles ni la CSP.
- Interfaz y reconexión aprobadas en teléfonos reales.
- Alarmas, switches, soporte y procedimiento de incidente funcionando.

[seguro] Las pruebas previas aprobaron reglas y rutas básicas, pero no satisfacen esta puerta de salida: parte de seguridad comprueba presencia de cadenas en el código y el CI no levanta PostgreSQL. El próximo trabajo debe ampliar pruebas de comportamiento sobre DB y proveedores de test, no perseguir solamente un contador de pruebas verdes.
