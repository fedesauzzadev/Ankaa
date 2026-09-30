# Descubrimiento de producto y backlog estratégico · 2026-09-30

## Resumen ejecutivo

La oportunidad no es sumar reglas por sumar. Linting configurable, rulesets y CI
ya son capacidades conocidas en Spectral, Redocly, Vacuum y Postman. ApiGovScan
ya tiene una base amplia: ejecución local, varios formatos de API, reglas
curadas, diff de contratos, análisis repo/org, GitHub Action, MCP, coverage,
dashboard y feedback versionado.

La decisión de producto adoptada es construir un **revisor local de cambios de
API para personas y coding agents**. Evaluará el contrato base y el candidato,
combinará governance con compatibilidad, explicará la evidencia y permitirá
repetir la misma revisión después de corregir. CLI y MCP entregan feedback en
desarrollo; CI usa el mismo evaluador y puede ser el control de merge si se
configura como check requerido. El gate es una capacidad del producto, no el
producto entero.

Una segunda apuesta a validar es contrastar contratos con **artefactos de
tráfico entregados explícitamente por el usuario**. Puede detectar diferencias
entre la spec y el comportamiento observado, pero no es una categoría vacía:
Redocly y Akto ya documentan flujos de tráfico/inventario. Debe competir por
mejor privacidad, repetibilidad y facilidad de adopción, no por afirmar que la
idea es nueva.

### Qué sabemos y qué no

- Esto es **desk research** con documentación de productos y reportes públicos
  de usuarios consultados el 2026-09-30. No hicimos entrevistas propias ni una
  encuesta representativa; las discusiones públicas son evidencia cualitativa,
  no estimaciones de prevalencia o disposición a pagar.
- La señal más concreta de dolor es la precisión y el alcance de los
  falsos positivos/excepciones. Hay reportes técnicos reproducibles y pedidos
  de exclusión por operación; todavía hace falta validar si esos dolores se
  mantienen en equipos objetivo y si ApiGovScan los resuelve mejor.
- Breaking changes y drift son importantes, pero ya hay herramientas y
  productos que los abordan. No deben presentarse como diferenciadores únicos.
- La evidencia de compra, ownership organizacional y demanda específica por
  local-first es débil en esta muestra. La privacidad sigue siendo un atributo
  de producto respaldado por nuestro SDD, no una demanda de mercado demostrada.

## Tesis de producto

> **Un revisor local de cambios de APIs que reúne governance y compatibilidad
> en una evaluación reproducible, presenta evidencia accionable a personas y
> agentes, y permite verificar el mismo resultado en CI.**

El diferencial que se construye es **el flujo completo local y determinista**:
contrato anterior → candidato → governance y compatibilidad → evidencia y
siguiente acción → re-evaluación por persona/agente → resultado verificable en
CI. No presentamos como inéditos los componentes aislados (lint, diff, CI,
MCP); el valor está en entregarles un único resultado accionable al usuario y
al agente, sin análisis LLM por defecto. Los ahorros cuantitativos de tokens o
tiempo se comunicarán únicamente con benchmark reproducible.

## Evidencia de mercado

