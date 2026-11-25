# Sitio legal de Moni

Página estática (sin build, sin npm) con Acerca de, Términos de uso y Privacidad, pensada
para hostearse como un sitio de Netlify aparte del de la app.

Para publicarla: en Netlify, "Add new site" → el mismo repo de GitHub → **Base directory:
`legal-site`**, **Publish directory: `legal-site`** (o `.` si Netlify ya te deja dentro de
la base directory), sin build command. Netlify le va a asignar su propio subdominio
`algo.netlify.app`, que podés renombrar desde Site settings.
