# Plan · f6-distribution · Distribución privada + licencia offline

| Campo | Valor |
|---|---|
| Specs | f6-distribution |
| Dependencias | f6-score cerrado; f2-config/f4-mcp/f5-action implementados |

## M6.2 — Licencia + bundle + canales (f6-distribution)

1. `packages/cli/src/license.ts`: verify/resolve + secret embebido + mensajes EN.
2. Config: `license: { key?: string }` en schema strict (`config.ts`) + tests.
3. Gates: `analyze` (flag `--license-key`) y `mcp`; cmd `license`; help.
4. `scripts/gen-license.mjs` (vendor) + dev license (tests/CI): setup vitest (cli + root) y env en workflows.
5. Bundle esbuild → `dist/apigovscan.mjs`; bin al bundle; `package.json` (UNLICENSED + LICENSE.md + repository + publishConfig + esbuild devDep); copy-packs sin cambios (walk-up ya encuentra `packs/`).
6. `scripts/verify-pack.mjs`: pack → `npm i -g` en temp → analyze con dev license (offline).
7. `docker/Dockerfile` + `.github/workflows/release.yml` (dispatch: version → check → pack → release con tgz → docker build → publish a GitHub Packages si NPM_TOKEN).
8. Action `license-key` input; action README + dogfood con dev license.
9. Docs: `docs/05` §distribución privada, README instalación, changelogs f2-config/f5-action, índices.
10. `pnpm check` + `verify-pack` verde → spec `cerrada` → **tag `v0.6.0-private`**.

**DoD:** AC-D.1–10 verdes; tarball instala y corre offline; INV-1..7 verdes.

## Changelog del plan

- 2026-09-26 · Plan inicial (decisión "ambos" canales).
