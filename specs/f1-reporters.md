# f1-reporters · Reportes console + JSON

| Campo | Valor |
|---|---|
| Estado | implementada |
| Fase | 1 |
| Deriva de | SDD FR-03/05/40/41, doc 03 §11; INV-2 |
| Package | `@apigovscan/reporters` |

## 1. Objetivo

Serializar `EvaluationResult` + metadatos de corrida a (1) **console** legible para humanos y (2) **JSON canónico** estable para máquinas/snapshots — con `reportHash` y redacción de secretos en previews.

## 2. Alcance

### Dentro

- Build de `Report` (estructura unificada) desde findings + meta.
- Reporter `console` (color opcional, agrupación, resumen, `reportHash`).
- Reporter `json` (claves ordenadas, sin timestamps dentro del hash).
- `reportHash` = sha256(canonical JSON de `{tool.version, packs, input, summary, findings}` **sin** `meta`).
- Redacción básica de ejemplos sensibles en mensajes/fix snippets (SEC-001 complemento).
- Determinismo de serialización (INV-2).

### Fuera

- SARIF, Markdown (fase 5 — spec f5).
- Escritura a disco / exit codes (CLI en `f1-analyze`).

## 3. Contrato

### Report JSON (schema)

```ts
interface Report {
  tool: { name: "apigovscan"; version: string };      // engine/package version
  packs: Array<{ id: string; version: string }>;      // sort by id
  input: Array<{
    path: string;                                      // label estable (no abs host path en CI?: ver §7)
    sha256: string;                                     // "sha256:..." o hex — fijar hex+prefijo
  }>;
  summary: {
    error: number;
    warning: number;
    info: number;
    suppressed?: number;                                // f2; omitido en f1
    total: number;
  };
  findings: Finding[];                                 // sort estable ya aplicado
  reportHash: string;                                  // sha256 del canónico sin meta
  meta?: {
    durationMs?: number;
    startedAt?: string;                                // ISO; excluido de hash
    engineVersion?: string;                            // ya está en tool si coincide
  };
}
```

`Finding` = spec `f1-engine` (mismos campos).

### Canonical JSON

- `JSON.stringify` con **key order recursiva alfabética** para el hashing (o parser propio de orden estable).
- Arrays de findings en orden del engine (ya estable).
- UTF-8, sin `undefined` (omitir keys).
- Newline final `\n` en archivos.

### API

```ts
export function buildReport(input: {
  results: EvaluationResult[];      // por spec
  inputs: Array<{ path: string; sha256: string }>;
  packs: Array<{ id: string; version: string }>;
  toolVersion: string;
  meta?: { durationMs?: number; startedAt?: string };
}): Report;

export function formatConsole(report: Report, opts?: ConsoleOpts): string;
export function formatJson(report: Report, opts?: { pretty?: boolean }): string;

export interface ConsoleOpts {
  color: boolean;                   // false si NO_COLOR / --no-color / !TTY
  maxFindings?: number;             // default: all; MCP podría truncar
}
```

### Salida console (formato objetivo)

```
ApiGovScan 1.0.0 · packs elite@2026.09.1 · input sha256:9f3a… · 1.2s

error   NAMING-001  GET /user/{id}
        Resource path segments should be plural nouns.
        fix: Rename last path segment to plural (user → users).
        ↳ Google API Design Guide — Methods and GET-ability
        https://cloud.google.com/apis/design

warning ERR-001  POST /payments
        Write operations should document at least one 4xx response.
        ↳ Zalando RESTful API Guidelines
        https://opensource.zalando.com/restful-api-guidelines/

✖ 2 errors · 14 warnings · 3 info · reportHash 6c1e…
```

- Agrupar findings **por apiLocation** si existe, si no por `location`.
- Severidades con prefijo textual (`error`/`warning`/`info`) — no solo color (NFR-11).
- Orden: severity (ya en array), mostrar en el orden del array (no re-sort en console).

### Redacción (T8)

- En `message`/`fix`/snippet, si se detecta patrón (PEM, `AKIA…`, JWT, `password: xxx` literal largo) ⇒ `***REDACTED***`.
- Implementación ligera en reporters (no en engine) para f1; regla SEC-001 del engine produce findings, el reporter evita re-leaks en previews.

## 4. Criterios de aceptación

- [ ] **AC-R.1** `formatJson(buildReport(...))` parseado ⇒ objeto con `reportHash` que se repite en idéntica construcción.
- [ ] **AC-R.2** Cambiar solo `meta.durationMs` **no** cambia `reportHash`.
- [ ] **AC-R.3** Cambiar un finding **sí** cambia `reportHash`.
- [ ] **AC-R.4** Key order del JSON canónico: hash igual aunque el objeto de entrada tenga claves en orden distinto (orden alfabético recursivo).
- [ ] **AC-R.5** `summary.*` coincide con conteo de findings por severity (invariante de build).
- [ ] **AC-R.6** `formatConsole` con `color:false` no contiene CSI/ANSI escapes.
- [ ] **AC-R.7** `NO_COLOR=1` ⇒ CLI (f1-analyze) fuerza `color:false` (test e2e en analyze).
- [ ] **AC-R.8** Redacción: input con finding cuyo message incluye `-----BEGIN PRIVATE KEY-----` ⇒ output no contiene la key.
- [ ] **AC-R.9** Snapshot console de petstore estable entre corridas (normalize ANSI + duration).
- [ ] **AC-R.10** `packs` en report ordenados por `id` (estable).

## 5. Test plan

- Unit: buildReport summary counts.
- Unit: reportHash golden (objeto fijo).
- Unit: canonical JSON orden de claves.
- Unit: redacción.
- Snapshot: console petstore (comentario de duration).

## 6. Dependencias

- `f1-engine` (types Finding, EvaluationResult)
- `f0-foundation`

## 7. Riesgos y decisiones abiertas

| Tema | Decisión f1 |
|---|---|
| `input.path` absoluto vs relativo | Reporter recibe label ya resuelto por CLI (CLI normaliza a path relativo al cwd cuando sea posible) |
| Pretty JSON | `--format json` compacto por default; pretty con flag interno o cuando TTY (fijar: **pretty si TTY y format json sin --output**) — actualizar AC si cambia |
| sha256 format | hex con prefijo `sha256:` |

## Changelog

- 2026-09-23 · Spec creado desde SDD v1.0.
- 2026-09-23 · M1.4: implementada (AC-R.1…10 verdes en `packages/reporters/test`).
- 2026-09-25 · F5: se agregan `formatSarif`/`formatMarkdown`/`formatAnnotations` (outputs nuevos; `formatConsole`/`formatJson` sin cambios — contrato nuevo en `f5-reporters`).
