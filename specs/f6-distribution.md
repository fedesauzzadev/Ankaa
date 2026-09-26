# f6-distribution · Distribución privada (tarball + registry) y licencia offline

| Campo | Valor |
|---|---|
| Estado | cerrada |
| Fecha | 2026-09-26 |
| Fase | 6 |
| Deriva de | Re-priorización de producto 2026-09-26 ("privado, instalable, vendible"); FR-60; docs/05; specs `f2-config`, `f4-mcp-server` |

## 1. Objetivo / user story

Como organización que **compra** ApiGovScan quiero instalarlo sin que nada del análisis salga de mi red (npm privado o tarball/air-gap), con una **licencia offline** que el vendor me entrega, y updates opcionales vía registry privado.

## 2. Alcance

### In

- **Licencia offline** (INV-1 compatible: cero phone-home):
  - Formato: `AGS-<customer>-<YYYYMMDD>-<sig12>`; `sig = HMAC-SHA256(SECRET, "ags.v1.<customer>.<expiry>").slice(0,12)`.
  - Resolución: flag `--license-key` > env `APIGOVSCAN_LICENSE_KEY` > config `license.key`.
  - Comandos gateados: `analyze` y `mcp` (exit 2 si falta/inválida/expirada, mensaje EN claro).
  - Comando `apigovscan license [--key K]` → estado (customer, expiry, valid).
  - Config schema strict gana `license: { key?: string }`.
  - Keygen vendor-side: `scripts/gen-license.mjs --customer acme --expiry 2027-09-26 [--secret S]`.
- **Empaquetado autocontenido**:
  - Bundle esbuild (`dist/apigovscan.mjs`, node20, ESM, deps bundled) → tarball npm sin `workspace:*` en runtime.
  - `bin/apigovscan.js` apunta al bundle; `packs/elite` ya se descubre caminando hacia arriba (pack-fs).
  - `package.json`: licencia comercial (`UNLICENSED` + `LICENSE.md` proprietary), `repository`, `publishConfig.registry` (GitHub Packages), `files` (+`LICENSE.md`).
- **Canales**:
  - Tarball: `pnpm --filter @apigovscan/cli pack` → `apigovscan-cli-<ver>.tgz` instalable con `npm i -g <tgz>` (air-gap).
  - Registry privado: workflow `release` (manual) publica a `npm.pkg.github.com` si hay `NPM_TOKEN`.
  - Docker: `docker/Dockerfile` (node:20-alpine) sobre el tarball.
- **Action**: input `license-key` → `APIGOVSCAN_LICENSE_KEY` en los 3 pasos.
- CI interna: dev license (committeada, válida hasta 2099) en workflows y setup de vitest.

### Out

- Licencias flotantes/por-seat, revocación online, telemetría (ninguna — INV-1).
- Publicación a npm público.
- Firma criptográfica asimétrica del tarball (HMAC simétrico embebido v1; documentado en §7).
- Docker publish automático a GHCR (solo build en release).

## 3. Contrato

```ts
// packages/cli/src/license.ts
export interface LicenseInfo { customer: string; expiry: string } // YYYYMMDD
export type LicenseCheck =
  | { ok: true; info: LicenseInfo }
  | { ok: false; reason: "missing" | "malformed" | "bad signature" | "expired" };

export function verifyLicenseKey(key: string, today?: string): LicenseCheck;
export function resolveLicenseKey(src: { flag?: string; env?: string; config?: string }): string | undefined;
```

- Mensajes (EN): `missing license: set --license-key, APIGOVSCAN_LICENSE_KEY or license.key in apigovscan.yaml` · `invalid license: bad signature` · `license expired on <YYYYMMDD>`.
- `analyze`/`mcp` sin licencia válida → stderr `error: <msg>` + **exit 2** antes de analizar.
- `license` cmd: imprime `customer <c> · expires <YYYYMMDD> · valid` (exit 0) o el motivo (exit 2).

## 4. Criterios de aceptación

- [x] **AC-D.1** `verifyLicenseKey`: key generada por `gen-license.mjs` → `{ok, info}`; firma alterada → `bad signature`; fecha < hoy → `expired`; formato roto → `malformed`.
- [x] **AC-D.2** Orden de resolución flag > env > config (test con las tres fuentes).
- [x] **AC-D.3** `analyze` sin licencia → exit 2 + mensaje; con env dev-key → exit 0/1 normal.
- [x] **AC-D.4** `mcp` sin licencia → exit 2 sin iniciar el server.
- [x] **AC-D.5** `license` cmd: valida y reporta customer/expiry; exit 0/2.
- [x] **AC-D.6** config `license.key` aceptada por schema strict; typos en `license.*` → error como el resto.
- [x] **AC-D.7** `pnpm --filter @apigovscan/cli pack` produce tgz con `dist/apigovscan.mjs` + `bin` + `packs` y **sin** `workspace:` en dependencies del manifest.
- [x] **AC-D.8** Instalación e2e del tarball en dir temporal: `npm i -g <tgz>` → `apigovscan analyze` corre offline con dev license (script `scripts/verify-pack.mjs`).
- [x] **AC-D.9** Action acepta `license-key` y lo pasa como env a los 3 pasos.
- [x] **AC-D.10** INV-1: la validación de licencia no hace red (test con fetch stubbed igual que AC-SRV.5).

## 5. Test plan

- Unit `packages/cli/test/license.test.ts` (AC-D.1–2, D.6, D.10).
- E2E cli: gate analyze/mcp + cmd license (AC-D.3–5) con helper de env.
- Empaquetado: `scripts/verify-pack.mjs` (pack → install en temp → analyze) corrido por el workflow release y localmente (AC-D.7–8).
- Action: test estructura action.e2e actualizado (AC-D.9).

## 6. Dependencias

- `f2-config` (schema strict + changelog), `f4-mcp-server` (gate en `mcp`), `f5-action` (input nuevo).
- esbuild (devDependency de `packages/cli`).

## 7. Riesgos y decisiones abiertas

| Tema | Decisión v1 |
|---|---|
| HMAC simétrico embebido | Aceptable para cliente honesto + repo privado; upgrade a Ed25519 en v2 (mismo formato key + `sig` nueva). |
| Secret en repo | `AGS_VERIFY_SECRET` default embebido; keygen usa `--secret`. Rotación = nueva versión del CLI. |
| Licencia en config | `license.key` — plaintext en `apigovscan.yaml` (igual que cualquier token de CI). |
| Dev license committeada | Válida hasta 2099, solo funciona con el secret embebido (que ya está en el binario igualmente). |
| `exports` programático del tarball | Apunta a dist tsc con `workspace:*` — soportado solo dentro del monorepo; el producto del tarball es el **bin**. Documentado. |

## Changelog

- 2026-09-26 · Spec creado (decisión de producto: distribución "ambos" — tarball/air-gap + registry privado; estado `ready`).
- 2026-09-26 · M6.2: `license.ts` (HMAC offline) + gates analyze/mcp + cmd `license` + config `license.key` + esbuild bundle + `pack-cli`/`verify-pack` (instala offline y analiza) + Docker + workflow `release` + action `license-key`. AC-D.1–10 verdes → `cerrada`; tag `v0.6.0-private`. Nota: el flag `--license-key` aplica a `analyze`; `mcp` usa env/config.
