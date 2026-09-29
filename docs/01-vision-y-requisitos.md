# 01 · Visión y requisitos

ApiGovScan · SDD · v1.0

---

## 1. Visión

> "Cualquier equipo, en el segundo en que define un endpoint nuevo, recibe en segundos una respuesta objetiva — con estándar citado — de si esa API está bien hecha o no, sin subir una sola línea a ningún lado y sin gastar un token."

## 2. Problema

El API governance roto tiene tres propiedades que lo hacen persistente:

1. **Es silencioso:** no rompe el build; acumula inconsistencia entre servicios hasta que integraciones cuestan el doble.
2. **Se contagia:** el endpoint nuevo se copia del viejo; sin feedback inmediato, el estándar de facto es "lo que hizo el squad hace 18 meses".
3. **Los remedios no escalan:** review boards manuales, consultoras y documentación que nadie lee llegan tarde y no cubren el backlog multi-squad.

El resultado: cada proyecto nuevo nace mal si el gobierno del anterior estaba mal. ApiGovScan interrumpe ese ciclo con un loop barato: **analizar → entender → decidir → aprender (en git)**.

## 3. Personas (stakeholders)

| Persona                       | Descripción                                  | Necesidades clave                                                          |
| ----------------------------- | -------------------------------------------- | -------------------------------------------------------------------------- |
| **Dev backend**               | Expone endpoints nuevas o modifica specs     | Feedback en segundos, sin salir del terminal/IDE, sin setup pesado         |
| **Tech lead / architect**     | Responde por la consistencia del API surface | Estándar ejecutable (no PDF), baseline de deuda, gate en PR                |
| **Platform / API guild**      | Define el estándar de la empresa             | Personalizar reglas sin forkear el motor; versionar reglas como código     |
| **QA / integraciones**        | Contra contratos entre equipos               | Reportes citados, SARIF, trazabilidad a la fuente del estándar             |
| **DevOps / CI owner**         | Mantiene pipelines                           | Determinismo, pin de versiones, costo ~0, sin secretos nuevos obligatorios |
| **Security / compliance**     | Exige buenas prácticas en APIs públicas      | Reglas de auth, rate limits, deprecación, datos sensibles citando RFCs     |
| **Comprador de herramientas** | Decide adoptar o no                          | $0 para probar, sin subir specs a vendor (auditable con INV-1)             |

## 4. Alcance

### Dentro de alcance (producto, por fases del roadmap)

- Análisis de **OpenAPI 3.0.x / 3.1.x** (YAML/JSON) desde archivo o directorio — sin red.
- Pack **elite** curado de guías públicas (Google, Microsoft, Zalando, IETF, OpenAPI), versionado y con cita por regla.
- Reglas propias: DSL YAML + flags CLI (`--rule`, `--rules`) aplicables **en el momento del análisis**.
- Reportes: **console** (humano), **JSON** (máquina), luego **SARIF** y **Markdown** (GitHub).
- **Baseline** estilo ESLint: deuda existente no bloquea; lo nuevo sí cuenta.
- **Skills** (`.apigovscan/skills/`): suppressions, severidades locales, reglas draft — derivadas de `learn`, versionables en git.
- **MCP stdio local**: `analyze`, `list_rules`, `explain_rule`, `validate_rules` para clientes LLM.
- **CLI** distribuible por npm/npx; **Docker Compose** para self-host/dev; **Cloudflare** para distribución de packs + MCP remoto de consulta + cron de fuentes.
- **GitHub Action** oficial (fase 5): annotations + job summary en PRs.

### Fuera de alcance (v1)

- Análisis en la nube de specs del usuario (contradice local-first).
- Reescritura automática de specs/código (solo sugerencias textuales).
- Portal/catálogo de APIs, testing funcional de APIs en runtime, mock servers.
- Linting de código fuente general (fuera de adapters de rutas).
- Entrenamiento de modelos, telemetría de uso con contenido de specs.
- GraphQL/gRPC como entradas principales (post-v1, adapters).
- Auto-publicación de cambios en packs elite sin aprobación humana.

## 5. Supuestos y restricciones

- El usuario tiene **Node ≥ 20** o Docker; no se exige cuenta en ningún servicio para el core.
- La adopción empieza por **specs ya existentes**; proyectos sin spec reciben diagnóstico y ruta de adopción mínima (no inventamos specs).
- El estándar "elite" es **curaduría humana** sobre fuentes públicas — no un modelo que "opina".
- El learning es **acumulación de evidencia en skills**, no mejora de precisión mágica sin revisión: reglas draft requieren aceptación implícita (quedan como draft hasta `learn --promote` o edición).
- Cloudflare free tier es suficiente para servicios de borde (ver 05); **no** se ejecuta análisis de specs ahí.
- Idioma de UI/reportes v1: **inglés** (estándar de industria para findings/SARIF); docs del SDD en español.

