# f14-agent-api-review · Revisor local de cambios de API para personas y agentes

| Campo         | Valor                                                                     |
| ------------- | ------------------------------------------------------------------------- |
| Estado        | ready                                                                     |
| Fase          | 14                                                                        |
| Deriva de     | `f1-analyze`, `f4-mcp-tools`, `f5-action`, `f12-breaking`, INV-1/2/3/5/7  |
| Investigación | [product discovery 2026-09](../docs/product-discovery-backlog-2026-09.md) |

## 1. Problema y promesa del producto

Revisar un cambio de API exige reunir reglas de governance, diferencias contra
una versión anterior, ubicaciones precisas y contexto suficiente para decidir
qué corregir. Pedir a un LLM que lea todo el proyecto traslada ese trabajo al
usuario, consume contexto y no produce una decisión reproducible.

**ApiGovScan será un revisor local de cambios de API que analiza el contrato
base y el candidato, combina governance con compatibilidad, entrega evidencia
accionable a una persona o coding agent y permite volver a ejecutar la misma
revisión tras una corrección.** CLI, MCP y CI consumen la misma evaluación
determinista. El análisis no invoca un LLM y no envía contratos a un servicio.

### Diferencial de producto (capacidad verificable)

Un solo flujo local y reproducible conecta **contrato anterior → candidato →
hallazgos de governance y compatibilidad → evidencia y siguiente acción →
revisión repetible por persona/agente → decisión verificable en CI**. El agente
recibe findings estructurados con regla, ubicación, evidencia y recomendación,
en vez de necesitar que el usuario redacte un prompt para descubrir esos
problemas leyendo el proyecto completo. La capacidad se considera entregada
cuando los mismos casos producen la misma revisión en CLI, MCP y CI, sin
invocaciones LLM ni red durante el análisis.

Este spec define el diferencial que ApiGovScan va a ofrecer; no afirma que sus
componentes aislados sean inéditos en el mercado. No se publicitarán ahorros
cuantitativos de tokens/tiempo hasta medirlos con el benchmark de AC-14.10.

## 2. Usuarios y tareas principales

- **Desarrollador/freelancer:** revisar un cambio antes de compartirlo o
  desplegarlo, entender el motivo y corregirlo sin tener que conocer cada guía.
- **Coding agent:** pedir una revisión acotada, actuar sobre evidencia estable y
  volver a pedir la evaluación después de editar. El agente puede omitir MCP;
  CI es el control final cuando se configura como check requerido.
- **Equipo/API platform:** aplicar el mismo pack, configuración y excepciones en
  desarrollo y CI, con salida auditable y ejecución local/on-prem.

## 3. Alcance

### Dentro

- Caso de uso compartido `review(base, candidate)` con una salida canónica
  versionada. Reusa `analyzeUseCase`, `diffSpecs`, findings, skills, políticas,
  fingerprints y reporters; adapters no reimplementan reglas.
- Analizar el candidato con formatos/packs que ya acepta `analyze`.
- La primera entrega del comparador cubre OpenAPI 3.x y Swagger convertido a
  OpenAPI. GraphQL, gRPC, AsyncAPI y webhooks conservan el análisis estático del
  candidato, pero la revisión retorna `error` hasta agregar comparación con
  fixtures que acrediten su semántica.
- Ejecutar comparación base-candidato con las reglas BRK-001…008 donde el
  modelo normalizado represente fielmente la semántica de ambos contratos.
  Capacidad de comparación por formato debe declararse en la respuesta; no
  soportado nunca se presenta como “sin cambios incompatibles”.
- Comando `review <base> <candidate>` para uso local, con formato humano y
  machine-readable. Solo lectura salvo `--output` explícito.
- Tool MCP `review_api_change` que ejecuta el mismo caso de uso en paths
  sandboxed y devuelve findings accionables con truncación explícita. MCP es
  feedback para agentes, no enforcement.
- GitHub Action/CI consumiendo el mismo evaluador sobre el candidato final;
  documentación para configurarlo como required status check.
- Salida que identifica ambos inputs/hash, formatos/comparabilidad, versiones
  del motor/packs/policy, summary, findings ordenados, `reportHash` y estado de
  evaluación. Errores/inputs inválidos/comparación no soportada son estados
  distinguibles y nunca se convierten en `pass`.
- Reporte humano con resumen, cambios incompatibles, hallazgos priorizados,
  archivo/pointer/operación, evidencia y acción recomendada. Mensajes
  explicativos no dependen del color.
- Modo de agente sin LLM: datos estructurados con prioridad, fingerprint,
  ruleId, severity, ubicación, evidencia, sugerencia y fuente cuando exista.
  Cada nueva llamada reanaliza el estado actual; no se reutilizan resultados
  stale.
- Casos y benchmark reproducibles que comparan el flujo de revisión con el
  prompt manual de referencia en tokens de entrada/salida, tiempo y cobertura.

