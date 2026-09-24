# f5-reporters · Reportes SARIF + Markdown + annotations

| Campo | Valor |
|---|---|
| Estado | ready |
| Fase | 5 |
| Deriva de | SDD FR-40/41/43, SDD §7 fila 5; doc 06 §8.6; spec `f1-reporters` |
| Package | `@apigovscan/reporters` + CLI (`f1-analyze`) |
| Roadmap | Fase 5 — Reporters SARIF + Markdown + GitHub Action |

## 1. Objetivo

Como **dev que corre ApiGovScan en CI**, quiero las mismas salidas de siempre en **SARIF 2.1.0** (code scanning/annotations), en **Markdown** (job summary) y como **workflow commands** (anotaciones inline en el PR), para consumir el reporte sin parsers custom y sin duplicar lógica.

**User story canónica:**

> Given un reporte `Report` ya construido y redactado,  
> When el CLI corre con `--format sarif|markdown|annotations`,  
> Then recibe la serialización correspondiente — determinística (INV-2), sin red (INV-1), sin secretos (FR-43) — y el gate `--fail-on` sigue funcionando igual.

## 2. Alcance

### Dentro

- `formatSarif(report)` → SARIF 2.1.0 (un `run`, driver con rules deduplicadas).
- `formatMarkdown(report)` → Markdown de job summary (tabla de conteos, findings agrupados, `reportHash`).
- `formatAnnotations(report)` → workflow commands de GitHub (`::error/::warning/::notice`).
- Extensión de `OutputFormat` en CLI: `--format sarif | markdown | annotations` (además de `console | json`).
- Redacción: los formatters nuevos renderizan `report.findings` **ya redactados** por `buildReport` (FR-43); nunca re-leakean.
- Determinismo INV-2 de los tres formatos (sin timestamps, sin paths absolutos de host, orden estable).

### Fuera (explícito)

- Subir SARIF a code scanning (`upload-sarif`) — lo hace el usuario/action, no el CLI (doc 05 §3: "SARIF upload es opcional").
- Regiones/line numbers en SARIF: el modelo `Finding` **no tiene líneas** (JSON pointer), así que no hay `region` (decisión, ver §7).
- Cambiar `Finding`/`Report` de `f1-reporters`/`f1-engine`.
- Lenguaje dual EN+ES de findings (decisión pendiente doc 02 §pendientes, sigue abierta).
- SARIF de resultados de `rules list/validate/explain` (esos comandos quedan en `console|json`).

## 3. Contrato

### API (`@apigovscan/reporters`)

```ts
export function formatSarif(report: Report, opts?: { pretty?: boolean }): string;
export function formatMarkdown(report: Report): string;
export function formatAnnotations(report: Report): string;
```

- `formatSarif`: default **pretty (2 spaces)**; el resultado termina en `\n`.
- `formatMarkdown`/`formatAnnotations`: string plano terminado en `\n` (`annotations` = una línea por finding + `\n` final; vacío si no hay findings).

### SARIF 2.1.0

```jsonc
{
  "$schema": "https://json.schemastore.org/sarif-2.1.0.json",
  "version": "2.1.0",
  "runs": [{
    "tool": {
      "driver": {
        "name": "apigovscan",
        "version": "<report.tool.version>",
        "rules": [ /* dedupe por ruleId, sort alfabético */ ]
      }
    },
    "results": [ /* un result por finding, orden del report */ ]
  }]
}
```

- **rule** (metadata): `{ id, shortDescription: { text: <mensaje de la regla> }, help?: { text: <fix>, uri: <source.url> }, properties: { "apigovscan/severity": ..., "apigovscan/category": ..., "apigovscan/pack": "<packId@packVersion>" } }`.
  - `help.uri` solo si el finding trae `source.url`; **nunca** inventar URLs; sin `informationUri` en el driver.
  - Reglas con distinto `severity`/mensaje entre findings: gana la **primera aparición** estable del report (ya ordenado).
- **result**: `{ ruleId, level, message: { text }, locations: [...], partialFingerprints: { apigovscanFingerprint: <fingerprint> } }`.
  - Mapeo `level`: `error → "error"`, `warning → "warning"`, `info → "note"`.
  - `locations[0].physicalLocation.artifactLocation.uri` = **label del input** (parte antes de `#` de `finding.location`); si `location` no trae `#`, el uri es el label correspondiente de `report.input` (o `""` si no se puede resolver).
  - **Sin `region`** (no hay líneas en el modelo).