## 6. Requisitos funcionales

### 6.1 Análisis

| ID    | Requisito                                                                                                                                                                                    |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-01 | `analyze <path>` acepta archivo OpenAPI (YAML/JSON), directorio (descubre `*openapi*`, `*swagger*`) o `-` (stdin)                                                                            |
| FR-02 | Soporta OpenAPI 3.0.x y 3.1.x; Swagger 2.0 con conversión best-effort + advertencia en el reporte                                                                                            |
| FR-03 | Produce findings con: `ruleId`, `severity` (error/warn/info), `message`, `location` (JSON Pointer), `apiLocation` (method+path cuando aplique), `fix` (sugerencia), `source` (fuente citada) |
| FR-04 | **No realiza red** durante el análisis (INV-1)                                                                                                                                               |
| FR-05 | Reporte incluye `engineVersion`, `packs` (id+versión), `inputHash`, `findingsCount` por severidad                                                                                            |
| FR-06 | Exit codes: `0` sin findings ≥ `failOn`; `1` findings que incumplen `failOn`; `2` error de uso/input                                                                                         |

### 6.2 Estándares y reglas

| ID    | Requisito                                                                                                                               |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------- |
| FR-10 | Pack **elite** embebido en el CLI con ≥ 50 reglas al final de fase 1                                                                    |
| FR-11 | Cada regla declara `id`, `severity` default, `category`, `message`, `source.url` + `source.title` (opcionalmente `section`)             |
| FR-12 | `rules list` y `rules explain <id>` muestran texto completo + cita                                                                      |
| FR-13 | Config en `apigovscan.yaml`: activar/desactivar reglas, cambiar severidad, elegir packs, pin de versión, `failOn`, `baseline`, `skills` |
| FR-14 | Reglas custom inline: `--rule '{"id":"X","severity":"error","when":{...},"message":"..."}'` y/o archivo `--rules ./rules.yaml`          |
| FR-15 | El DSL soporta whitelist de constructores (ver 03); rechaza con error claro cualquier regla no soportada                                |

### 6.3 Baseline y adopción

| ID    | Requisito                                                                                                                                   |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-20 | `analyze --write-baseline` guarda fingerprint de findings actuales + `inputHash`                                                            |
| FR-21 | `analyze --baseline` excluye findings presentes en baseline **si** `inputHash` es compatible (o con `--baseline-ignore-hash` y advertencia) |
| FR-22 | Los findings nuevos (no en baseline) respetan `failOn` — gate "solo lo nuevo"                                                               |

### 6.4 Skills y aprendizaje

| ID    | Requisito                                                                                                                                                                                                                     |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-30 | `init` crea `.apigovscan/` con `config` ejemplo, `skills/` y README corto de skills                                                                                                                                           |
| FR-31 | `learn --report r.json --feedback f.json` aplica: `false_positive` → suppression, `severity_change` → override, `confirmed` → nada (refuerza), `wontfix` → suppression con motivo, `suggest_rule` → draft en `skills/drafts/` |
| FR-32 | Learn es **idempotente** (INV-5); re-ejecutar no duplica entradas                                                                                                                                                             |
| FR-33 | Suppression por fingerprint y por query (ruleId + path pattern) con comentario obligatorio                                                                                                                                    |
| FR-34 | Tras learn, un re-análisis refleja skills sin re-ejecutar learn                                                                                                                                                               |

### 6.5 Reportes y CI

| ID    | Requisito                                                                                                                                                                                                                                                                               |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-40 | `--format console\|json\|sarif\|markdown\|annotations` (console/json en fase 1; sarif/markdown/annotations en fase 5 — `annotations` extiende el alcance original, ver spec `f5-reporters`)                                                                                             |
| FR-41 | JSON estable para diffs; orden determinista (INV-2)                                                                                                                                                                                                                                     |
| FR-42 | GitHub Action: `fail-on` configurable, output de annotations SARIF, resumen en job                                                                                                                                                                                                      |
| FR-43 | El reporte nunca incluye valores secretos de ejemplos del spec (redacción de patrones tipo token/clave)                                                                                                                                                                                 |
| FR-45 | **Governance score** determinista `0-100` + grade `A-F` en console/JSON/markdown/SARIF/MCP, derivado de findings post-filtros; incluido en `reportHash` (fase 6 — spec `f6-score`)                                                                                                      |
| FR-64 | **Distribución privada**: tarball self-contained offline (air-gap) + registry privado (GitHub Packages) + Docker; `analyze`/`mcp` exigen **licencia offline** (`--license-key` / `APIGOVSCAN_LICENSE_KEY` / config `license.key`), validación sin red (fase 6 — spec `f6-distribution`) |

