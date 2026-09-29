# Plan · f0-foundation

| Campo                 | Valor                                               |
| --------------------- | --------------------------------------------------- |
| Spec                  | [specs/f0-foundation.md](../specs/f0-foundation.md) |
| Esfuerzo estimado     | 0.5–1 día                                           |
| Dependencias externas | pnpm ≥ 9, Node ≥ 20, cuenta GitHub para CI          |
| Milestones            | M0.1–M0.3                                           |

## Objetivo del plan

Dejar el esqueleto mergeable con CI verde **antes** de escribir lógica de análisis. Preferimos fondo honesto a packages "llenos" con TODO.

## Orden de construcción

### M0.1 — Repo y toolchain (día 1, mañana)

1. `package.json` raíz private + engines.
2. `pnpm-workspace.yaml`.
3. `tsconfig.base.json` (strict, NodeNext, ESM) + tsconfig por package (stubs).
4. ESLint flat + Prettier + `.editorconfig` + `.gitignore`.
5. Scripts raíz: `build`, `test`, `lint`, `typecheck`, `ci`.
6. Vitest workspaces o config raíz.

**DoD M0.1:** `pnpm i && pnpm lint && pnpm typecheck` verde (sin packages aún o con uno stub).

### M0.2 — Packages esqueleto (día 1, tarde)

1. Crear `core`, `openapi`, `reporters`, `cli`, `mcp` (shell).
2. Cada package: `name`, `exports`, `types`, script `build` (`tsc -b` o tsup), 1 smoke test.
3. `cli`: bin con `--version`/`--help`.
4. Lint rule `no-restricted-paths` en `core` (AC-0.7).
5. Fixtures mínimo: `petstore-mini.yaml` + malformado.

**DoD M0.2:** AC-0.1…0.4, 0.6, 0.7, 0.10.

### M0.3 — CI + docs (día 1–2)

1. `.github/workflows/ci.yml` matriz OS: install, lint, typecheck, test, build.
2. Jobs: `invariants` placeholder (`pnpm test:invariants` puede ser exit 0 con `// TODO f1` test vacío que pase).
3. `AGENTS.md` + verificar SDD/specs/plans/tasks en repo.
4. Primer commit `chore: f0 foundation`.

**DoD M0.3:** AC-0.5, 0.8, 0.9; badge/CI verde en PR de prueba.

## Riesgos del plan

| Riesgo                          | Manejo                             |
| ------------------------------- | ---------------------------------- |
| Windows rompe scripts           | CI matrix desde M0.3, no después   |
| Discusión de tsup vs tsc eterna | tsc en libs; tsup solo si bin pesa |

## Fuera de plan

- npm publish
- Coverage gate
- Changesets (se añade al cerrar f1 para release)

## Checklist de cierre del plan

- [x] Todos los AC de `specs/f0-foundation.md` verificados
- [x] CI verde local (`pnpm check`); workflow GitHub listo para remote
- [x] Spec marcada `implementada`
