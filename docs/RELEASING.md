# Releasing

`package.json` is the single source of truth for the app version. Vite injects it at build time
(`__APP_VERSION__`), so the "Moni vX.Y.Z" line in Profile follows it automatically. When a commit
SHA is available (`COMMIT_REF` on Netlify, or `git rev-parse --short HEAD` locally) it is appended
as build metadata, e.g. `0.2.0+a1b2c3d`.

To cut a release, on `main` with a clean working tree:

```sh
npm version patch   # or: npm version minor
git push --follow-tags
```

`npm version` bumps `package.json`, commits and tags. Do not edit the version by hand or anywhere
else in the UI.