### 6.6 MCP

| ID    | Requisito                                                                                                                               |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------- |
| FR-50 | `apigovscan mcp` expone tools vía **stdio**: `analyze_spec`, `list_rules`, `explain_rule`, `validate_custom_rules`, `explain_finding`   |
| FR-51 | Mismas semánticas que el CLI (mismo core); sin estado entre sesiones salvo lo que el cliente reenvíe                                    |
| FR-52 | MCP remoto (CF) **solo** herramientas de consulta de estándares (`list_packs`, `explain_rule`, `get_pack`); jamás analiza specs remotos |

### 6.7 Distribución y estándares (borde)

| ID    | Requisito                                                                                                                               |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------- |
| FR-60 | Paquete npm `@apigovscan/cli` ejecutable con `npx`                                                                                      |
| FR-61 | `standards list                                                                                                                         | info | update | pin`gestiona packs locales vs publicados (update solo si el usuario lo pide — nunca en`analyze`) |
| FR-62 | Worker CF: cron semanal verifica fuentes, genera **draft** de pack con changelog; publica tras aprobación a R2/KV con versión inmutable |
| FR-63 | Canales `stable` / `canary` para packs; config default `stable` con pin recomendado en CI                                               |

## 7. Requisitos no funcionales

| ID     | Categoría                | Requisito                                                                            |
| ------ | ------------------------ | ------------------------------------------------------------------------------------ |
| NFR-01 | Privacidad               | 0 bytes de spec fuera de la máquina en cualquier flujo v1 (INV-1)                    |
| NFR-02 | Rendimiento              | Spec ≤ 1 MB analizado en < 2 s p95 (laptop modesta, pack elite completo)             |
| NFR-03 | Arranque                 | `npx` cold start percibido < 3 s en conexión normal (bundle mínimo)                  |
| NFR-04 | Costo                    | Infraestructura del usuario: $0 (CLI + packs; CF free para opcionales)               |
| NFR-05 | Determinismo             | Reportes reproducibles; tests de snapshot e propiedad (INV-2)                        |
| NFR-06 | Aislamiento              | Core sin dependencias de red, FS ni proceso (test unitario sin mocks pesados)        |
| NFR-07 | Portabilidad             | Windows/macOS/Linux; paths normalizados en fingerprints                              |
| NFR-08 | Seguridad                | Sin `eval`; limits de tamaño/profundidad en YAML; outputs seguros (ver 06)           |
| NFR-09 | Observabilidad (interna) | Flags `--debug` con timing por etapa; nunca loguea contenido completo del spec       |
| NFR-10 | Compatibilidad           | Node ≥ 20 LTS; ESM; tipos TypeScript publicados                                      |
| NFR-11 | Accesibilidad de output  | Console con color opcional (`NO_COLOR`), mensajes sin dependencia solo-de-color      |
| NFR-12 | Mantenimiento            | Dependencias mínimas; lockfile; releases con changelog y notas de migración de packs |

## 8. Escenarios de uso (aceptación narrativa)

**S1 — Dev, 30 segundos:** `npx @apigovscan/cli analyze ./specs/payments.yaml` → ve 12 warns con cita a Microsoft guidelines, arregla naming de un path, re-corre, 10 warns.

**S2 — Lead, adopción sin dolor:** `--write-baseline` en main; en PR el Action solo comenta findings **nuevos** con severidad ≥ error.

**S3 — Guild, regla propia al vuelo:** `analyze ./specs/new.yaml --rule rules-brand.yaml` exige header `x-request-id` sin tocar el motor.

**S4 — Feedback → skills:** marcan 3 findings como FP → `learn` → suppression con comentario en `skills/suppressions.yaml` → commit → el equipo entero deja de verlos; mismo learn dos veces = mismo archivo.

**S5 — IA local:** cliente MCP corre `analyze_spec` sobre el repo abierto; explica `NAMING-004` con la cita de Google guide; **0 tokens de ApiGovScan** (el LLM solo consume sus propios tokens del cliente).

**S6 — CI determinista:** `packs: elite@2026.09.1` pineado; upgrade de pack es PR explícito con changelog del worker.

---

_Continuar: [02-arquitectura.md](02-arquitectura.md)._
