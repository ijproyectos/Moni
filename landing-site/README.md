# Landing de Moni

Página estática (sin build, sin npm) inspirada en la estructura de getkesef.app, adaptada
con contenido real de Moni (sin cifras ni reseñas inventadas).

Para publicarla: en Netlify, "Add new site" → el mismo repo de GitHub → **Base directory:
`landing-site`**, **Publish directory: `landing-site`** (o `.` si Netlify ya te deja dentro
de la base directory), sin build command. Si el sitio de `legal-site` ya está publicado en
otro sitio de Netlify, los links del footer (`/legal-site/#terminos`, etc.) hay que
cambiarlos por la URL completa de ese sitio.
