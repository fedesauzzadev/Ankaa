# SDD — Software Design Document · ApiGovScan

| Campo | Valor |
|---|---|
| Producto | ApiGovScan — analizador local de API Governance |
| Versión del documento | 1.0 |
| Fecha | 2026-09-23 |
| Estado | Aprobado — Fases 0–5 implementadas (specs `f0-*`…`f5-*` cerradas; último tag `v0.5.0-action`); Fase 6+ pendiente |
| Tipo de proyecto | Herramienta de developer productivity (local-first) |
| Stack | TypeScript · pnpm workspaces · Node ≥ 20 · Cloudflare Workers (solo edge services) · Docker Compose (dev/self-host) |

---

## 1. Resumen ejecutivo

El API governance roto no se manifiesta como un incidente: se manifiesta como **deuda silenciosa**. Naming inconsistente, errores sin estándar, paginación inventada por servicio, versionado ad-hoc, specs desactualizadas… Cada proyecto nuevo hereda el desorden del anterior porque no existe un feedback loop rápido, barato y objetivo en el día a día del equipo. Las consultoras y los "API review boards" no escalan al ritmo de un backlog multi-squad.

**ApiGovScan cierra ese loop con una herramienta que:**

1. **Corre donde vive tu código:** local, en tu máquina o en CI. Nunca sube specs ni fuente a la nube (privacidad por arquitectura, no por política).
2. **Analiza APIs sin tocar código:** entrada principal OpenAPI/Swagger (YAML/JSON); después código (rutas), proto y GraphQL. Salida: qué está mal, qué está bien, qué mejorar — con severidad, referencia al estándar y fix sugerido.
3. **Trae estándares de élite ya curados:** Google API Design Guide, Microsoft REST API Guidelines, Zalando, RFCs de IETF, OpenAPI Spec — empaquetados como **rule packs versionados** con cita a la fuente. Un worker de Cloudflare detecta cambios en las fuentes; la publicación es por draft con aprobación (nunca auto-merge silencioso).
4. **Permite reglas propias al momento de analizar:** DSL declarativa en YAML + overrides por CLI, sin escribir código.
5. **Retroalimenta sin tokens de LLM:** motor **100% determinista** (AST + patrones). El "aprendizaje" es la carpeta `.apigovscan/skills/` — suppressions, severidades locales y reglas nuevas derivadas de tu feedback (`report + feedback → learn`), versionable en git. Cero costo por corrida.
6. **Expone el mismo motor como MCP:** stdio local para Claude/Cursor/opencode (con acceso a tus archivos); servidor remoto opcional en Cloudflare solo para consultar estándares (el análisis remoto no existe: no podría leer tu disco y no querríamos que pudiera).

**Distribución:** `npx @apigovscan/cli analyze .` — cero instalación permanente. Docker Compose para quien quiera self-host completo sin Cloudflare. Objetivo de costo de infraestructura para usuarios: **$0**.

## 2. Decisiones clave

