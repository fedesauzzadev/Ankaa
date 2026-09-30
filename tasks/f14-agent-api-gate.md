# Tasks · f14-agent-api-review

Spec: [f14-agent-api-review](../specs/f14-agent-api-gate.md) ·
Plan: [f14-agent-api-review](../plans/f14-agent-api-gate.md)

## M14.1 — Evaluador compartido + CLI

- [ ] Definir tipos y builder de `ApiChangeReview` reutilizando `Report`/`Finding`.
- [ ] Extraer/compartir el pipeline de parse, analyze-candidate y diff sin
      duplicar semántica de `analyze` o `diff`.
- [x] Formalizar con fixtures qué formatos soportan comparación base-candidato;
      devolver `comparison.supported: false` explícito en los demás.
- [x] Implementar `review <base> <candidate>` y salida console/JSON determinista
      para OpenAPI/Swagger.
- [x] Cubrir par idéntico, findings de governance + breaking, formato no
      comparable, input faltante y estabilidad de `reportHash`.
- [x] Actualizar help y docs de CLI con ejemplos de revisión local.

## M14.2 — MCP para agentes

- [ ] Añadir `review_api_change` con ambos paths dentro del sandbox.
- [ ] Reutilizar el evaluador CLI; proyectar findings accionables con
      fingerprint, regla, ubicación, evidencia, recomendación y source.
- [ ] Añadir truncación explícita (`totalFindings`, `truncated`, `reportHash`) y
      pruebas de path escape, error y paridad CLI.
- [ ] Documentar que MCP da feedback; cada invocación revisa el estado actual y
      el agente puede omitirlo.

## M14.3 — CI/Action

- [ ] Integrar Action con el evaluador común sobre el SHA candidato final.
- [ ] Publicar check y summary estables sin divulgar cuerpos de contratos.
- [ ] Probar failure modes, re-runs y permisos; documentar configuración del
      required status check y límites de bypass/admin.

## M14.4 — Calidad de uso

- [ ] Revisar ejemplos de findings para que expliquen evidencia y siguiente
      acción en lenguaje claro, sin depender del color.
- [ ] Mejorar visibilidad del alcance/motivo de suppressions existentes y
      comprobar que no oculten hallazgos adyacentes.
- [ ] Probar mensajes para limpio, findings, no comparable y error; ninguno
      debe confundirse con otro estado.

## M14.5 — Evidencia y cierre

- [ ] Añadir corpus determinista de contratos por formato y caso de cambio.
- [ ] Construir benchmark repetible de revisión con/sin paquete de contexto:
      tokens, tiempo, detección y falsos positivos.
- [ ] Publicar límites soportados y resultados medidos; no incluir claims de
      ahorro sin evidencia.
- [ ] Ejecutar `pnpm check` y cerrar AC/documentación del release.