### Fuera de alcance de esta fase

- Hacer que cualquier agente externo llame MCP, obedecer findings o no edite
  después de la revisión; ninguna integración local puede garantizarlo.
- Hooks específicos por runtime, extensión IDE, auto-fix, auto-merge o LLM como
  árbitro de compatibilidad/policy.
- Afirmar impacto en consumidores reales sin inventario/telemetría de uso.
- Captura de tráfico, proxy, catálogo hospedado, portal multi-tenant o subida de
  contratos/reportes/telemetría.
- Análisis de código fuente para inferir contratos cuando no hay spec
  declarada. El análisis de drift existente sigue siendo una feature aparte.
- Soporte semántico de comparación para un formato si no hay fixtures que
  demuestren la interpretación correcta.

## 4. Contrato funcional

### Entrada

```ts
interface ReviewInput {
  baselinePath: string;
  candidatePath: string;
  configPath?: string;
  rulesFiles?: string[];
  failOn?: "error" | "warning" | "info" | "never";
}
```

Ambos paths son obligatorios. El comando no obtiene baseline remoto ni infiere
un baseline permisivo. La resolución de rutas relativas es respecto al cwd del
proyecto. MCP aplica el sandbox ya existente.

### Salida canónica

```ts
interface ApiChangeReviewSuccess {
  schemaVersion: 1;
  outcome: "clean" | "findings";
  baseline: { path: string; sha256: string; format: string };
  candidate: { path: string; sha256: string; format: string };
  comparison: { supported: boolean; reason?: string };
  policy: { failOn: "error" | "warning" | "info" | "never" };
  tool: { version: string; packs: Array<{ id: string; version: string }> };
  summary: { error: number; warning: number; info: number; total: number };
  findings: Finding[];
  reportHash: string;
  errors?: Array<{ code: string; message: string }>;
}

interface ApiChangeReviewError {
  schemaVersion: 1;
  outcome: "error";
  baseline: { path: string; format: string };
  candidate: { path: string; format: string };
  comparison: { supported: false; reason: string };
  errors: Array<{ code: string; message: string }>;
  tool?: { version: string; packs: Array<{ id: string; version: string }> };
  summary?: { error: number; warning: number; info: number; total: number };
  findings?: Finding[];
  reportHash?: string;
}

type ApiChangeReview = ApiChangeReviewSuccess | ApiChangeReviewError;
```

- Error envelopes omiten hash/summary si los inputs no pudieron evaluarse;
  incluyen paths, formatos, código/motivo y nunca representan éxito. Si el
  candidato sí se pudo analizar pero la comparación no está soportada, pueden
  incluir ese análisis y su hash, claramente identificado como parcial.
- `clean` solo significa evaluación exitosa y sin findings visibles tras
  políticas/suppressions. `findings` significa que hay findings. `error`
  significa entrada inválida, evaluación fallida o comparabilidad no
  disponible; nunca se representa como `clean`.
- Los findings estáticos del candidato y los de compatibilidad mantienen su
  `ruleId`, `packId`, ubicación, fingerprint, source y fix, con orden
  determinista. La respuesta identifica los formatos y el estado de
  comparabilidad.
- `failOn` controla únicamente el exit code de CLI/CI, no el contenido del
  resultado. `error` de evaluación produce exit code de error operativo; un
  umbral alcanzado produce exit code de findings.
- MCP informa `totalFindings` y `truncated: true` si limita el payload, e
  incluye `reportHash`; no declara que un resultado truncado sea completo.
- No se emite contenido completo de contratos en logs o errores. Salidas a
  archivos requieren path explícito del usuario.

## 5. Criterios de aceptación

- [x] **AC-14.1** `review` exige dos contratos existentes y distinguibles; parse
      error, archivo ausente, configuración inválida y comparación no soportada
      se informan explícitamente y nunca producen outcome `clean`.
- [x] **AC-14.2** Una revisión ejecuta governance del candidato más
      compatibilidad base-candidato; no duplica checks ni modifica `analyze` o
      `diff` existentes.
- [ ] **AC-14.3** Fixtures por formato documentan y prueban qué comparación se
      soporta; cada BRK aplicable tiene caso positivo y negativo, y los formatos
      no comparables se reportan sin éxito-shaped fallback.
- [x] **AC-14.4** Mismo par, configuración, skills y versiones ⇒ mismos
      findings ordenados, fingerprints y `reportHash` (INV-2).
- [x] **AC-14.5** La salida humana permite entender cada finding, ubicación,
      evidencia, causa y siguiente acción sin depender solo de color.
- [x] **AC-14.6** JSON contiene ambos hashes/formatos, versiones, policy/packs,
      comparabilidad, resumen y findings, con schema versionado.
- [x] **AC-14.7** `review_api_change` MCP acepta solo paths dentro del sandbox,
      ejecuta el mismo evaluador que CLI y declara truncación/total/hash.