- Sin `invocations`/`artifacts`/timestamps: nada de `meta.startedAt`/`durationMs` (INV-2).

### Markdown

```markdown
# ApiGovScan report

| | |
|---|---|
| Tool | apigovscan 1.0.0 |
| Packs | elite@2026.09.1 |
| Inputs | 1 file(s) |
| Findings | 2 errors · 14 warnings · 3 info |
| reportHash | `6c1e…` |

## Findings

### error

| Rule | Location | Message | Fix |
|---|---|---|---|
| NAMING-001 | `GET /user/{id}` | … | … |

(faltantes → "_(none)_")
```

- Agrupación por severidad (`error`, `warning`, `info`); dentro, orden del report (ya estable).
- Location en tabla = `apiLocation ?? location` (mismo criterio que console).
- Celdas: escapar `|` → `\|` y `\n` → `<br>` (tablas GFM).
- Cero ANSI; multi-input muestra label `#` si existe.

### Annotations (workflow commands)

Una línea por finding:

```
::<level> file=<uri>,title=<ruleId>::<message>
```

- `level`: `error` → `::error`, `warning` → `::warning`, `info` → `::notice`.
- `file` = mismo uri del SARIF; si uri es `""`, se omite la propiedad `file=` (solo `title=`).
- Escaping **mensaje**: `%` → `%25`, `\r` → `%0D`, `\n` → `%0A` (en ese orden).
- Escaping **propiedades** (`file`, `title`): primero `%`/`\r`/`\n`, después `:` → `%3A` y `,` → `%2C`.
- El output siempre cabe en una línea física por finding (no crudos `\n`).

### CLI (`f1-analyze` extendido — FR-40)

```ts
export type OutputFormat = "console" | "json" | "sarif" | "markdown" | "annotations";
const ANALYZE_FORMATS = new Set(["console", "json", "sarif", "markdown", "annotations"]);
const RULES_FORMATS  = new Set(["console", "json"]);   // rules list/validate/explain no cambian
```

- `parseAnalyzeArgs` usa `ANALYZE_FORMATS`; mensaje de error: `invalid --format "<v>" (expected console | json | sarif | markdown | annotations)`.
- `parseRulesArgs` usa `RULES_FORMATS` (separado; el error de rules sigue siendo `console | json`).
- `createReportSink` despacha por formato:

| `--output` | Comportamiento |
|---|---|
| sin `--output` | string completo a stdout (igual que json/console) |
| con `--output` | escribe el archivo (UTF-8, `\n` final) y **no** emite el formato a stdout; con `format: console` conserva `shortSummary` a stdout (AC-A.11 de f1) |

- `annotations` + `--output`: válido (archivo con los comandos); el gate `--fail-on` no cambia (exit 0/1/2 por `computeExitCode`, f1-analyze).
- Help (`getHelp`): `--format` documenta los 5 valores con una línea cada uno.
- Markdown/annotations a stdout con `--format markdown`: crudo, sin color (NO_COLOR implícito).

## 4. Criterios de aceptación

