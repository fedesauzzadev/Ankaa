# f8-drift · Drift spec↔código + generación de spec (determinista primero, LLM opcional)

| Campo | Valor |
|---|---|
| Estado | cerrada |
| Fecha | 2026-09-26 |
| Fase | 8 (M8.3 del umbrella `f8-oss-differentials`) |
| Deriva de | `f8-oss-differentials` M8.3; `f8-suggest-fix` (adapter `llm.ts`, gates); parser `@apigovscan/openapi` (modelo `Spec`/`Operation`); FR-43 (redacción); INV-1/INV-2/INV-7 |

## 1. Objetivo / user story

Como equipo con código y spec desincronizados, quiero `apigovscan drift <dir> --spec <spec>` para saber **qué endpoints le faltan al spec, cuáles sobran y cuáles cambiaron** — y si no hay spec, quiero `apigovscan drift <dir> --out <file>` para **generar un borrador** revisable. Todo sin escribir nada que yo no pida explícito.

**Regla de oro (heredada de f8):** detección determinista primero; el LLM solo enriquece (sweep de frameworks desconocidos, análisis de shapes) y nunca decide el gate. Sin LLM configurado, el comando sigue siendo útil.

## 2. Alcance

### In

- **CLI**: `apigovscan drift <dir> [--spec <file>] [--out <file>] [--format console|json] [--config <file>] [--license-key <key>] [--force]`
  - Modo drift (con `--spec`): compara y reporta; **no escribe nada**.
  - Modo generación (sin `--spec`): escribe borrador a `--out` (default `openapi.draft.yaml`); se niega a sobrescribir sin `--force` (precedente: baseline/import).
- **Detección de rutas** (`packages/cli/src/route-signatures.ts`): catálogo determinista de firmas por framework — Express/Nest/Fastify, Spring/JAX-RS, .NET (MVC/WebAPI/WCF/ashx), FastAPI/Flask/Django, Sinatra/Rails, Go (net/http, gorilla, gin, echo), PHP (Laravel/Symfony) — con tests true+false por familia (AGENTS.md §7). Cada firma extrae `{method, path, file}`; método desconocido → `"*"`.
- **Normalización**: `:p`, `{p}`, `<p>`, `<int:p>` → `{p}`; métodos a mayúsculas para comparar.
- **Barrido LLM universal (fallback)**: solo si el catálogo encuentra **cero** rutas Y hay LLM configurado; **una sola request** con la lista de archivos candidatos (truncada); salida JSON `[{method, path, confidence, file}]` validada por forma; sin LLM → nota honesta, no error.
- **Comparación** (endpoint-level, determinista): `missing` (en spec, no en código), `removed` (en código, no en spec), `changed` (mismo endpoint, set de métodos distinto).
- **Nivel shape** (solo con LLM): una request por lote con pares operación-spec/fragmento de handler truncados; resultado informativo con `confidence`, **nunca afecta el exit code**.
- **Generación**: esqueleto `openapi: 3.1.0` con `operationId` derivado (`getPetsById`), `responses: {default: {description: Drafted}}`; el archivo generado debe parsear con nuestro propio parser (e2e: generate → analyze).
- **Reporte**: console humano + `--format json` (`{missing[], removed[], changed[], shapeNotes[]}`); orden estable, sin timestamps.
- **Gates**: license (strings idénticos a `fix`); LLM **opcional** (endpoint-level siempre; shape/sweep solo con LLM).

### Out

- Escritura fuera de `--out` explícito (INV-7).
- `fix` automático del spec (eso es `fix`, no drift).
- Import desde URLs/red.
- Detección de cambios semánticos profundos (lógica de negocio).
- SOAP/WSDL (borde honesto, como en f8-oss-differentials).

## 3. Contrato

```ts
// packages/cli/src/route-signatures.ts
export interface DetectedRoute { method: string; path: string; file: string; framework: string }
export function detectRoutes(file: string, content: string): DetectedRoute[];
export function normalizeRoutePath(path: string): string;
// packages/cli/src/drift.ts
export interface DriftReport { missing: Endpoint[]; removed: Endpoint[]; changed: EndpointChange[]; shapeNotes: ShapeNote[] }
export function compareEndpoints(specOps: Array<{ method: string; path: string }>, codeRoutes: DetectedRoute[]): DriftReport;
export function buildSpecSkeleton(routes: DetectedRoute[], sourceLabel: string): string; // YAML openapi 3.1.0
export function buildSweepMessages(files: string[]): ChatMessage[];
export function parseSweepResponse(text: string): DetectedRoute[]; // tolerante, con confidence>=low
export function buildShapeMessages(pairs: Array<{ op: string; specFragment: string; codeFragment: string }>): ChatMessage[];
```

