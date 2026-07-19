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
```

## Seguridad operativa

- Generá secretos distintos de al menos 32 bytes para `JWT_SECRET` y `CEO_SECRET`.
- La contraseña inicial del panel administrativo debe tener al menos 14 caracteres.
- No guardes `.env`, URLs de base de datos ni claves de proveedores en Git.
- Configurá las firmas de webhook antes de habilitar pagos reales.
- Rotá inmediatamente cualquier credencial que haya aparecido alguna vez en un archivo versionado.
