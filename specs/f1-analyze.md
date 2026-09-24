# f1-analyze · Caso de uso y comando `analyze`

| Campo | Valor |
|---|---|
| Estado | implementada |
| Fase | 1 |
| Deriva de | SDD FR-01…FR-06, ADR-003, ADR-004, INV-1/2/7; specs `f1-openapi`, `f1-engine`, `f1-elite-pack`, `f1-reporters` |
| Roadmap | Fase 1 MVP |

## 1. Objetivo

Como **dev**, quiero correr un solo comando local y obtener un reporte de governance de mi spec OpenAPI, para saber qué arreglar sin subir nada a ningún lado.

**User story canónica:**

> Given un archivo `openapi.yaml` y el pack elite embebido,  
> When ejecuto `apigovscan analyze ./openapi.yaml`,  
> Then obtengo findings ordenados deterministas en consola (o JSON), exit code acorde a `failOn`, y **cero** peticiones de red.

## 2. Alcance

### Dentro

- Caso de uso de aplicación `analyzeUseCase` (orquestación pura).
- Adaptador CLI: argv, FS, stdout/stderr, exit codes.
- Resolución de entrada: archivo único | directorio (descubrimiento) | stdin.
- Carga de config `apigovscan.yaml` (subconjunto f1: `failOn`, `rules` overrides, `standards.pack/version` pin local).
- Integración: openapi → engine → reporters.
- Flag `--format`, `--output`, `--fail-on`, `--rules`, `--rule`, `--debug`.

### Fuera (explícito)

- `--baseline`, `learn`, `init`, `skills` → fase 2 (spec f2).
- MCP → spec f4 (roadmap).
- Descarga/actualización de packs remotos (`standards update`) → fase 6.
- Análisis de código no-OpenAPI.

## 3. Contrato

### CLI

```bash
apigovscan analyze <path> [options]

Arguments:
  path              Archivo, directorio o '-' (stdin)

Options:
  --format <fmt>    console | json          (default: console)
  --output <file>   escribe reporte a archivo (además o en vez de stdout)
  --fail-on <sev>   error | warning | info | never   (default: error)
  --rules <file>    YAML/JSON de reglas custom (se añaden al pack)
  --rule <json>     regla inline JSON
  --no-color        desactiva color (también respeta NO_COLOR)
  --debug           timings por etapa a stderr; jamás cuerpo completo del spec
  -h, --help
  -V, --version
```

### Exit codes

| Código | Condición |
|---|---|
| 0 | Análisis OK y ningún finding con severidad ≥ `failOn` (o `failOn: never`) |
| 1 | ≥ 1 finding con severidad ≥ `failOn` |
| 2 | Error de uso / input inválido / parseo fallido / regla custom inválida |

### Descubrimiento en directorio

Orden estable:

1. `openapi.{yaml,yml,json}`
2. `openapi/**/openapi.{yaml,yml,json}`
3. `**/swagger.{yaml,yml,json}` (con advertencia Swagger 2.0)
4. Si 0 resultados → exit 2 con mensaje de ayuda.

Múltiples specs → findings concatenados con prefijo `input.path` de cada uno; orden global por `(path, tuple de findings)`.

### Config `apigovscan.yaml` (subconjunto f1)

```yaml
failOn: error
standards:
  pack: elite
  # version: "2026.09.1"   # f1: solo pack embebido; pin se valida cuando exista registry
rules:
  NAMING-001: off
  ERR-010: warning
```

Búsqueda de config: `./apigovscan.yaml` → `./apigovscan.yml` → none. `--config <file>` override.

### Puertos (application)

```ts
interface SpecLoader {
  load(path: string): Promise<Uint8Array>;           // FS adapter en cli
}
interface PackRepository {
  loadActive(): Promise<RulePack[]>;                 // embebido + overrides
}
interface ReportSink {
  write(report: Report): Promise<void>;              // stdout o --output
}
```

`analyzeUseCase` no conoce `fs` ni `process`.

### Secuencia (referencia)

Ver SDD §02.5. Etapas y debug:

1. resolve inputs  
2. load bytes  
3. parse+normalize  
4. load packs+config+custom rules  
5. engine.evaluate  
6. apply overrides (`rules:` config)  
7. sort + counts  
8. report build + sink  
9. exit code  

## 4. Criterios de aceptación

- [ ] **AC-A.1** `analyze` sobre `fixtures/petstore-mini.yaml` sale exit 0 o 1 según findings reales documentados en snapshot (no crash).
- [ ] **AC-A.2** Mismo spec corrido dos veces ⇒ `reportHash` idéntico (INV-2).
- [ ] **AC-A.3** Corrido con red bloqueada (test INV-1) ⇒ éxito; no se intenta `fetch`.
- [ ] **AC-A.4** `--format json` produce JSON parseable con schema `{tool, packs, input, summary, findings[]}` (ver `f1-reporters`).
- [ ] **AC-A.5** `--fail-on warning` con ≥1 warning ⇒ exit 1; `--fail-on never` ⇒ exit 0 aunque haya errors (documento: `never` solo para exploración).
- [ ] **AC-A.6** Spec malformado ⇒ exit 2 + mensaje en stderr con pointer de error; no stack trace crudo por default.
- [ ] **AC-A.7** `--rule` con JSON inválido ⇒ exit 2, no analiza.
- [ ] **AC-A.8** Config `rules: {X: off}` elimina findings de X del reporte final (post-evaluate).
- [ ] **AC-A.9** Directorio con 0 specs ⇒ exit 2 con lista de patrones buscados.
- [ ] **AC-A.10** stdin `-` funciona con piped YAML.
- [ ] **AC-A.11** `--output r.json` escribe el archivo; stdout puede quedar vacío en modo file (o resumen corto en console+file — decisión: si `--output` y format=json ⇒ silencio stdout salvo `--debug`).
- [ ] **AC-A.12** `--debug` no imprime valores de `example` ni bodies > 200 chars.
- [ ] **AC-A.13** Multi-spec en directorio: orden estable de paths (sort lexicográfico normalizado).

## 5. Test plan

| Caso | Tipo | Nota |
|---|---|---|
| happy path fixture válida | e2e cli (execa) | snapshot console + json |
| determinismo double run | e2e | reportHash equal |
| exit codes matrix | e2e | 0/1/2 |
| config overrides | unit (useCase) + e2e | |
| custom rule inline | e2e | |
| directorio discovery | e2e | fixtures dir |
| stdin | e2e | |
| red fail-fast | unit (invariant) | ver f1-invariants |

## 6. Dependencias

- `f0-foundation`
- `f1-openapi` (parse)
- `f1-engine` (evaluate)
- `f1-elite-pack` (pack embebido — al menos cargable; puede entrar con pack parcial en dev pero AC usa pack completo al cerrar fase)
- `f1-reporters`

## 7. Riesgos y decisiones abiertas

| Tema | Decisión |
|---|---|
| Múltiples errores de parse en directorio | Abort total (exit 2) vs parcial; **f1: abort** si algún input falla (CI-friendly) |
| `failOn: never` | Permitido con advertencia en consola |
| Color | `NO_COLOR` + `--no-color` + TTY detect |

## Changelog

- 2026-09-23 · Spec creado desde SDD v1.0.
- 2026-09-23 · M1.4: implementada (AC-A.1…13 verdes; e2e en `packages/cli/test/analyze.e2e.test.ts`).