- Exit codes: drift → `0` sin drift / `1` con drift / `2` errores; generación → `0` archivo escrito / `2` errores.
- `Endpoint = { method: string; path: string }` normalizados; `method: "*"` = método desconocido (matchea cualquiera).

## 4. Criterios de aceptación

- [x] **AC-DR.1** Catálogo: cada familia (Express, Spring, .NET, FastAPI, Rails, Go, PHP) con test true (detecta método+path correctos) y false (no falsos positivos en código parecido).
- [x] **AC-DR.2** Normalización: `:id`, `{id}`, `<id>`, `<int:id>` → `{id}`; `get`/`GET` matchean.
- [x] **AC-DR.3** `drift` con fixture desactualizada reporta el endpoint faltante, el sobrante y el cambiado; exit 1; `--format json` parsea con esas tres listas.
- [x] **AC-DR.4** `drift` sin diferencias → exit 0 + mensaje de limpieza.
- [x] **AC-DR.5** Sweep LLM: con catálogo en cero + stub → rutas del stub aparecen; stub con basura → exit 2 honesto o reporte vacío con nota (no crash, no fruta).
- [x] **AC-DR.6** Sin LLM: endpoint-level completo; nota visible de que shape/sweep requieren LLM; exit codes iguales.
- [x] **AC-DR.7** Generación: `--out` escribe esqueleto válido; re-analyze del generado parsea ok; sin `--force` ante existente → exit 2 sin tocar nada.
- [x] **AC-DR.8** Gates: sin license → exit 2 mensaje license; e2e usan `DEV_LICENSE_KEY` como fix/import.
- [x] **AC-DR.9** Boundary: `drift`/`route-signatures` no importan `analyze.ts` ni core-LLM; solo escribe `--out` (INV-7); `analyze` sin llm byte-idéntico (suite existente).
- [x] **AC-DR.10** Determinismo: re-run → stdout/archivo byte-idénticos (órdenes estables, sin timestamps).

## 5. Test plan

- Unit `packages/cli/test/route-signatures.test.ts`: true+false por familia, normalización (AC-DR.1–2).
- Unit `packages/cli/test/drift.test.ts`: compare/generación/parsers (AC-DR.3 parcial, D.7 parcial).
- E2E `packages/cli/test/drift.e2e.test.ts` con `test/llm-stub.ts`: fixture mini-repo + spec desactualizada (AC-DR.3–4, D.6), sweep (AC-DR.5), generación+re-análisis (AC-DR.7), gates (AC-DR.8), INV-7 (AC-DR.9).
- Boundary: extender `llm-boundary.test.ts`.

## 6. Dependencias

- Parser openapi existente (solo lectura del spec; NO `analyzeUseCase` — boundary).
- `f8-suggest-fix` (`llm.ts`, stub, gates, strings de mensajes).
- Sin deps nuevas de runtime.

## 7. Riesgos y decisiones abiertas

| Tema | Decisión v1 |
|---|---|
| Frameworks no listados | Catálogo + sweep LLM con confidence; honesto, revisable. |
| Handler files para shapes | Fragmento acotado alrededor de la firma detectada; truncado con nota. |
| Specs inválidos en drift | Exit 2 con el error del parser (no se inventa nada). |
| Directorio gigante | Límite de archivos/tamaño con nota; determinista (sort). |

## Changelog

- 2026-09-26 · Spec creado en `ready` (tercer milestone ejecutable de f8; handoff vía AGENTS.md + este spec).
- 2026-09-26 · M8.3 implementado → `cerrada` (AC-DR.1–10 verdes; `pnpm check` verde). Decisiones de implementación:
  - `missing`/`removed` son a nivel de path (un path presente en ambos lados con métodos distintos es `changed`, no doble reporte).
  - `DetectedRoute` gana `line?: number` opcional (fragmentos de shape); no rompe el contrato.
  - Sweep con basura → reporte con nota honesta (no exit 2); request LLM fallida → exit 2.
  - Fixture `drift-demo/app.js` en ESM (el linter prohíbe `require`).
