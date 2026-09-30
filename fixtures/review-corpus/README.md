# Review corpus (f14 · M14.5)

Corpus determinista de pares baseline/candidate para `apigovscan review`. Es la
fuente de verdad de **qué comparación base-candidato se soporta por formato** y
del benchmark de eficacia/consumo (AC-14.3 / AC-14.10).

## Estructura

- `manifest.json` — tabla de casos: `id`, `format`, `comparable`, `baseline`,
  `candidate` (relativos a este directorio) y `expectDiffRuleIds` (ground truth
  de los hallazgos BRK que el diff **debe** producir; conjunto exacto).
- `openapi/` — contrato base + un caso positivo por regla `BRK-001…008` +
  `no-breaking-changes.yaml` (caso negativo: solo cambios aditivos → cero BRK).
  El negativo cubre a todos: nada se elimina, los params/propiedades nuevos son
  opcionales, el enum solo agrega valores y no se agrega auth.
- `swagger/` — par 2.0 comparable tras conversión (cambio aditivo → cero BRK).
- `graphql/`, `grpc/`, `asyncapi/`, `webhooks/` — pares **no comparables**:
  `review` debe retornar `outcome: "error"` con `comparison.supported: false`
  y el análisis estático del candidato, nunca un resultado con forma de éxito.

## Reglas del corpus

- Los fixtures son **estables**: no editarlos sin actualizar el manifest y los
  resultados versionados del benchmark (`docs/benchmarks/`).
- Cada caso positivo dispara **exactamente** su BRK (validado por
  `packages/cli/test/review-corpus.test.ts`); cualquier BRK extra es un bug del
  fixture o del engine y rompe el test.
- Nada de datos sensibles: contenido sintético únicamente.

## Benchmark

```bash
pnpm build
node scripts/review-benchmark.mjs --out docs/benchmarks/review-benchmark.json
```

Compara la revisión **con** el paquete de contexto ApiGovScan (JSON canónico de
`review`) contra la alternativa **sin** contexto (prompt de referencia + ambos
contratos completos), con token-count aproximado chars/4 — sin LLM, sin red.
Resultados medidos y límites soportados: `docs/benchmarks/`. No se publican
porcentajes de ahorro sin resultados medidos con un modelo real.
