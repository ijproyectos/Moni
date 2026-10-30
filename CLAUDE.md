# Moni — instrucciones del proyecto

Estas reglas valen para todas las personas (y asistentes) que trabajen en el repositorio, incluido Joni.

## Forma de trabajo con Git

1. **Antes de empezar**, traé lo último de GitHub: `git pull` (con `--ff-only` si el árbol está limpio). Si hay cambios locales sin guardar, guardalos primero (commit o `git stash`).
   Si el pull trae cambios en `package.json`, `package-lock.json` o `vite.config.ts`, corré `npm install` y **reiniciá el servidor de desarrollo** (`npm run dev`): uno que quedó abierto desde antes sigue con la configuración vieja y falla con errores como `Failed to resolve import "virtual:pwa-register"`.
2. **Cada cambio terminado y probado se publica**: commit y `git push` a `main`. Un cambio no está terminado hasta que pasan `npx tsc -b`, `npx eslint . --max-warnings 0`, `npx vitest run` y `npm run build`.
3. **Antes de subir**, hacé `git fetch` y revisá que no se pisen cambios de la otra persona: mirá `git log HEAD..origin/main` y los archivos que cambió (`git diff --name-only HEAD origin/main`). Si hay novedades, traelas (`git pull`) y volvé a correr las verificaciones antes del push.
4. **Si hay conflictos**, resolvelos con cuidado, conservando el trabajo de las dos partes. No descartes ni borres código ajeno sin consultar antes a su autor (o a quien coordina el proyecto).
5. **Mantené el local sincronizado con GitHub**: después de cada push, `git status -sb` debe mostrar `main...origin/main` sin adelanto ni atraso. No uses `git push --force` sobre `main`.
6. **No subas** archivos temporales ni de pruebas (capturas, `__preview*`, `dist/`), duplicados (por ejemplo «… 2.ts»), carpetas de trabajo locales ni **secretos** (`.env*` reales, claves, tokens). Agregá los archivos por nombre (`git add <ruta>`), no con `git add -A`, y revisá `git status` antes de cada commit.
7. Los mensajes de commit van en español: un título corto y, debajo, una descripción de lo que cambió y por qué.

## Convenciones

- No se agregan notas de versión ni un sistema de versionado dentro de la app.
- Los cambios en Supabase (migraciones, funciones, cron) se aplican solo con autorización explícita y siempre con respaldo previo.
