# Logos de servicios (Suscripciones)

Se usan solo para identificar el servicio que la persona contrató dentro de Moni (uso nominativo). Las marcas
y logos pertenecen a sus dueños; Moni no tiene relación con ellos ni uso comercial de las marcas. Los archivos
están guardados localmente (sin enlaces externos). Si algún titular pide retirar un logo, se borra el archivo y
la app muestra un ícono genérico: el catálogo no depende de ninguno.

| Archivo | Fuente | Licencia de la fuente |
| --- | --- | --- |
| claude, gemini, perplexity, cursor, copilot, elevenlabs, suno, netflix, hbomax, spotify, youtube, appletv, crunchyroll, icloud, dropbox, notion, nordvpn, playstation, uber | [Simple Icons](https://simpleicons.org) 16.36 (`simple-icons`), color de marca aplicado al trazo | CC0-1.0 (las marcas siguen siendo de sus dueños) |
| chatgpt (OpenAI), midjourney, runway | [Lobe Icons](https://github.com/lobehub/lobe-icons) (`@lobehub/icons-static-svg`) | MIT |
| canva | [CoreUI brand icons](https://icons.coreui.io) vía `@iconify-json/cib`, color de marca | CC0-1.0 |
| adobe | colección `logos` de Iconify (`@iconify-json/logos`) | CC0-1.0 |
| microsoft365, primevideo, xbox (Game Pass), nintendo (Switch Online), rappi, googleone, onedrive, disneyplus | [Wikimedia Commons](https://commons.wikimedia.org) (SVG) | Dominio público (figuran como «marca registrada») |

Sin logo adecuado, se muestra un ícono genérico: Smart Fit, Megatlon, SportClub y otros gimnasios, VPN genérica y
servicios personalizados.

## Logos de bancos, billeteras y tarjetas (Medios de pago · "Agregar rápido")

Catálogo en `src/features/accounts/domain/bankCatalog.ts`. El dueño del producto aceptó el riesgo de marca y
publicará una política de uso y privacidad en la próxima versión. Mismo criterio que arriba: archivos locales,
uso nominativo, sin enlaces externos.

| Archivo | Fuente | Versión | Licencia de la fuente |
| --- | --- | --- | --- |
| mercadopago, visa, mastercard, americanexpress, hsbc | [Simple Icons](https://simpleicons.org), descargados de `https://cdn.jsdelivr.net/npm/simple-icons@16.36.0/icons/<slug>.svg`, con el color de marca (hex de `data/simple-icons.json`) aplicado al trazo y sin el `<title>` | `simple-icons@16.36.0` | CC0-1.0 (las marcas siguen siendo de sus dueños) |

### Logos pendientes: el dueño debe aportar los archivos oficiales

No se dibujó ni inventó ninguno. Mientras falte el archivo, la app muestra un avatar con las iniciales sobre el
color de marca (aproximado). Buscados sin éxito en Simple Icons (16.36.0 y versiones anteriores) y descartados
otros sets por licencia (Arcticons es CC BY-SA 4.0, con obligación de compartir igual).

Ualá, Cuenta DNI, Brubank, Lemon, Naranja X, BBVA, Banco Nación, Macro, ICBC, Banco Provincia, Galicia,
Santander.

Para sumar uno: copiar el SVG o PNG a `src/assets/brands/<nombre>.svg` (o `.png`), poner `<nombre>` en el campo
`logo` de su entrada en `bankCatalog.ts` y listar acá la fuente, versión y licencia. `logos.ts` toma todos los
archivos de la carpeta automáticamente. Un test falla si queda un archivo sin usar.
