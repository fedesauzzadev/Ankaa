# Tasks · f0-foundation

Plan: [plans/f0-foundation.md](../plans/f0-foundation.md) · Spec: [specs/f0-foundation.md](../specs/f0-foundation.md)

## M0.1 — Repo y toolchain

- [x] `package.json` raíz: `"private": true`, `engines.node >= 20`, scripts `build|test|lint|typecheck|ci`
- [x] `pnpm-workspace.yaml` (`packages/*`)
- [x] `tsconfig.base.json` strict + NodeNext + ESM
- [x] ESLint flat config + reglas TS recomendadas
- [x] Prettier + `.editorconfig`
- [x] `.gitignore` (node_modules, dist, coverage, .env, *.tsbuildinfo)
- [x] Vitest config raíz + por package
- [x] Script `test:invariants` stub (pasa con suite vacía o smoke)
- [x] Verificar: `pnpm i && pnpm lint && pnpm typecheck` (AC-0.1, AC-0.4)

## M0.2 — Packages esqueleto

- [x] `packages/core` (@apigovscan/core) — smoke test export
- [x] `packages/openapi` — smoke test
- [x] `packages/reporters` — smoke test
- [x] `packages/cli` — bin `apigovscan`, `--version`, `--help` (AC-0.6)
- [x] `packages/mcp` — shell (no implementar tools)
- [x] Lint `no-restricted-paths`: core sin `node:fs`/`node:http`/`fetch` (AC-0.7)
- [x] `fixtures/petstore-mini.yaml` (OpenAPI 3.1 válido)
- [x] `fixtures/malformed.yaml`
- [x] Verificar: `pnpm build && pnpm test` (AC-0.2, AC-0.3, AC-0.10)

## M0.3 — CI y docs

- [x] `.github/workflows/ci.yml` — matriz ubuntu/windows/macos: install, lint, typecheck, test, build (AC-0.5)
- [x] Job `invariants` en CI
- [x] `AGENTS.md` presente
- [x] SDD + specs + plans + tasks confirmados en repo (AC-0.8)
- [x] Primer commit + CI local verde (AC-0.5 local: `pnpm check`; remote CI en push a GitHub)
- [x] Marcar spec f0 → estado `implementada`

## Cierre de plan

- [x] Todos los AC f0 verificados localmente
- [x] Plan checklist cerrado
