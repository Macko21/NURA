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

## 2. Estado Actual – Qué ya está Implementado

| Área | Estado | Comentario |
|------|--------|------------|
| **Motor de juego** | ✅ | Reglas, turnos, bots, salas, torneos funcionan en memoria. Tests de reglas y regresión presentes. |
| **Persistencia básica** | ⚠️ | `database.js` crea tablas, pero la mayoría de datos críticos (partidas, liquidación) todavía se guardan en memoria (P0‑01). |
| **Autenticación** | ✅ | JWT, bcrypt, manejo de contraseñas, flujo de recuperación (aunque sin pruebas de entrega de email). |
| **Panel administrativo** | ✅ | Roles y registro de acciones; algunos botones fallan por CSP. |
| **Pagos web** | ⚠️ | Integración con Mercado Pago parcial – firma, idempotencia, reintentos implementados, pero sin checkout activo ni pruebas de producción. Stripe deshabilitado. |
| **Pagos nativos** | ❌ | No hay integración con Google Play Billing ni Apple In‑App Purchase. |
| **Backups / Recuperación** | ❌ | No existe política de backups automática ni pruebas de restauración en el proveedor (Render/Neon). |
| **Monitorización & Alertas** | ❌ | Falta health‑checks robustos, métricas, logging estructurado, integración con alertas (Prometheus, Sentry, etc.). |
| **CI/CD** | ⚠️ | Tests unitarios y de integración corren, pero CI no arranca PostgreSQL real; no hay despliegue automatizado a staging/producción. |
| **Infraestructura** | ❌ | No hay Docker/Kubernetes, no hay archivo `docker-compose.yml`, ni definición de entorno en Render/Neon. |
| **Security** | ⚠️ | CSP y headers presentes, pero falta auditoría completa, pruebas de penetración, gestión de secretos, rotación de credenciales. |
| **Documentación de Operaciones** | ⚠️ | `ESTADO-PRODUCCION.md` describe pasos, pero falta Playbook de despliegue, rollback, runbooks de incidentes. |
| **Testing de carga** | ❌ | No hay pruebas de estrés ni benchmarks de concurrencia. |
| **Accesibilidad & UX** | ⚠️ | Se menciona soporte de dispositivos, pero no hay pruebas de accesibilidad ni pruebas en dispositivos físicos. |

## 3. Brechas para llegar a "100 % Producción"

1. **Persistencia completa de partidas y liquidación (P0‑01, P0‑02)**
2. **Implementación y validación de pagos seguros en producción**
   - Finalizar webhook de MP, habilitar Stripe o Google/Apple Billing.
3. **Política de backups y pruebas de restauración**
4. **Monitorización, logging estructurado y alertas**
5. **CI/CD robusto con base de datos real, despliegue continuo y rollback**
6. **Infraestructura reproducible (Docker, Terraform, Render/Neon config)**
7. **Seguridad operativa completa**
   - Escaneo de vulnerabilidades, pruebas de penetración, gestión de secretos (Vault, .env‑prod).
8. **Pruebas de carga y performance**
9. **Validación en dispositivos físicos (Android / iOS) y accesibilidad**
10. **Documentación de operaciones y runbooks**
11. **Cumplimiento legal y fiscal (términos, RGPD, licencia de juego, etc.)**

## 4. Plan de Acción Detallado

El plan se divide en **Fases** (A‑G) siguiendo la tabla de etapas de `PLAN-PRODUCCION.md`. Cada tarea incluye responsable estimado, prioridad y ventana de tiempo.

### 4.1. Tabla de Roadmap

| Fase | Objetivo | Tareas Clave | Prioridad | Responsable | Duración estimada |
|------|----------|--------------|-----------|-------------|-------------------|
| **A** | Inventario operativo | - Verificar modelo comercial, proveedores, dominio, SMTP, secretos.<br>- Reproducir hallazgos en entorno de pruebas.<br>- Crear matriz de decisiones. | 🔴 P0 | PO / Lead Dev | 1‑2 semanas |
| **B** | Contención y seguridad funcional | - Implementar ingreso privado robusto (P0‑03).<br>- Corregir CSP y botones `onclick` (P0‑05).<br>- Añadir readiness probe que dependa de DB.<br>- CI con PostgreSQL real. | 🔴 P0 | Backend Lead | 2‑3 semanas |
| **C** | Persistencia y recuperación | - Diseñar esquema de persistencia de partidas (P0‑01).<br>- Implementar liquidación recuperable (P0‑02).<br>- Añadir job de backup y pruebas de restauración. | 🔴 P0 | DB Engineer | 3‑4 semanas |
| **D** | Comercio web | - Habilitar checkout completo Mercado Pago (firma, idempotencia).<br>- Desactivar Stripe o completarlo.<br>- Tests de fin‑to‑end de pagos y reembolsos. | 🔴 P0 | Payments Engineer | 2‑3 semanas |
| **E** | Juego y torneos | - Completar lógica de torneos (P1).<br>- Implementar modificadores diarios y política de ingreso tardío.<br>- Pruebas en dispositivos reales (Android/iOS). | 🟠 P1 | Frontend / Mobile Lead | 3‑4 semanas |
| **F** | Beta comercial controlada | - Seleccionar usuarios beta (invites).<br>- Activar cobro real pequeño y proceso de reembolso.<br>- Monitorizar métricas clave (latencia, errores, pagos). | 🟠 P1 | Product Owner | 2 semanas (después de D) |
| **G** | Lanzamiento Web/PWA | - Deploy gradual con feature flags.<br>- Escalado horizontal (Docker/K8s).<br>- Monitoreo de health, alertas y autoscaling.<br>- Documentar playbook de rollout y rollback. | 🟢 P2 | DevOps Lead | 2‑3 semanas |

