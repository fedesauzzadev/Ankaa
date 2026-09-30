# f1-openapi · Parser y normalizador OpenAPI → modelo `Spec`

| Campo     | Valor                                                   |
| --------- | ------------------------------------------------------- |
| Estado    | implementada                                            |
| Fase      | 1                                                       |
| Deriva de | SDD ADR-002, FR-01/02, NFR-02; SDD §7 modelo de dominio |
| Package   | `@apigovscan/openapi`                                   |

## 1. Objetivo

Convertir bytes (YAML/JSON) de OpenAPI 3.0.x / 3.1.x en un modelo normalizado, estable y seguro de consumir por el engine — sin red, con límites duros (INV-1, NFR-08).

## 2. Alcance

### Dentro

- Parse YAML/JSON con hardening (tamaño, profundidad, aliases, tags).
- Validación estructural mínima (es OpenAPI: `openapi`, `paths` o `webhooks`…).
- Swagger 2.0 → **detección + advertencia + conversión best-effort limitada** (solo si es barato con lib; si no, error claro "Swagger 2.0 no soportado aún" — decisión abierta §7).
- Normalización a `Spec` (ver §3) con:
  - operaciones planas
  - índice de components
  - resolución de `$ref` **locales** con sandbox de root
  - remote `$ref` rechazados
- `inputHash` = sha256 de bytes crudos.

### Fuera

- Validador exhaustivo estilo Swagger Editor (schemas de error del spec completo) — suficiente: estructura para reglas + errores de parse claros.
- `$ref` remotos, bundles externos.
- Conversiones de versiones OpenAPI 3.1 ↔ 3.0 semánticas avanzadas (jsonSchemaDialect, etc.) — se captura lo que las reglas necesiten.

## 3. Contrato

### Modelo (export de `core` o tipos compartidos; f1 los consolida)

```ts
type Severity = "error" | "warning" | "info";

interface Spec {
  inputHash: string; // sha256 hex de los bytes crudos
  openapiVersion: string; // "3.1.0" | "3.0.3" | ...
  sourceLabel: string; // path display o "<stdin>"
  info: { title?: string; version?: string; description?: string };
  operations: Operation[];
  components: ComponentIndex;
  parseWarnings: ParseWarning[]; // ej. Swagger 2.0, dialect unknown
}

interface Operation {
  method: string; // lower-case get/post/...
  path: string; // "/users/{id}"
  operationId?: string;
  summary?: string;
  description?: string;
  tags: string[];
  deprecated: boolean;
  parameters: Parameter[]; // merged path-level + op-level (op wins)
  requestBody?: RequestBody;
  responses: Response[]; // sorted by status key
  security: SecurityRequirement[] | undefined; // undefined = hereda global
  extensions: Record<string, unknown>; // x-* relevantes
  stability?: "draft" | "beta" | "stable"; // efectiva: x-stability-level de operation ?? path-item ?? root; ausente = sin marca
  jsonPointer: string; // "/paths/~1users~1{id}/get"
}

interface Parameter {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required: boolean;
  deprecated?: boolean;
  description?: string;
  schema?: SchemaNode;
  jsonPointer: string;
}

interface Response {
  status: string; // "200" | "4XX" | "default"
  description?: string;
  content: ContentMedia[]; // media type + schema ref
  headers: string[];
  jsonPointer: string;
}

interface SchemaNode {
  type?: string | string[];
  format?: string;
  ref?: string; // ya resuelto o local ref id
  enum?: unknown[];
  properties?: Record<string, SchemaNode>;
  required?: string[];
  maxLength?: number;
  example?: unknown;
  // subconjunto consciente — no todo JSON Schema
}

interface ComponentIndex {
  schemas: string[]; // names
  responses: string[];
  parameters: string[];
  // expandir f1 según reglas
}

interface ParseWarning {
  code: string;
  message: string;
  jsonPointer?: string;
}
```

### API del package

```ts
// @apigovscan/openapi
export interface ParseLimits {
  maxBytes: number; // default 10_000_000
  maxDepth: number; // default 100
  maxAliases: number; // default 1000
}

export function parseSpec(
  bytes: Uint8Array | string,
  opts: { sourceLabel: string; limits?: ParseLimits; allowOutsideRoot?: false },
): ParseResult;

export type ParseResult = { ok: true; spec: Spec } | { ok: false; errors: ParseError[] }; // messages localizables

export interface ParseError {
  message: string;
  jsonPointer?: string;
  line?: number;
}
```

### Reglas de normalización

1. **Orden:** `operations` ordenados por `(path, method)`; `responses` por status string.
2. **Merges:** parámetros path-level + operation-level (colisión `in+name` ⇒ op-level gana).
3. **Security:** `security: undefined` en operation = hereda `security` global del doc (el engine lo resuelve); si doc no tiene global y op no tiene ⇒ `[]` (pública) vs `undefined` — **decisión:** representar como `security: null` heredado vs `[]` explícito vacío; documentar: `undefined` = hereda, `[]` = anula.
4. **`$ref`:** solo `#/components/...` (y internos al doc). Resolver a profundidad máx `maxDepth`; ciclo ⇒ dejar `ref` sin expandir + warning `REF_CYCLE` (reglas deben tolerar).
5. **JSON Pointer** en findings = puntero al **documento original** (para saltar desde el reporte), no al modelo normalizado.
6. **Remote ref** `$ref: http...` ⇒ `ParseError` código `REF_REMOTE_FORBIDDEN`.
7. **YAML tags:** solo default YAML 1.1/1.2 scalars; `!!python/object` ⇒ error.
8. Encoding: UTF-8 con BOM opcional; invalid UTF-8 ⇒ error.

