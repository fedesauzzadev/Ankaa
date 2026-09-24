# f0-foundation · Fundación del monorepo

| Campo | Valor |
|---|---|
| Estado | implementada |
| Fase | 0 |
| Deriva de | SDD ADR-012, ADR-004, D1; roadmap Fase 0 |
| Criterio de salida SDD | `pnpm i && pnpm build && pnpm test` verde en CI |

## 1. Objetivo

Dejar el esqueleto técnico listo para que las features `f1-*` solo agreguen lógica, no infraestructura: workspaces, TypeScript strict, lint, format, test runner, CI multi-OS y paquetes vacíos con contratos de tipos preliminares.

## 2. Alcance

### Dentro

- Raíz: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`, `.editorconfig`.
- Tooling: ESLint (flat) + Prettier, TypeScript project references o `tsc -b`.
- Test: **Vitest** (unit) con cobertura mínima opcional en CI.
- Packages esqueleto (build OK, tests OK aunque vacíos):
  - `@apigovscan/core`
  - `@apigovscan/openapi`
  - `@apigovscan/reporters`
  - `@apigovscan/cli`
  - `@apigovscan/mcp` (esqueleto; tools en f1+ posteriores — solo package shell)
- `packs/elite/` con README placeholder + `sources.yaml` mínimo.
- `fixtures/` con 1 spec OpenAPI válida (`petstore-mini.yaml`) + 1 inválida.
- CI: `.github/workflows/ci.yml` (matriz OS: ubuntu, windows, macos).
- `AGENTS.md` y docs SDD/specs/plans/tasks en el repo.

### Fuera

- Cualquier lógica de análisis (es f1).
- Publicación a npm.
- Worker Cloudflare, Docker, Action (roadmap fases 5–7).
- Definición final de tipos del dominio (pueden ser stubs versionados en f1).

## 3. Contrato

### Estructura mínima

```
ApiGovScan/
├── package.json              # private: true, scripts raíz
├── pnpm-workspace.yaml       # packages/*, worker (futuro)
├── tsconfig.base.json        # strict: true, ESM, NodeNext
├── eslint.config.js
├── .github/workflows/ci.yml
├── packages/
│   ├── core/                 # name: @apigovscan/core
│   ├── openapi/
│   ├── reporters/
│   ├── cli/                  # bin placeholder "apigovscan" → hello + version
│   └── mcp/
├── packs/elite/README.md
├── fixtures/
├── docs/  specs/  plans/  tasks/
└── AGENTS.md
```

### Scripts raíz (package.json)

| Script | Comando esperado |
|---|---|
| `build` | `pnpm -r --filter "./packages/**" build` |
| `test` | `pnpm -r test` |
| `lint` | eslint en todo el repo |
| `typecheck` | `tsc -b` o `pnpm -r typecheck` |
| `format` | prettier --write |
| `check` | `lint && typecheck && test && build && test:invariants` |

### Paquete cli (esqueleto)

```bash
npx --no-install (o node packages/cli) --version   # imprime 0.0.0-dev
apigovscan --help                                   # lista comandos futuros (stub)
```

## 4. Criterios de aceptación

- [x] **AC-0.1** `pnpm install` en fresh clone termina sin warnings de engine de Node < 20.
- [x] **AC-0.2** `pnpm build` compila los 5 packages sin error; `strict: true` activo.
- [x] **AC-0.3** `pnpm test` corre ≥ 1 test trivial por package (smoke) y pasa en local.
- [x] **AC-0.4** `pnpm lint` sin errores (warnings allowlist vacía por defecto).
- [x] **AC-0.5** CI workflow en matriz OS ubuntu/windows/macos (AC local `pnpm check` verde; remote al push a GitHub).
- [x] **AC-0.6** `packages/cli` expone bin `apigovscan` con `--version` y `--help`.
- [x] **AC-0.7** `packages/core` **no** importa `node:fs`, `node:http`, `fetch` (regla lint `no-restricted-paths` desde el día 0).
- [x] **AC-0.8** Repo contiene SDD + specs + plans + tasks + AGENTS.md (estado actual).
- [x] **AC-0.9** `.gitignore` excluye `node_modules`, `dist`, `coverage`, `.env`.
- [x] **AC-0.10** Fixtures presentes: 1 OpenAPI 3.1 válida, 1 YAML malformado.

## 5. Test plan

| Test | Tipo |
|---|---|
| Smoke por package (export o bin) | unit |
| `pnpm check` local espejo de CI | script |
| Lint rule: core sin I/O | lint en CI |
| Windows: scripts no dependen de bash-only | CI matrix |

## 6. Dependencias

- Ninguna previa (primer spec).
- SDD v1.0 aprobado.

## 7. Riesgos y decisiones abiertas

| Tema | Decisión provisional |
|---|---|
| Project references vs tsup por package | Preferir `tsc` para libs + `tsup` solo en `cli` cuando se optimice el bin |
| Vitest vs Jest | Vitest (ESM nativo, rápido, alineado TS) |
| Cobertura gate | Informativo en f0; gate en f1+ |

## Changelog

- 2026-09-23 · Spec creado desde SDD v1.0.
- 2026-09-23 · Implementada (Fase 0): toolchain, 5 packages, fixtures, CI workflow, `pnpm check` verde local (script `ci` renombrado a `check` por colisión con el built-in de pnpm).
