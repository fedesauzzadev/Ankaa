# Tasks · f0-foundation

Plan: [plans/f0-foundation.md](../plans/f0-foundation.md) · Spec: [specs/f0-foundation.md](../specs/f0-foundation.md)

## M0.1 — Repo y toolchain

- [ ] `package.json` raíz: `"private": true`, `engines.node >= 20`, scripts `build|test|lint|typecheck|ci`
- [ ] `pnpm-workspace.yaml` (`packages/*`)
- [ ] `tsconfig.base.json` strict + NodeNext + ESM
- [ ] ESLint flat config + reglas TS recomendadas
- [ ] Prettier + `.editorconfig`
- [ ] `.gitignore` (node_modules, dist, coverage, .env, *.tsbuildinfo)
- [ ] Vitest config raíz
- [ ] Script `test:invariants` stub (pasa con suite vacía o smoke)
- [ ] Verificar: `pnpm i && pnpm lint && pnpm typecheck` (AC-0.1, AC-0.4)

## M0.2 — Packages esqueleto

- [ ] `packages/core` (@apigovscan/core) — smoke test export
- [ ] `packages/openapi` — smoke test
- [ ] `packages/reporters` — smoke test
- [ ] `packages/cli` — bin `apigovscan`, `--version`, `--help` (AC-0.6)
- [ ] `packages/mcp` — shell (no implementar tools)
- [ ] Lint `no-restricted-paths`: core sin `node:fs`/`node:http`/`fetch` (AC-0.7)
- [ ] `fixtures/petstore-mini.yaml` (OpenAPI 3.1 válido)
- [ ] `fixtures/malformed.yaml`
- [ ] Verificar: `pnpm build && pnpm test` (AC-0.2, AC-0.3, AC-0.10)

## M0.3 — CI y docs

- [ ] `.github/workflows/ci.yml` — matriz ubuntu/windows/macos: install, lint, typecheck, test, build (AC-0.5)
- [ ] Job `invariants` en CI
- [ ] `AGENTS.md` presente
- [ ] SDD + specs + plans + tasks confirmados en repo (AC-0.8)
- [ ] Primer commit + PR con CI verde
- [ ] Marcar spec f0 → estado `implementada`

## Cierre de plan

- [ ] Todos los AC f0 verificados
- [ ] Plan checklist cerrado