## 4. Criterios de aceptación

- [x] **AC-O.1** Petstore mini 3.1 → `ok: true`, `operations.length` esperado (snapshot).
- [x] **AC-O.2** Spec 3.0.3 válido → `ok: true` y `openapiVersion === "3.0.3"`.
- [x] **AC-O.3** JSON OpenAPI (no YAML) → mismo `Spec` que la versión YAML equivalente (deep equal salvo `inputHash`).
- [x] **AC-O.4** YAML con bomba de aliases > `maxAliases` ⇒ `ok: false`, error `YAML_ALIAS_LIMIT`.
- [x] **AC-O.5** Archivo > `maxBytes` ⇒ error `SIZE_LIMIT` antes de parsear.
- [x] **AC-O.6** `$ref` remoto ⇒ `REF_REMOTE_FORBIDDEN` (INV-1).
- [x] **AC-O.7** `$ref` que escapa root (`../../etc/passwd`) ⇒ error `REF_OUTSIDE_ROOT`.
- [x] **AC-O.8** Ciclo de `$ref` local ⇒ no stack overflow; warning `REF_CYCLE`; engine puede seguir.
- [x] **AC-O.9** Profundidad de nesting > `maxDepth` ⇒ `DEPTH_LIMIT`.
- [x] **AC-O.10** `inputHash` estable: mismos bytes ⇒ mismo hash; un byte cambia ⇒ distinto.
- [x] **AC-O.11** Operaciones ordenadas deterministas (mezclar orden de paths en YAML da mismo array final).
- [x] **AC-O.12** Swagger 2.0 ⇒ error claro `SWAGGER_20` + docs (decisión §7).
- [x] **AC-O.13** Path-level parameters mergeados y no duplicados en operation.
- [x] **AC-O.14** Extensiones `x-*` (u otras) disponibles en `extensions` para reglas futuras (al menos genérico `x-*` copiado de operation).
- [x] **AC-O.15** `x-stability-level: draft|beta|stable` en operation ?? path-item ?? root ⇒ `Operation.stability`; valor desconocido ⇒ warning `UNKNOWN_STABILITY` y `stability` ausente; sin marca en ningún nivel ⇒ ausente.

## 5. Test plan

| Fixture                    | Cubre                  |
| -------------------------- | ---------------------- |
| `petstore-mini.yaml` (3.1) | happy, ops ordenadas   |
| `petstore-mini.json`       | equivalencia JSON/YAML |
| `v303-minimal.yaml`        | 3.0.3                  |
| `malformed.yaml`           | exit/error parse       |
| `attack/alias-bomb.yaml`   | AC-O.4                 |
| `attack/remote-ref.yaml`   | AC-O.6                 |
| `attack/outside-root.yaml` | AC-O.7                 |
| `attack/deep-nesting.yaml` | AC-O.9                 |
| `refs-cycle.yaml`          | AC-O.8                 |
| `swagger2-minimal.yaml`    | AC-O.12                |
| `unsorted-paths.yaml`      | AC-O.11                |

Unit tests de normalize + property: shuffle keys de path ⇒ mismo orden.

## 6. Dependencias

- `f0-foundation`
- Decisión de lib: YAML parser con control de aliases (p.ej. `yaml` con límites) + validación ligera propia. Si se usa `@apidevtools/swagger-parser`, debe ejecutarse **sin red** (mock/fetch off) y con `$ref` resuelto manualmente sandbox — evaluar en plan f1.

## 7. Riesgos y decisiones abiertas

| Tema                          | Opciones                   | Recomendación f1                                                                                    |
| ----------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------- |
| Validación profunda vs ligera | swagger-parser full vs own | **Híbrido:** parse own + smoke schema OpenAPI own; no traer validators gigantes si violan size/deps |
| Swagger 2.0                   | error vs convert           | **error + warning en docs** en f1; conversión f2 si hay demanda                                     |
| Dependencia YAML              | `yaml` vs `js-yaml`        | elegir la que permita `maxAliasCount` o pre-scan                                                    |

## Changelog

- 2026-09-23 · Spec creado desde SDD v1.0.
- 2026-09-23 · Implementada (M1.1): `parseSpec` con `yaml@2` + limits; AC-O.1…14 verdes (16 tests); tipos `Spec` consolidados en `@apigovscan/core`; Swagger 2.0 = error `SWAGGER_20` (decisión §7).
- 2026-09-30 · `Operation.stability?` (AC-O.15, backlog M8.6): `x-stability-level` en operation ?? path-item ?? root; valor desconocido ⇒ warning `UNKNOWN_STABILITY`.
- 2026-09-30 · `SecuritySchemeDef.scopes?` (M8.6-A2): unión ordenada de scopes de flows OAuth2 (para el átomo `undefinedOAuthScopes`).
