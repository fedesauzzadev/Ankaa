# f8-scan-org · Informe consolidado multi-repo (batch de organización)

| Campo | Valor |
|---|---|
| Estado | ready |
| Fecha | 2026-09-26 |
| Fase | 8 (M8.4 del umbrella `f8-oss-differentials`) |
| Deriva de | `f8-oss-differentials` M8.4; `analyze.ts` (`analyzeUseCase`); `discovery.ts`; FR-51 (misma semántica CLI); INV-1/INV-2/INV-7 |

## 1. Objetivo / user story

Como responsable de plataforma quiero `apigovscan scan-org <dir>` (o `--github <org>`) para obtener en **una sola corrida** el estado de governance de todos los repos: score por repo agrupado por dominio, ranking de peor a mejor. Sin red salvo el paso explícito de fetch; sin LLM en absoluto.

**Regla de oro:** agregación determinista sobre reportes `analyze` reales — mismo motor, misma semántica (FR-51). `scan-org` no inventa métricas propias.

## 2. Alcance

### In

- **CLI**: `apigovscan scan-org <dir> [--github <org>] [--group-by <file>] [--format console|json] [--out <file>] [--config <file>] [--license-key <key>] [--force] [--max-repos <n>] [--workdir <dir>]`
- **Modo local** (sin `--github`): cada subdirectorio inmediato de `<dir>` es un proyecto; se corre `discoverSpecs` + `analyzeUseCase` en memoria por proyecto (config propia por repo vía `loadConfig`, como si se corriera `analyze` dentro).
- **Modo `--github`**: lista repos vía API (`GITHUB_TOKEN` obligatoria; `--api-base` default `https://api.github.com`, sobreescribible para GHES/tests), sigue `Link: rel=next` hasta `--max-repos` (default 100), clona shallow (`git clone --depth 1`) en workdir (default `os.tmpdir()`, `--workdir` explícito). `git` ausente → exit 2 honesto. Clone fallido de un repo → warning a stderr + entrada en `skipped`, sigue con el resto.
- **Agregación** (`packages/cli/src/scan.ts`, puro, sin FS ni red): por repo `{name, specs, findings, errors, warnings, infos, score, grade}`; por grupo `{name, repos[], totals, avgScore}`; global `{totals, avgScore, repoCount}`; `skipped: [{name, reason}]`. Score de repo = el del reporte `analyze` (un reporte por repo = misma semántica que `analyze <dir>`). `avgScore` = media redondeada; ranking peor-primero (score asc, desempate errors desc, luego nombre asc).
- **Agrupación**: `--group-by` es un YAML plano `repo: dominio`; repos sin mapeo → grupo `ungrouped`; mapping inválido (no plano string→string) → exit 2. Sin `--group-by`: un solo grupo `all`.
- **Reporte**: console humano (tablas por grupo + totales) + `--format json` (`{tool, version, org, groups[], totals, avgScore, skipped[]}`); orden estable, sin timestamps.
- **Salida**: stdout por defecto; `--out` escribe el reporte (niega overwrite sin `--force`, precedente baseline/import).
- **Gates**: license (strings idénticos a `fix`/`import`). Sin gates LLM (no hay LLM en este milestone).
- Exit codes: `0` reporte emitido (aunque haya findings — es informativo), `2` errores.

### Out

- Telemetría, estado, portal/gateway (anti-alcance SDD §9).
- Auto-fix o auto-PR en repos escaneados.
- Paginación más allá de `--max-repos` (nota a stderr cuando se trunca).
- MCP tool (no pedido; el CLI cubre el caso).

## 3. Contrato

