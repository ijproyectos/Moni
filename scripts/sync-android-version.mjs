#!/usr/bin/env node
// Keeps android/app/build.gradle's versionName/versionCode in sync with package.json, so a native build and a
// web build of the same release always report the same "Moni vX.Y.Z" (see src/shared/ui/AppVersion.tsx).
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const pkg = JSON.parse(readFileSync(`${root}package.json`, 'utf8'))
const version = pkg.version

const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version)
if (!match) throw new Error(`package.json version "${version}" no es semver (X.Y.Z)`)
const [, major, minor, patch] = match.map(Number)
const versionCode = major * 10000 + minor * 100 + patch

const gradlePath = `${root}android/app/build.gradle`
const gradle = readFileSync(gradlePath, 'utf8')
const updated = gradle
  .replace(/versionCode\s+\d+/, `versionCode ${versionCode}`)
  .replace(/versionName\s+"[^"]*"/, `versionName "${version}"`)

if (updated !== gradle) {
  writeFileSync(gradlePath, updated)
  console.log(`android/app/build.gradle -> versionName "${version}", versionCode ${versionCode}`)
} else {
  console.log(`android/app/build.gradle ya estaba en versionName "${version}", versionCode ${versionCode}`)
}
