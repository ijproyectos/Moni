# Android — generar el AAB firmado y subirlo a Google Play Console

Moni es una app React + Vite envuelta con **Capacitor** (no React Native ni Expo/EAS). El shell nativo
Android vive en `android/`, generado con `npx cap add android`. `versionCode`/`versionName` de
`android/app/build.gradle` se sincronizan solos desde `package.json` vía `scripts/sync-android-version.mjs`
(ver `docs/RELEASING.md` para cómo se corta una versión).

Package name (`applicationId`): **`moni.app`** — coincide con `appId` en `capacitor.config.ts` y con el
nombre que ya quedó fijado como definitivo en el listado de Google Play Console. El paquete interno de
Java/Kotlin (`namespace` en `build.gradle`, donde vive `MainActivity.java`) sigue siendo
`com.ijproyectos.moni` — no tiene que coincidir con el `applicationId`, Android los trata por separado.
No se cambia el `applicationId` de nuevo sin decisión explícita: Google Play liga el listado de la app a
este id para siempre, apenas se confirma.

## 1. Crear el keystore de firma (una sola vez, lo hacés vos)

Nunca compartas el `.jks` ni sus contraseñas, y nunca los subas al repo (`android/.gitignore` ya los
ignora). Si lo perdés, no vas a poder volver a publicar actualizaciones de la misma app en Play Store.

```sh
keytool -genkeypair -v -keystore moni-release.keystore -alias moni \
  -keyalg RSA -keysize 2048 -validity 10000
```

Guardá `moni-release.keystore` en un lugar seguro fuera del repo (o dentro de `android/`, que ya lo
ignora Git).

## 2. Completar `android/keystore.properties`

Copiá `android/keystore.properties.example` a `android/keystore.properties` (no versionado) y completá:

```properties
storeFile=../moni-release.keystore
storePassword=<la que elegiste>
keyAlias=moni
keyPassword=<la que elegiste>
```

`storeFile` es relativo a `android/app/`. Sin este archivo, `build.gradle` arma el build de `release`
sin firmar (sirve para `cap sync`/debug, no para subir a Play Console).

## 3. Generar el AAB firmado

```sh
npm run build          # build web
npx cap sync android    # copia el build web + sincroniza plugins nativos
cd android
./gradlew bundleRelease
```

El archivo queda en `android/app/build/outputs/bundle/release/app-release.aab`.

## 4. Google Play Billing (RevenueCat)

`@revenuecat/purchases-capacitor` (hoy `^14.1.2`) trae como dependencia nativa
`com.revenuecat.purchases:purchases-hybrid-common:20.10.0`, que a su vez resuelve la Play Billing
Library que necesita — **no hace falta agregar nada a mano en `build.gradle`** para eso.

Lo que sí es un paso aparte, en la consola web de Google Play (no en el código):
- La app tiene que existir como listado en Play Console y tener subido al menos un AAB a un canal
  (interno alcanza) antes de poder probar compras reales.
- Los productos de suscripción (igual nombre/id que uses en el dashboard de RevenueCat) se crean en
  Play Console → Monetización → Productos, no en el repo.
- RevenueCat necesita la clave de API de Google Play (Service Account JSON) para verificar compras
  server-side — se configura en el dashboard de RevenueCat, no acá.

Las API keys públicas de RevenueCat para el cliente van en `.env` (`VITE_REVENUECAT_ANDROID_API_KEY`,
ver `.env.example`), no en `build.gradle`.

## 5. Subir a pruebas internas

1. [Play Console](https://play.google.com/console) → tu app (creala si todavía no existe, con el
   mismo `applicationId`) → **Testing → Internal testing**.
2. **Create new release**, subí el `.aab` del paso 3.
3. Agregá testers (lista de emails o un grupo de Google Groups) en la pestaña **Testers** de ese canal.
4. Guardá y publicá el release de pruebas internas — Google no revisa manualmente este canal, suele
   estar disponible en minutos.
