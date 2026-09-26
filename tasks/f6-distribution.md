# Tasks · f6-distribution

Plan: [plans/f6-distribution.md](../plans/f6-distribution.md) · Spec: [specs/f6-distribution.md](../specs/f6-distribution.md)

## M6.2 — Licencia + bundle + canales

- [ ] `license.ts` verify/resolve + unit tests (AC-D.1–2, D.10)
- [ ] Config `license.key` strict + tests (AC-D.6)
- [ ] Gates analyze (`--license-key`) + mcp + cmd `license` + help (AC-D.3–5)
- [ ] `scripts/gen-license.mjs` + dev license en setup vitest (cli/root) + env en workflows CI
- [ ] Bundle esbuild + bin + package.json (UNLICENSED, LICENSE.md, repository, publishConfig) (AC-D.7)
- [ ] `scripts/verify-pack.mjs` e2e offline (AC-D.8)
- [ ] `docker/Dockerfile` + `.github/workflows/release.yml`
- [ ] Action input `license-key` + README + dogfood (AC-D.9)
- [ ] Docs: docs/05 §distribución, README instalación, changelogs f2-config/f5-action, índices
- [ ] `pnpm check` + `verify-pack` verde
- [ ] Spec `f6-distribution` → `cerrada` + índices + tag `v0.6.0-private`
