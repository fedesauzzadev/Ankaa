# Tasks · f6-distribution

Plan: [plans/f6-distribution.md](../plans/f6-distribution.md) · Spec: [specs/f6-distribution.md](../specs/f6-distribution.md)

## M6.2 — Licencia + bundle + canales

- [x] `license.ts` verify/resolve + unit tests (AC-D.1–2, D.10)
- [x] Config `license.key` strict + tests (AC-D.6)
- [x] Gates analyze (`--license-key`) + mcp + cmd `license` + help (AC-D.3–5)
- [x] `scripts/gen-license.mjs` + dev license en setup vitest (cli/root) + env en workflows CI
- [x] Bundle esbuild + bin + package.json (UNLICENSED, LICENSE.md, repository, publishConfig) (AC-D.7)
- [x] `scripts/verify-pack.mjs` e2e offline (AC-D.8)
- [x] `docker/Dockerfile` + `.github/workflows/release.yml`
- [x] Action input `license-key` + README + dogfood (AC-D.9)
- [x] Docs: docs/05 §distribución, README instalación, changelogs f2-config/f5-action, índices
- [x] `pnpm check` + `verify-pack` verde
- [x] Spec `f6-distribution` → `cerrada` + índices + tag `v0.6.0-private`