- [ ] **AC-SARIF.1** `formatSarif` parsea como JSON, tiene `$schema` + `"version": "2.1.0"` y `runs[0].tool.driver.name === "apigovscan"`.
- [ ] **AC-SARIF.2** Mapeo de `level`: error→`error`, warning→`warning`, info→`note` (test con los 3 niveles).
- [ ] **AC-SARIF.3** `artifactLocation.uri` = label antes de `#`; **no** existe `locations[].physicalLocation.region` en ningún result.
- [ ] **AC-SARIF.4** Dos serializaciones del mismo `Report` ⇒ string idéntico (sin timestamps ni `meta` en la salida).
- [ ] **AC-SARIF.5** `driver.rules` deduplicado por `ruleId` y ordenado alfabético; `help.uri` presente **solo** cuando el finding tiene `source.url`.
- [ ] **AC-SARIF.6** Cada result lleva `partialFingerprints.apigovscanFingerprint` = `finding.fingerprint`.
- [ ] **AC-SARIF.7** Report con findings de 2 reglas distintas ⇒ 2 `rules` y N `results` = N findings.
- [ ] **AC-MD.1** Markdown contiene tabla de conteos (errores/warnings/info) + `reportHash`; cero escapes ANSI (`\x1b`).
- [ ] **AC-MD.2** Dos renderizados del mismo report ⇒ string idéntico (INV-2).
- [ ] **AC-MD.3** Caracteres `|` y saltos de línea en messages/fix no rompen tablas (escape `\|` / `<br>`).
- [ ] **AC-ANN.1** 1 finding ⇒ exactamente 1 línea `::error|warning|notice …`; nivel correcto para las 3 severidades.
- [ ] **AC-ANN.2** Message con `%`, salto de línea y texto con `:` en title/file ⇒ `%25`/`%0A`/`%3A`/`%2C` aplicados; sin crudos `\n` dentro de la línea.
- [ ] **AC-ANN.3** `--format annotations` sin findings ⇒ salida vacía (solo `""`, sin headers).
- [ ] **AC-CLI.1** `analyze --format sarif|markdown|annotations` acepta los 3; valor inválido ⇒ error con los 5 valores listados.
- [ ] **AC-CLI.2** `--format sarif --output out.sarif` ⇒ archivo creado con el SARIF y **stdout silencioso** (paridad AC-A.11); `--format sarif` sin `--output` ⇒ SARIF a stdout.
- [ ] **AC-CLI.3** `rules list --format sarif` ⇒ error `(expected console | json)` (reglas no cambian).
- [ ] **AC-CLI.4** Help de `analyze` documenta `console | json | sarif | markdown | annotations`.
- [ ] **AC-RED.1** Report cuyo message contiene patrón secret ⇒ SARIF/Markdown/annotations **no** contienen el valor crudo (usan `***REDACTED***`).
- [ ] **AC-INV.2** Corrida doble e2e de los 3 formatos sobre `fixtures/petstore-mini.yaml` ⇒ bytes idénticos.

## 5. Test plan

| Caso | Tipo |
|---|---|
| SARIF schema/level/uri/dedupe/fingerprints | unit en `packages/reporters/test` |
| SARIF determinismo (2× mismo report) | unit |
| Markdown conteos + escape `|` + determinismo | unit |
| Annotations escaping + niveles + vacío | unit |
| Redacción en formatos nuevos | unit (report con patrón PEM) |
| `--format` acepta/valida/rechaza + rules separado | e2e CLI (`runCapture`, patrón `analyze.e2e`) |
| `--output` silencia stdout en sarif | e2e CLI |
| Snapshot sarif/markdown petstore | snapshot en reporters (sin timestamps que rompan) |

## 6. Dependencias

- `f1-reporters` (Report, buildReport, redacción, reportHash) — **no se modifica contrato**.
- `f1-analyze` (sink, exit codes, help).
- `f1-invariants` (INV-2 se verifica sobre formatos nuevos).

## 7. Riesgos y decisiones abiertas

| Tema | Decisión f5 |
|---|---|
| Formato nuevo `annotations` fuera de FR-40 (`console\|json\|sarif\|markdown`) | **Se agrega** `--format annotations`: necesario para el criterio salida SDD ("PR check publica annotations") sin necesidad de subir SARIF. Se registra en este changelog y se amplía la fila FR-40 de `docs/01` al cierre. |
| Sin líneas ⇒ sin `region` SARIF | Correcto: `Finding.location` es JSON pointer; GitHub muestra el archivo entero. Aceptar en v1; líneas vendrían si el modelo las gana. |
| `informationUri`/URLs del driver | **No inventar**: solo `help.uri` si `source.url` existe. |
| Reglas con severidad distinta entre findings | Gana la primera aparición estable; los `results` conservan su `level` individual. |
| `sarif` pretty vs compact | Pretty (2 spaces) por defecto; determinismo se mantiene. |
| `rules` con formatos nuevos | Excluidos: `RULES_FORMATS = console\|json` (no son reportes). |
| Markdown como `--format markdown` vs solo en Action | CLI directo: permite `apigovscan analyze . --format markdown >> resumen` sin Action. |

## Changelog

- 2026-09-24 · Spec creado desde SDD v1.0 §7 Fase 5 + FR-40/41/43 + doc 06 §8.6 (estado `ready`).
