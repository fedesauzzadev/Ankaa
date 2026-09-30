# Tasks · decisiones estratégicas F8

Specs en draft: [Spectral](../specs/f8-spectral-import.md) ·
[certify](../specs/f8-certify.md) ·
[FP budget](../specs/f8-fp-budget.md).

## Antes de implementar

- [ ] Acordar versión y subconjunto transliterable del ruleset, mapping por función/átomo y esquema de resultados omitidos (AC de `f8-spectral-import`).
- [ ] Nombrar productor/verificador y canal de confianza; decidir hash vs firma, formato y custodia de claves (AC de `f8-certify`).
- [ ] Acordar qué feedback compone el numerador/denominador, mínimo de muestra, ventana/umbral y respuesta no-mutante (AC de `f8-fp-budget`).
- [ ] Convertir cada spec a `ready` y crear plan/tests antes de implementar.
- [ ] Validar comprensión/usabilidad con usuarios antes de comunicar el
      producto; esto no bloquea la implementación de M14
      ([`f14-agent-api-gate`](../tasks/f14-agent-api-gate.md)).