- [x] **AC-14.8** MCP/CLI reevalúan al invocarse; nunca informan resultado
      anterior como vigente. No escriben salvo salida explícita.
- [x] **AC-14.9** La Action/CI usa el mismo evaluador sobre el candidato final,
      y la documentación diferencia el check publicado de configurarlo como
      required.
- [ ] **AC-14.10** El benchmark versionado compara revisión con y sin contexto
      ApiGovScan, registra token-count del modelo de referencia, tiempo,
      findings detectados y falsos positivos; no se promete porcentaje de ahorro
      sin resultados del benchmark. La revisión normal no llama LLM ni hace red.
- [x] **AC-14.11** Privacidad: tests verifican que paths/logs/errores no
      imprimen bodies ni ejemplos completos; solo evidencia mínima, pointers,
      ruleIds y fingerprints (INV-1/7).
- [x] **AC-14.12** Invariantes INV-1/2/3/4/5/7 y `pnpm check` pasan; no hay
      regresiones en `analyze`, `diff`, MCP existente ni Action.

## 6. Plan de pruebas

- Unitarias del caso de uso: outcome, agregación, orden/fingerprint, hashes,
  comparabilidad y errores.
- Fixtures e2e de cambio sin hallazgos, governance finding, breaking finding,
  combinación de ambos, iguales, malformados y formato no comparable.
- Paridad e2e CLI ↔ MCP ↔ Action en findings, summary, outcome y hashes
  ignorando únicamente metadata de duración específica del adapter.
- Pruebas de sandbox, truncación, privacidad de logs, no-red y no-LLM.
- Benchmark de corpus versionado; registrar baseline de tokens y tiempo antes
  de afirmar ahorro.

## 7. Secuencia de entrega

1. M14.1: contrato tipado + evaluador compartido + CLI y reporter.
2. M14.2: tool MCP sandboxed y paridad con CLI para agentes.
3. M14.3: Action/CI y documentación de check requerido.
4. M14.4: affordances de UX para evidencia, policies, suppressions y siguientes
   acciones, sin ampliar silenciosamente su alcance.
5. M14.5: corpus y benchmark de eficacia/consumo; cerrar límites por formato.

La validación externa de usabilidad y las afirmaciones de mercado se hacen
antes de una comunicación de lanzamiento; no bloquean construir el producto.

## 8. Dependencias y decisiones cerradas

- Reusar `f12-breaking` y su modelo `Finding`; no crear un motor paralelo ni un
  segundo esquema de reglas.
- Reusar `analyzeUseCase`, configuración, skills, packs, reporters y licencia
  siguiendo el comportamiento actual de cada edición.
- La implementación documenta comparabilidad por protocolo; la capacidad no
  demostrada queda explícitamente no soportada, no inferida como limpia.
- El análisis normal es offline/local, determinista, sin LLM; las funciones
  LLM existentes son opt-in y no forman parte de `review`.
- No se requiere entrevista como precondición para empezar implementación.

## Changelog

- 2026-09-30 · La antigua propuesta de gate de agentes se amplía, por decisión
  del producto, al flujo completo de revisión local para personas y agentes.
  Se define alcance listo para implementar; gate CI es una superficie del
  producto, no el producto entero.
- 2026-09-30 · M14.1 iniciado: `review <base> <candidate>` entrega revisión
  combinada console/JSON para OpenAPI/Swagger; otros protocolos incluyen
  análisis estático del candidato y declaran comparación no soportada.
- 2026-09-30 · M14.1 cerrado: evaluador compartido `reviewUseCase` + tipos
  `ApiChangeReview` (packages/cli/src/review.ts); el CLI consume el mismo
  evaluador sin sub-comandos ni roundtrips JSON, listo para MCP (M14.2).
- 2026-09-30 · M14.2 implementado: tool MCP `review_api_change` sandboxed con
  truncación declarada (`totalFindings`/`truncated`/`reportHash`), findings
  proyectados accionables y paridad CLI↔MCP verificada por tests (AC-14.7/14.8).
- 2026-09-30 · M14.3 implementado: Action en modo review vía input `review-ref`
  (step `review-base` extrae el contrato base con `git fetch`+`git show`; artifact
  JSON + gate console consumen `apigovscan review` sobre el checkout candidato),
  dogfood con job `apigovscan-review`, tests de paridad/failure modes/determinismo
  y documentación del required status check con límites de bypass/admin (AC-14.9).
- 2026-09-30 · M14.4 implementado: visibilidad de suppressions en review
  (`summary.skillsSuppressed` unifica candidato+diff, warnings de waivers
  expirados/huérfanos a stderr), tests de scoping (una supresión no oculta
  hallazgos adyacentes) y de mensajes distinguibles clean/findings/unsupported/
  error. Fix de privacidad central: los errores de parse YAML ya no citan el
  snippet del contrato (AC-14.11, INV-7; aplica a analyze/diff/review).
