# Plan · f14-agent-api-review

Spec: [f14-agent-api-review](../specs/f14-agent-api-gate.md)

## Orden de construcción

1. **M14.1 — Evaluador compartido + CLI:** agregar un caso de uso tipado
   `review(base, candidate)`, consolidar governance del candidato y
   compatibilidad, y exponer salida humana/JSON con errores explícitos.
2. **M14.2 — MCP para agentes:** agregar `review_api_change` sandboxed sobre el
   mismo caso de uso; respuesta accionable, estable y con truncación declarada.
3. **M14.3 — CI/Action:** reusar el evaluador contra el candidato final,
   publicar resultado y documentar cómo volverlo required status check.
4. **M14.4 — Calidad de la revisión:** experiencia de evidencia, reglas,
   suppressions y siguiente acción; afinar ruido sin cambiar silenciosamente
   políticas.
5. **M14.5 — Medición y cierre:** corpus por formato, paridad entre adapters,
   benchmark de tokens/tiempo y documentación de capacidades/límites.

## Definition of Done

- Todos los adapters llaman el mismo evaluador y coinciden en hallazgos y
  outcome.
- Inputs inválidos, formatos no comparables y errores no se presentan como
  éxito.
- El análisis es local, determinista y no llama LLM por defecto.
- Findings dan evidencia y siguiente acción para personas y agentes.
- Benchmark reproducible sustenta cualquier claim de ahorro de tokens/tiempo.
- Cada milestone cubre AC relevantes, pruebas, invariantes y documentación;
  `pnpm check` pasa.
