# Los 10.000 de Macko

Juego de dados multijugador instalable como PWA, con partidas en tiempo real, bots, perfiles, tienda, torneos y panel administrativo.

## Requisitos

- Node.js 18 o superior.
- PostgreSQL. El proyecto no usa SQLite.

## Puesta en marcha

1. Copiá `.env.example` como `.env` y completá `DATABASE_URL` y `JWT_SECRET`.
2. Para habilitar el panel administrativo, configurá también `CEO_SECRET`, `CEO_ADMIN_USERNAME` y `CEO_ADMIN_PASSWORD`.
3. Instalá y ejecutá:

```sh
npm ci
npm start
```

El servidor crea y migra las tablas necesarias al iniciar. La aplicación queda disponible en `http://localhost:3000` salvo que `PORT` indique otro puerto.

## Comprobaciones

```sh
npm run test:syntax
npm test
npm run test:mobile
```

## Aplicaciones móviles con Capacitor

La aplicación usa el mismo juego web y backend, empaquetados como proyectos nativos para Android e iOS. El identificador de ambas tiendas es `com.macko.los10000`.

Preparar y sincronizar ambos proyectos:

```sh
npm run mobile:sync
```

Android requiere JDK 21, Android Studio y Android SDK 36. Para generar un APK de prueba:

```sh
npm run mobile:build:android
```

El resultado queda en `android/app/build/outputs/apk/debug/app-debug.apk`. Para publicar en Google Play hace falta crear una clave de firma privada y generar un Android App Bundle firmado desde Android Studio.

iOS requiere macOS, Xcode y una cuenta de Apple Developer:

```sh
npm run mobile:ios
```

Las compras digitales web continúan usando Mercado Pago. Dentro de las aplicaciones nativas están deshabilitadas hasta integrar Google Play Billing y Apple In-App Purchase con productos creados en cada tienda; no se debe redirigir a un cobro externo para vender monedas o skins dentro de las apps.

## Seguridad operativa

- Generá secretos distintos de al menos 32 bytes para `JWT_SECRET` y `CEO_SECRET`.
- La contraseña inicial del panel administrativo debe tener al menos 14 caracteres.
- No guardes `.env`, URLs de base de datos ni claves de proveedores en Git.
- Configurá las firmas de webhook antes de habilitar pagos reales.
- Rotá inmediatamente cualquier credencial que haya aparecido alguna vez en un archivo versionado.
- No guardes claves de firma Android, perfiles de distribución iOS ni credenciales de las tiendas en Git.
