# Moni — Kit de inicio MVP

Este paquete contiene documentación y el prompt para iniciar el desarrollo en Claude Code, reutilizando las pantallas existentes de Claude Design.

## Archivos
- `PROMPT_CLAUDE_CODE.md`: pegá su contenido en Claude Code al abrir tu repositorio.
- `docs/MVP_SCOPE.md`: alcance funcional, exclusiones y criterios de aceptación.
- `docs/ARCHITECTURE.md`: stack, arquitectura y seguridad.
- `docs/IMPLEMENTATION_PLAN.md`: sprints, entregables y reglas de trabajo.
- `.env.example`: variables de entorno de referencia, sin secretos.
- `netlify.toml.example`: ejemplo de build y redirección SPA (adaptar antes de usar).

## Inicio
1. Abrí en Claude Code el repositorio que contiene las pantallas generadas.
2. Incorporá estos documentos a la raíz del proyecto.
3. Pegá el contenido de `PROMPT_CLAUDE_CODE.md`.
4. Revisá el diagnóstico y aprobá el plan antes de autorizar cambios.

**Importante:** este kit no incluye el código de tus pantallas ni configura Supabase/Netlify automáticamente. Claude debe inspeccionar primero el proyecto real.