> **Nota**: Las prioridades (🔴 P0, 🟠 P1, 🟢 P2) siguen la nomenclatura del plan existente.

### 4.2. Detalle de Tareas Críticas

#### 4.2.1. Persistencia de partidas (P0‑01)
1. Definir modelo DB: tabla `games`, `rooms`, `events` con UUID y versión.
2. Migración (`scripts/productionMigrations.js`) que crea índices y constraints.
3. Refactorizar `roomManager.js` y `diceManager.js` para usar DAO en vez de `Map`.
4. Implementar **snapshot** periódico y restauración al iniciar.
5. Tests de integración que simulan caída del servidor y verificación de recuperación.

#### 4.2.2. Liquidación recuperable (P0‑02)
1. Tabla `settlements` con `operation_id`, `status` (pending/complete).
2. Añadir lógica en `paymentManagerMP.js` para crear registro antes de liberar fondos.
3. Idempotencia mediante **unique constraint** sobre `operation_id`.
4. Reintento con back‑off y registro de intentos.
5. Verificar con pruebas de simulación de fallo después del débito.

#### 4.2.3. Webhooks y pagos seguros (P0‑04)
- Implementar validación de `x-signature` en MP y Stripe.
- Persistir orden antes del checkout con `order_id`, `price`, `currency`.
- Añadir tabla `orders` y relacionarla con `settlements`.
- Crear endpoint `/health/payments` que verifique conectividad con proveedores.

#### 4.2.4. Backups y recuperación (P0‑05)
- Configurar **automated backups** en Render/Neon (daily, retained 30 d).
- Script `scripts/backup.sh` que exporta dump, cifra y sube a S3.
- Cron job (GitHub Actions) que ejecuta restauración en entorno staging y valida integridad.

#### 4.2.5. Monitorización & Observabilidad
- Integrar **Winston** o **pino** con JSON estructurado.
- Exportar métricas a **Prometheus** (requests, latencia, DB pool).
- Configurar alertas en **Grafana** o **Sentry** para errores críticos.
- Añadir endpoint `/health/ready` que chequea DB, Redis (si se añade), y dependencias externas.

#### 4.2.6. CI/CD Mejorado
- Añadir `docker-compose.yml` con servicios `api`, `db`, `redis`.
- GitHub Actions workflow `ci.yml` que levanta PostgreSQL real y ejecuta `npm test`.
- Workflow `cd.yml` que despliega a Render (o a Kubernetes) tras merge a `main`.
- Implementar **blue‑green deployment** y script de rollback.

#### 4.2.7. Seguridad Operativa
- Escaneo con **npm audit**, **Snyk**, **TruffleHog** para secretos.
- Revisar CSP, HSTS, X‑Content‑Type‑Options, Referrer‑Policy.
- Implementar MFA para cuentas admin y rotación de `JWT_SECRET`.
- Política de retención de logs y cumplimiento RGPD.

#### 4.2.8. Pruebas de carga
- Crear script **k6** que simula 10 k concurrencia, 100 k partidas simultáneas.
- Medir latencia de websockets, tiempo de respuesta de `/api/game/*`.
- Ajustar pool de conexiones, usar **PM2** o **node clustering**.

#### 4.2.9. Validación mobile & accesibilidad
- Ejecutar pruebas en **Firebase Test Lab** (Android) y **Xcode Simulator** (iOS).
- Auditoría de accesibilidad con **axe**.
- Verificar que PWA funciona offline y con Service Workers.

## 5. Checklist de Lanzamiento a Producción

| ✅ | Ítem |
|----|------|
| ☐ | Persistencia de partidas y liquidación implementada y testeada |
| ☐ | Webhooks de pagos firmados y end‑to‑end test con entorno sandbox |
| ☐ | Backups automáticos configurados y restauración verificada |
| ☐ | Health‑checks (`/health/ready`, `/health/live`) retornan 200 solo cuando DB está operativa |
| ☐ | Métricas y alertas configuradas (latencia > 200 ms, error rate < 1 %) |
| ☐ | CI ejecuta contra PostgreSQL real y despliega a staging automáticamente |
| ☐ | Docker/K8s files presentes y pruebas de despliegue local exitosas |
| ☐ | Escaneo de vulnerabilidades sin vulnerabilidades críticas |
| ☐ | Pruebas de carga superan 10 k concurrentes sin degradación > 20 % |
| ☐ | Documentación de runbook de despliegue, rollback y gestión de incidentes |
| ☐ | Cumplimiento legal (términos, política de privacidad, GDPR, regulación de juegos) |
| ☐ | Pagos nativos integrados o deshabilitados explícitamente en producción |
| ☐ | Feature flag para `PAYMENTS_ENABLED` está OFF hasta que se valide el flujo completo |

---

**Próximos pasos**: el equipo debe revisar esta hoja, asignar responsables y ajustar estimaciones de tiempo. Una vez aprobada, se pueden crear tickets en el tracker (por ejemplo, GitHub Issues) siguiendo la numeración de bloqueos (P0‑01, P0‑02, …) y rastrear el progreso.

---

*Este documento fue generado automáticamente el 7 de octubre de 2026 a partir del análisis del repositorio y del plan de producción existente.*