```ts
// packages/cli/src/scan.ts (puro: sin fs, sin red, sin LLM)
export interface RepoScan { name: string; specs: number; findings: number; errors: number; warnings: number; infos: number; score: number; grade: string }
export interface GroupScan { name: string; repos: RepoScan[]; totals: Totals; avgScore: number }
export interface OrgReport { tool: string; version: string; org: string | null; groups: GroupScan[]; totals: Totals; avgScore: number; skipped: Array<{ name: string; reason: string }> }
export function aggregateScans(scans: RepoScan[], groups?: Record<string, string>): OrgReport;
export function loadGroupMapping(text: string): { ok: true; mapping: Record<string, string> } | { ok: false; error: string };
// packages/cli/src/github.ts (solo este módulo toca red/procesos en cli para scan-org)
export function listOrgRepos(apiBase: string, org: string, token: string, maxRepos: number): Promise<{ ok: true; repos: Array<{ name: string; cloneUrl: string }> } | { ok: false; error: string }>;
export function cloneRepo(cloneUrl: string, destDir: string): Promise<{ ok: true } | { ok: false; error: string }>; // git CLI, shallow
```

- Red explícita SOLO en `--github` (fetch lista + `git clone`); `analyze`/parse/engine intactos (INV-1). Clones en tmpdir o `--workdir` explícito; reportes solo a `--out` explícito (INV-7).
- `avgScore` redondeado al entero más cercano; grupos/repos ordenados como se define arriba.

## 4. Criterios de aceptación

- [ ] **AC-SO.1** Scan local de 2+ repos agrega conteos y scores idénticos a correr `analyze` en cada uno (test de paridad).
- [ ] **AC-SO.2** `--group-by` agrupa por dominio; sin mapeo → `ungrouped`; mapping no plano → exit 2.
- [ ] **AC-SO.3** Ranking peor-primero determinista (score asc, errors desc, nombre asc); re-run byte-idéntico.
- [ ] **AC-SO.4** Formatos console (tablas + totales legibles) y json (parsea con la forma del contrato).
- [ ] **AC-SO.5** `--out` escribe el reporte; existe sin `--force` → exit 2 sin tocar nada.
- [ ] **AC-SO.6** Sin license → exit 2 mensaje license (mismo string que `fix`).
- [ ] **AC-SO.7** Flujo `--github` e2e con stub API (2 páginas) + clones `file://`: lista → clona → escanea; repo con clone roto → `skipped` con reason, exit 0.
- [ ] **AC-SO.8** Sin `GITHUB_TOKEN` → exit 2 honesto; `--max-repos` trunca con nota a stderr.
- [ ] **AC-SO.9** Boundary: `fetch` solo en `llm.ts` y `github.ts` (test extendido); `scan.ts` puro sin fs/red/LLM; `core` intacto; `analyze` sin llm byte-idéntico (suite existente).
- [ ] **AC-SO.10** Dir sin subdirs con specs → exit 2 honesto (`no projects with specs found`).

## 5. Test plan

- Unit `packages/cli/test/scan.test.ts`: agregación, ranking, grupos, mapping inválido (AC-SO.1–3 parcial).
- E2E `packages/cli/test/scan-org.e2e.test.ts` con workspaces temp (2 mini-repos con specs reales): paridad vs analyze, formatos, --out/--force, gates, determinismo (AC-SO.1, .4–6, .8 parcial, .10).
- E2E `--github`: stub HTTP (lista 2 páginas) + repos git locales clonados por `file://` + un clone roto → skipped (AC-SO.7–8).
- Boundary: extender `llm-boundary.test.ts` (AC-SO.9).

## 6. Dependencias

- `analyze.ts` (`analyzeUseCase`), `analyze-setup.ts`, `discovery.ts`, `loaders.ts` (patrón `fix`: análisis en memoria).
- Sin deps nuevas de runtime (`git` CLI del entorno para clones; Node http/fetch nativo para la API).

## 7. Riesgos y decisiones abiertas

| Tema | Decisión v1 |
|---|---|
| Red en un comando nuevo | Solo `--github` la usa, explícita y documentada; `analyze` intacto (INV-1 por alcance). |
| Repos enormes/monorepos | Un subdir = un proyecto; discovery existente con sus skips; `--max-repos` acota fetch. |
| Score multi-spec por repo | Un solo `analyzeUseCase` por repo (misma semántica que `analyze <dir>`). |
| Clones parciales | Warn + `skipped`, nunca tumba el informe. |

## Changelog

- 2026-09-26 · Spec creado en `ready` (cuarto milestone ejecutable de f8; handoff vía AGENTS.md + este spec).