| Producto/fuente                                                                                                                                                                                                                                                          | Lo documentado                                                                                                                                                                                                                                   | Implicación para ApiGovScan                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Spectral](https://github.com/stoplightio/spectral) y [Stoplight governance](https://stoplight.io/api-governance)                                                                                                                                                        | Rulesets, reglas extensibles, CLI/editor/CI y guías compartidas por equipos. Consultado 2026-09-30.                                                                                                                                              | Reglas, CI y personalización son baseline de categoría, no diferencial suficiente.                                                                                |
| [Redocly lint](https://redocly.com/docs/cli/commands/lint), [drift](https://redocly.com/docs/cli/commands/drift) y [proxy](https://redocly.com/docs/cli/commands/proxy)                                                                                                  | CLI de lint configurable; drift entre tráfico registrado y OpenAPI; captura/validación de tráfico vía proxy. Drift y proxy están marcados experimentales en la documentación consultada. Consultado 2026-09-30.                                  | Tráfico observado es una posibilidad, pero ya tiene precedentes; investigar ergonomía y privacidad concretas.                                                     |
| [Vacuum](https://github.com/daveshanley/vacuum) y [comando lint](https://quobix.com/vacuum/commands/lint/)                                                                                                                                                               | CLI local para OpenAPI, AsyncAPI y JSON Schema; soporte de rulesets y severidad de fallo para CI. El README documenta un update check configurable. Consultado 2026-09-30.                                                                       | La amplitud de formatos y ejecución local también aparece en el ecosistema; describir con precisión qué red usa cada comando.                                     |
| [Postman governance](https://learning.postman.com/docs/api-governance/api-governance-overview.md), [CLI](https://learning.postman.com/docs/postman-cli/postman-cli-governance.md), [reports](https://learning.postman.com/docs/api-catalog/governance-groups/reports.md) | Reglas de governance, checks CI, conformidad por grupos y reportes con severidad, workspaces y tendencias. El flujo de CLI usa login/recuperación de reglas; sus documentos explican qué ocurre si estas no se recuperan. Consultado 2026-09-30. | Equipo/portfolio y tendencias importan como experiencia de producto. Podemos explorar resumen local reproducible, sin pretender igualar el catálogo centralizado. |
| [Optic](https://github.com/opticdev/optic) y [anuncio de Atlassian](https://www.atlassian.com/blog/company-news/optic-acquisition)                                                                                                                                       | Históricamente documentó generar/actualizar OpenAPI desde tráfico, breaking changes, notificaciones y calidad. El repositorio indica archivo el 2026-01-12.                                                                                      | Compatibilidad y consumer impact no son ideas nuevas; el estado standalone futuro no se infiere del archivo del repo.                                             |
| [Akto: inventario](https://docs.akto.io/api-inventory/concepts/api-endpoints.md), [shadow APIs](https://docs.akto.io/api-inventory/concepts/shadow-apis.md), [CI tests](https://docs.akto.io/integrations/ci-cd-integrations/how-to/run-tests-in-cicd.md)                | Documenta inventario y seguridad basados en tráfico, APIs shadow/zombie y tests CI conectados a dashboard/configuración. Consultado 2026-09-30.                                                                                                  | Evidencia de workflows adyacentes de runtime/inventario, usualmente más amplios que una CLI de contratos.                                                         |
| [42Crunch](https://42crunch.com/api-runtime-protection.html)                                                                                                                                                                                                             | Posiciona seguridad de contratos y protección runtime, con alternativas de despliegue privado según su documentación comercial. Consultado 2026-09-30.                                                                                           | Seguridad runtime es una categoría adyacente; no somos aún un proxy, gateway o scanner de comportamiento.                                                         |

Los claims de capacidades de esta tabla son descripciones de sus propios
proveedores, no una evaluación independiente de calidad o eficacia. No se
estableció precio público comparable para varios planes empresariales.

### Cómo se aplica esto a coding agents

- El estándar [MCP Tools (2025-11-25)](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)
  describe tools controlados por el modelo: sirven para feedback/contexto, pero
  la mera disponibilidad no obliga a llamarlos.
- [Claude Code hooks](https://code.claude.com/docs/en/hooks) documenta eventos
  `PreToolUse` que pueden bloquear una tool en ese entorno. [Cursor hooks](https://cursor.com/docs/hooks)
  ofrece hooks de edición/herramienta con límites según la modalidad del agente.
  Son controles locales específicos, no una garantía universal ni una
  comprobación del commit final.
- [GitHub protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
  permite requerir checks antes del merge. Esa es la frontera general más
  fuerte, siempre que el dueño configure el check como required y atienda
  bypass/admin settings; crear o publicar un check no equivale a requerirlo.
- Conclusión de diseño: **MCP y hooks = feedback temprano; CI sobre el SHA
  final + branch rules = enforcement de merge**. No existe un protocolo único
  que haga a cualquier agente obedecer el scanner. Estas páginas se consultaron
  el 2026-09-30; no se observó fecha de publicación visible en todas ellas.

## Evidencia de dolor de usuarios

Las siguientes fuentes son reportes/comentarios individuales: sirven para
formular hipótesis, no para asegurar que un porcentaje de usuarios tiene el
problema.

| Fuente                                                                                                                                                                             | Señal reportada                                                                                                                                                 | Confianza/alcance                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| [Vacuum #975](https://github.com/daveshanley/vacuum/issues/975), 2026-09-21                                                                                                        | El reporte presenta un falso positivo de `oas-missing-type` para `propertyNames` y el costo de repetir ignores literales.                                       | Caso técnico reproducible; muestra de un issue.                                                       |
| [Spectral #1558](https://github.com/stoplightio/spectral/issues/1558), 2021-03-25                                                                                                  | El usuario pide excluir una operación de una regla, sin desactivarla para todo el spec.                                                                         | Pedido directo; la fecha limita su valor para afirmar estado actual.                                  |
| [Spectral #2457](https://github.com/stoplightio/spectral/issues/2457), 2023-04-18                                                                                                  | El usuario busca suprimir una infracción puntual y luego confirma que overrides resolvieron el caso.                                                            | Señal de ergonomía/descubribilidad; evidencia también de una solución existente.                      |
| [Spectral #2334](https://github.com/stoplightio/spectral/issues/2334), 2022-11-09                                                                                                  | El autor describe overrides que no acotan el error como esperaba y una desactivación amplia que considera riesgosa.                                             | Señal concreta del peligro de waiver demasiado amplio.                                                |
| [HN: LintGPT](https://news.ycombinator.com/item?id=38012614), 2023-10-25                                                                                                           | Comentario de un fundador de herramienta sobre dificultad de expresar reglas de diseño abstractas y costo de procesar specs grandes.                            | Anecdótico y con interés comercial; no es medida independiente.                                       |
| [Stack Overflow: compatibilidad de OpenAPI](https://stackoverflow.com/questions/76857742/spring-boot-java-check-backward-compatibility-of-two-given-apis-by-comparing), 2023-08-08 | Pregunta cómo comparar contratos anterior/nuevo sin endpoint vivo e integrar la comprobación al workflow.                                                       | Señal de tarea de usuario; el ecosistema pudo cambiar desde la pregunta.                              |
| [HN: API Impact Tracker](https://news.ycombinator.com/item?id=46579637), 2026-01-11                                                                                                | El autor cuenta que cambios de API rompían clientes y que los avisos llegaban horas después.                                                                    | Experiencia promocional anecdótica, no postmortem representativo.                                     |
| [HN: mocks y contract testing](https://news.ycombinator.com/item?id=46377466), 2025-12-24                                                                                          | Un comentarista relata investigar un incidente causado por un mock desactualizado.                                                                              | Un caso anecdótico, no prevalencia.                                                                   |
| [HN: varios codebases](https://news.ycombinator.com/item?id=47441839), 2026-03-19                                                                                                  | Un desarrollador describe el valor de un spec central para no dejar dependencias entre servicios “en la cabeza” del equipo y detectar incompatibilidades en CI. | Experiencia individual positiva, no una brecha de ownership universal.                                |
| [HN: tipos compartidos y OpenAPI](https://news.ycombinator.com/item?id=33221395), 2022-10-16                                                                                       | Un usuario cuenta que generar OpenAPI de los mismos tipos de request/response evita drift para su equipo.                                                       | Contraejemplo valioso: el problema puede resolverse mejor en algunos stacks desde la fuente de tipos. |

No hubo evidencia suficiente en esta muestra para universalizar fricción de CI,
onboarding, ownership o demanda por ejecución local. Reddit no fue utilizable
en esta consulta; no se extrapoló de resultados inaccesibles.

## Backlog priorizado

Las prioridades expresan ajuste estratégico y riesgo de validación, no
estimación de mercado. Antes de desarrollo, cada apuesta debe validar una tarea
real con usuarios y medir una métrica de adopción/eficacia.

| Prioridad                       | Apuesta                                                              | Problema y fundamento                                                                                                                                                                                            | Próxima evidencia/resultado                                                                                                                           |
| ------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P0 · en ejecución**           | **API Change Reviewer local para personas y agentes**                | Unifica el análisis del candidato, los cambios incompatibles y la evidencia útil en una salida compartida; evita pedir al agente que descubra por sí solo los problemas leyendo contexto amplio.                 | Spec `f14-agent-api-gate.md` en `ready`; construir evaluador CLI, MCP y CI sobre el mismo resultado. Medir tokens/tiempo antes de anunciar ahorro.    |
| **P1 · UX/calidad transversal** | Feedback verificable y excepciones estrechas, con preview de impacto | Issues reportan falsos positivos y supresiones demasiado amplias; ApiGovScan ya tiene suppressions/waivers, por lo que la oportunidad es hacerlos entendibles, predecibles y fáciles de revisar, no duplicarlos. | Test de usabilidad: entender un finding, ver ejemplos/evidencia, simular waiver, inspeccionar alcance y expiración sin ocultar resultados adyacentes. |
| **P2 · validar después**        | Contrato vs artefacto de tráfico aportado localmente                 | Detectar endpoints no declarados, spec obsoleta y divergencia observada complementa drift spec↔código. Redocly/Akto muestran competencia adyacente.                                                              | Probar con HAR/capturas sanitizadas suministradas por usuario; nada de llamadas implícitas ni afirmaciones de “consumidores afectados” sin evidencia. |
| **P2**                          | Conformance portfolio local + ownership mínimo versionado            | Postman muestra reportes centralizados y tendencias; nuestra versión debe aprovechar `scan-org`, mappings y score sin convertirse en SaaS/API catalog.                                                           | Validar si `owner`, repositorio y excepción dentro de metadata versionada resuelven handoff; prototipo de reporte offline multi-repo.                 |
| **P3**                          | Import limitado de Spectral y mini-validador de ejemplos             | Extiende cobertura, pero tiene alcance/tamaño de implementación y no diferencia por sí solo; ambas specs continúan en draft.                                                                                     | Completar subset/benchmark/ruido con corpus real antes de marcar spec `ready`.                                                                        |
| **P3 · habilitador**            | Binario autónomo, instalación y docs auditables de privacidad        | Quitar la instalación visible de Node podría mejorar onboarding, pero no es el diferencial central y requiere validar usuarios/targets.                                                                          | Spike de empaquetado cross-platform y prueba de instalación; conservar Node como toolchain salvo evidencia contraria.                                 |

### Orden recomendado

1. Construir el evaluador compartido y la revisión local CLI de base contra
   candidato (M14.1); la primera superficie ya está iniciada.
2. Entregar la misma revisión a coding agents por MCP, con evidencia compacta,
   hash y truncación explícita (M14.2).
3. Integrar CI/Action sobre el candidato final y documentar el required check
   (M14.3). El equipo configura branch protection; ApiGovScan no lo cambia.
4. Mejorar claridad de findings, policies y suppressions con casos concretos
   (M14.4), sin depender de hooks ni LLM.
5. Medir calidad, tiempo y tokens con corpus versionado (M14.5); ampliar
   comparación a formatos adicionales cuando fixtures demuestren semántica.

## Criterios de UX para el revisor de cambios

- **Decisión visible y no ambigua:** `pass`, `warn`, `block`, `invalid input` y
  `evaluation error` tienen mensajes/códigos distintos. Ningún input faltante,
  scan omitido o fallo de runtime puede parecer un pass.
- **Evidencia junto a la decisión:** regla/compatibilidad, severity, operación,
  JSON Pointer, old→new y motivo; separar “potencialmente incompatible” de
  “consumidor real afectado”.
- **Acción siguiente concreta:** sugerencia breve, `explain`/fix como draft,
  propietario si está configurado y camino de excepción; nunca autoeditar el
  spec ni aceptar salida del LLM como árbitro.
- **Sin sorpresas:** preview de resultados antes de activar bloqueos, baseline
  y versión de políticas visibles, diff del número/tipo de findings frente al
  run anterior.
- **Consistencia de interfaces:** la misma semántica y códigos de decisión en
  CLI, JSON/SARIF, Action y MCP; textos humanos adaptados por superficie.
- **Privacidad y accesibilidad:** no sacar bodies/specs en logs, pointers/rule
  IDs suficientes para diagnosticar, accesible por teclado/lectores y no
  depender solo del color para `pass/warn/block`.
- **Frescura y confianza:** cada resultado identifica el commit/tree evaluado,
  baseline y versiones de CLI/packs/policy. Cambiar el working tree invalida
  cualquier resultado local previo.
- **Excepciones legibles:** mostrar el scope efectivo, motivo, autor/responsable
  si existe y vencimiento; alertar waiver huérfano/expirado, no ocultarlo.

## Validación de usabilidad antes de comunicar el producto

**Muestra cualitativa propuesta:** 8–12 personas en al menos 4 equipos:
responsables de API/platform, mantenedores de API consumer/provider, CI owners
y desarrolladores que usan coding agents. No confundirla con representación
estadística. Esta validación comprueba comprensión y utilidad antes de
comunicar el producto; no bloquea la implementación. Pedir a cada persona que
recorra un caso reciente con artefactos anonimizados; no pedir documentación
sensible.

Preguntas:

1. Contame del último cambio de contrato que llegó a producción/PR. ¿Qué lo
   detectó, cuándo y quién tuvo que actuar?
2. ¿Cómo deciden si un cambio es breaking? ¿Qué baseline comparan y quién lo
   mantiene?
3. Mostrame la última regla/finding que ignoraste o discutiste. ¿Qué evidencia
   necesitabas y cómo limitaste la excepción?
4. ¿Qué ocurre cuando la spec falta o no está sincronizada con código/tráfico?
5. ¿Un agente de código ya creó o modificó APIs? ¿Qué riesgo querías controlar
   y en qué momento habría servido la revisión?
6. ¿Qué check podría bloquear merge de verdad? ¿Quién configura branch
   protection/bypass y cómo se maneja una excepción urgente?
7. ¿Qué no puede salir del equipo? ¿Aceptan HAR/metadata locales? ¿Qué campos
   requerirían redactar o eliminar?
8. ¿Qué herramienta existente resuelve parte del flujo? ¿Qué costo de
   configuración o información duplicada les molesta?
9. Probar prototipo: explicar un finding, previsualizar una policy, entender
   pass/block/error, responder a cambio de base o policy, crear waiver acotado.
10. ¿Qué evidencia concreta haría que lo instalen y lo mantengan activo?

Registrar rol/contexto (sin identificar persona), último evento real, workaround,
costo, frecuencia aproximada y cita aprobada. Separar “lo vi hacer” de “me
gustaría”. No convertir opiniones hipotéticas en compromiso de compra.

**Señal de avance propuesta (a acordar):** al menos 5 de 8 participantes
identifican sin sugerencia un problema reciente de cambios de contrato o
findings/excepciones; al menos 3 prueban el revisor de cambios sobre un artefacto real y pueden
explicar el resultado; y al menos 2 equipos acuerdan un piloto con PRs no
sensibles. Si no se alcanza, revisar la tesis y no expandir a tráfico/hooks.
Estos umbrales son una herramienta interna de decisión, no benchmark estadístico.

## Fuentes y límites

Todas las páginas web listadas se consultaron el **2026-09-30**, salvo fechas
propias explícitas de issues/posts. Algunas páginas de proveedores carecen de
fecha de publicación visible y pueden cambiar. Los detalles y links permanecen
junto al hallazgo para poder revalidarlos. Esta revisión no es un análisis
exhaustivo de todos los productos, patentes, contratos, precios o reseñas ni
sustituye entrevistas, prueba de mercado o due diligence de seguridad/legal.