| # | Decisión | Fundamento resumido | ADR |
|---|---|---|---|
| D1 | TypeScript (Node ≥ 20) | MCP SDK oficial en TS, Cloudflare Workers nativo en JS/TS, npm/npx como canal de distribución, parsers OpenAPI maduros | [ADR-001](02-arquitectura.md#adr-001-typescript-no-go-ni-python) |
| D2 | OpenAPI-first (specs antes que código) | 80% del valor con 20% del esfuerzo; specs son el contrato que governance debe cuidar; código entra después por capas de parser | [ADR-002](02-arquitectura.md#adr-002-openapi-first-antes-que-code-first) |
| D3 | Local-first: el análisis nunca sale de la máquina | Requisito de privacidad; Workers Free no da CPU para parseo pesado; el producto es mejor sin red | [ADR-003](02-arquitectura.md#adr-003-local-first-análisis-nunca-sale-de-la-máquina) |
| D4 | Clean Architecture (hexagonal) | Core puro sin I/O; adapters CLI/MCP/CF intercambiables; testability sin mocks de red/FS | [ADR-004](02-arquitectura.md#adr-004-clean-architecture-hexagonal) |
| D5 | Motor determinista, LLM opcional y fuera del core | Governance es mayormente chequeable con patrones; 0 tokens = costo marginal cero; LLM solo (y opcional) para lo subjetivo | [ADR-005](02-arquitectura.md#adr-005-motor-determinista-llm-solo-opcional-y-fuera-del-core) |
| D6 | Estándares como rule packs YAML versionados con cita a fuente | Auditables, diffables, pinneables; actualizaciones humanas; sin sorpresas en CI | [ADR-006](02-arquitectura.md#adr-006-rule-packs-versionados-con-fuente-citada) |
| D7 | Skills = aprendizaje en git, no modelo entrenado | Feedback → suppressions/severidades/reglas nuevas en `.apigovscan/skills/`; idempotente; 0 tokens; portable del dev al equipo | [ADR-007](02-arquitectura.md#adr-007-skills-en-git-no-modelo-entrenado) |
| D8 | Cloudflare solo para servicios de borde (packs, MCP remoto, cron de fuentes) | Aprovecha free tier (100k req/día) sin contradecir local-first; análisis vive en el cliente | [ADR-008](02-arquitectura.md#adr-008-cloudflare-para-servicios-de-borde-no-para-análisis) |
| D9 | MCP stdio local como interfaz IA primaria | El LLM accede a los mismos tools del CLI sobre el filesystem local; remoto solo consulta estándares | [ADR-009](02-arquitectura.md#adr-009-mcp-stdio-local-como-interfaz-ia-primaria) |
| D10 | Docker Compose como piso self-host / dev (alternativa gratis a CF) | Equipos sin CF, CI determinista, entorno de desarrollo paridad; el CLI no requiere Docker | [ADR-010](02-arquitectura.md#adr-010-docker-compose-para-dev-y-self-host) |
| D11 | Determinismo e idempotencia como invariantes | Mismo input + misma versión de packs → mismo reporte (orden estable + content-hash); `learn` idempotente por fingerprint | [ADR-011](02-arquitectura.md#adr-011-determinismo-e-idempotencia-como-invariantes) |
| D12 | Monorepo pnpm workspaces | Core, parsers, reporters, CLI, MCP y worker comparten tipos y versionan juntos; despliegues independientes | [ADR-012](02-arquitectura.md#adr-012-monorepo-pnpm-workspaces) |

## 3. Objetivos

### Objetivos de producto

- Reducir el tiempo de un "API review" de horas a minutos, con findings accionables y citados.
- Que un proyecto existente pueda adoptar governance **sin refactor**: baseline de deuda actual + gate solo para lo nuevo.
- Que el motor corra **0 tokens** en el 100% de los flujos de análisis; el aprendizaje sea evidencia en git, no una caja negra.
- Costo de infraestructura del usuario final: **$0** (CLI local, packs embebidos/descargables, CF free tier para servicios opcionales).

### Objetivos técnicos (medibles)

- Analizar un spec OpenAPI de ≤ 1 MB en **< 2 s** (p95) en laptop modesta.
- **0 peticiones de red** durante `analyze` (verificable; ver INV-1).
- Pack "elite" inicial: **≥ 50 reglas** activas categorizadas (naming, estructura, errores, seguridad, versionado, paginación, docs, deprecación…).
- Cobertura OpenAPI **3.0.x y 3.1.x** en v0 (Swagger 2.0: conversión best-effort, advertida).
- Reportes deterministas: mismo input + misma versión de packs ⇒ **hash de findings idéntico**.

## 4. Qué NO es ApiGovScan (anti-alcance)

- **No es un linter de código fuente** (no pretende competir con ESLint/Prettier/ruff); puede *complementar* leyendo anotaciones de rutas en una fase posterior.
- **No es un gateway, proxy ni runtime** de APIs (no intercepta tráfico).
- **No es un portal/API catalog** (no almacena inventario de APIs de la empresa en la nube).
- **No genera ni reescribe código/specs** (sugiere fixes en texto; no muta el repo del usuario).
- **No entrena modelos ni requiere API keys de LLM** en el core.
- **No sube specs a la nube** — ni siquiera "para telemetría anónima". Sin excepciones en v1.
- **No auto-aplica cambios de estándares** al pack publicado sin aprobación humana.
- **No resuelve governance de datos/gRPC-first/GraphQL-first en v0** (los dos últimos, tras OpenAPI, como adapters futuros).

## 5. Invariantes sagrados

| ID | Invariante | Verificación |
|---|---|---|
| INV-1 | **Cero exfiltración:** `analyze` no realiza ninguna conexión de red (sin fetch, sin telemetría, sin update-check silencioso) | Test de red en CI (stub global fetch que falla); revisión de dependencias |
| INV-2 | **Determinismo:** mismo bytes de input + misma config + misma versión de packs ⇒ mismos findings, mismo orden, mismo hash | Snapshot tests + property test de orden estable |
| INV-3 | **Core sin LLM:** el motor de análisis no invoca modelos ni consume tokens en ningún path obligatorio | Arquitectura (no hay código de inferencia en `core`); test de ausencia de dependencias de red/IA |
| INV-4 | **Los specs son datos, no código:** ninguna regla evalúa JS/TS arbitrario del spec ni hace `eval`/`Function` | DSL declarativa whitelist de constructores; audit de `core` en CI (grep de eval) |
| INV-5 | **`learn` idempotente:** aplicar dos veces el mismo `feedback` sobre el mismo `report` produce el mismo estado de skills | Test: learn(f,p) ∘ learn(f,p) ≡ learn(f,p) |
| INV-6 | **Packs pinneables:** un reporte siempre declara `packsVersion`; CI puede fallar si el pack flota sin pin | Campo obligatorio en reporte JSON + regla de config |
| INV-7 | **Sin auto-mutación del repo:** ApiGovScan jamás escribe fuera de `.apigovscan/` (y de outputs explícitos con `--output`) | Test de FS con tempdir: solo se permite escribir rutas autorizadas |

## 6. Índice de documentos

1. [Visión y requisitos](01-vision-y-requisitos.md) — problema, personas, FR/NFR medibles, anti-alcance detallado.
2. [Arquitectura](02-arquitectura.md) — principios, Clean Architecture, C4, flujo de análisis, ADRs (D1–D12).
3. [Motor y reglas](03-motor-y-reglas.md) — modelo de reglas, DSL, findings, skills, learn, determinismo.
4. [Estándares](04-estandares.md) — fuentes curadas, versionado de packs, worker de actualización.
5. [Despliegue y costos](05-despliegue-y-costos.md) — CLI/npx, Docker Compose, Cloudflare, MCP, presupuesto $0.
6. [Seguridad](06-seguridad.md) — modelo de amenazas, hardening de parsers, supply chain, MCP.

## 7. Roadmap

| Fase | Entregable | Criterio de salida |
|---|---|---|
| 0 | Repo, workspaces, CI base, esta documentación | `pnpm i && pnpm build && pnpm test` verde en CI |
| 1 | **MVP:** parser OpenAPI + motor + pack elite v0 (≥ 50 reglas) + reportes console/JSON | `npx . analyze fixtures/petstore.yaml` produce reporte determinista con INV-1..INV-3 verificadas |
| 2 | Config `apigovscan.yaml`, DSL de reglas custom, CLI `--rule/--rules`, baseline | Proyecto con deuda adopta baseline; solo falla lo nuevo (`--baseline`) |
| 3 | `init` + `.apigovscan/skills/` + `learn` (feedback → suppressions/severidades/reglas draft) | INV-5 con tests; flujo report→feedback→learn→re-analyze demostrado |
| 4 | MCP stdio local (`analyze`, `list_rules`, `explain_rule`, `validate_rules`) | Cliente MCP (Claude/Cursor) analiza un spec local end-to-end |
| 5 | Reporters SARIF + Markdown, GitHub Action oficial (`apigovscan-action`) | PR check publica annotations + job summary |
| 6 | Cloudflare: worker de fuentes (cron semanal) + distribución de packs (R2/KV) + MCP remoto *solo consulta* | Publicación de pack por draft con aprobación; docs de pin de versión |
| 7 | Self-host Docker Compose completo (registry local de packs + worker simulado + docs) | `docker compose up` sirve packs sin depender de CF |
| 8+ | Adapters: código (Express/FastAPI/Spring routes), proto/gRPC, GraphQL; dashboard de adopción (opcional) | Un adapter extra con su propio corpus de fixtures |

## 8. Riesgos principales

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Falsos positivos ruidosos → la gente lo desactiva | Adopción muere | Severidad realista, baseline agresivo, `learn` rápido para suppress, "explain" con cita a fuente |
| Specs ausentes o viejos en el proyecto target | Sin entrada que analizar | Modo `discover` (busca `openapi*`, `swagger*`); mensaje claro + guía de adopción mínima; adapters de código en roadmap |
| El worker auto-publica una regla mala | CI roto en masas | Packs versionados + pin + canario/stable + **aprobación humana** (no auto-merge) |
| Scope creep hacia "portal de APIs" | Nunca termina | Anti-alcance §4 + invariantes como contrato de alcance |
| DSL de reglas se vuelve un lenguaje de programación | Complejidad, IN-4 en riesgo | Whitelist estricta de constructores; sin loops ni I/O en reglas; reglas complejas = nuevo rule en TS *dentro* de core versionado |
| Cloudflare free (100k req, 10 ms CPU) insuficiente | Servicios de borde caen | Análisis nunca en CF; packs son objetos estáticos (cacheados); MCP remoto read-only; upgrade puntual si hace falta |
| Dependencia de specs de terceros (licencia/cambio) | Pack se pudre | Citas + snapshots de fuente en repo; forks internos de las guías relevantes; revisión humana en cadencia |
| Multi-OS (paths, YAML exoticos, encoding) | Bugs de adopción | CI matriz (linux/win/macos), fixtures de codificación, normalización de paths en fingerprints |
| Monorepo se infla premature | Overhead | Empieza con 4–6 packages chicos; regla: solo extraer si hay segundo consumidor real |

## 9. Glosario

| Término | Definición |
|---|---|
| Rule pack | Conjunto versionado de reglas (YAML) con metadatos de fuente (ej. `elite@2026.09.1`), embebido o descargable |
| Regla | Unidad de verificación declarativa: id, severidad, mensaje, matcher sobre el modelo de spec, referencia a estándar |
| Finding | Ocurrencia concreta de una regla en un location del spec (path JSON Pointer + apiPath + method) |
| DSL | Lenguaje declarativo (subconjunto YAML) para reglas de usuario; sin código arbitrario |
| Skills | Artefactos aprendidos en `.apigovscan/skills/`: suppressions, overrides de severidad, reglas draft derivadas de feedback |
| Feedback | Marcado del usuario sobre findings de un reporte: `confirmed` / `false_positive` / `wontfix` / `severity_change` |
| Learn | Operación idempotente que transforma `report + feedback` en cambios de skills |
| Baseline | Snapshot de findings existentes aceptados; permite gate "solo lo nuevo" |
| Determinismo | Mismo input + misma config + mismos packs ⇒ mismo reporte byte a byte (salvo campo de metadatos de corrida) |
| Fingerprint | Hash estable de un finding (regla + locations + clave semántica) usado como identidad en learn/baseline |
| Content-hash | Hash del input spec usado para saber si un baseline sigue siendo aplicable |
| Local-first | El análisis ocurre en la máquina del usuario; ningún byte del spec sale por red |
| MCP | Model Context Protocol — protocolo para exponer tools a clientes LLM (stdio local o HTTP remoto) |
| Pack pin | Fijar versión exacta de un rule pack en config para CI reproducible |
| Draft de pack | Versión candidata de un pack generada por el worker de fuentes, pendiente de aprobación humana |
| Elite pack | Pack curado por defecto con guías públicas de alto prestigio (Google, Microsoft, Zalando, IETF, OpenAPI) |
| Worker (CF) | Cloudflare Worker: funciones edge para distribuir packs, servir MCP remoto de consulta y cron de fuentes |

---

*Estado actual: Fases 0–5 cerradas (specs/plans/tasks en sus carpetas con changelogs). Próximo paso del roadmap: Fase 6 (Cloudflare, registry de packs, MCP remoto de consulta) — abrir sus specs cuando se arranque.*
