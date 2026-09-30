# Review benchmark · 2026-09 (f14 · M14.5)

Resultado versionado del benchmark de revisión. Fuente: corpus determinista
[`fixtures/review-corpus/`](../../fixtures/review-corpus/README.md) (15 casos:
10 OpenAPI + 1 realista + 1 Swagger comparables; GraphQL/gRPC/AsyncAPI/webhooks
no comparables). Reproducible con:

```bash
pnpm build
node scripts/review-benchmark.mjs --out docs/benchmarks/review-benchmark.json
```

## Metodología

- **Sin contexto ApiGovScan (ruta "raw")**: prompt de referencia + contrato base
  completo + contrato candidato completo — lo que un usuario pegaría a un LLM.
- **Con contexto ApiGovScan (full)**: JSON canónico completo de
  `apigovscan review` (findings con mensaje/fix/fuente).
- **Con contexto ApiGovScan (truncated)**: el payload que consume realmente un
  agente vía MCP `review_api_change` (top 20 findings, `totalFindings`/`truncated`
  declarados).
- Token-count **aproximado chars/4**; no se invoca ningún modelo ni hay red
  (INV-1/INV-3). Tiempos por caso en el JSON (dependen de la máquina).

## Resultados medidos

| Caso                                | full ctx | trunc ctx | raw (A+B+prompt) |
| ----------------------------------- | -------: | --------: | ---------------: |
| openapi-brk-001 … brk-008 (sintético, ~1 KB/contrato) | 1348–2022 | 1357–2031 | 1062–1256 |
| openapi-no-breaking-changes         |     2555 |      2564 |             1485 |
| **openapi-realistic-petstore (17 KB)** | **27081** |    **3402** |         **8695** |
| swagger-additive-operation          |     1867 |      1877 |              468 |
| graphql / grpc / asyncapi / webhooks | 569–1523 |  578–1532 |       616–1325 |

Totales: full context 50029 · truncated context 26480 · raw 24258 tokens.

Detección del engine contra el ground truth del corpus: **esperados 9 ·
detectados 9 · perdidos 0 · inesperados 0** (cada caso positivo dispara
exactamente su BRK; los negativos y aditivos no disparan ninguno).

## Lectura honesta (sin claims)

- **Specs chicas**: pegar los dos contratos crudos ocupa menos tokens de
  entrada que el paquete de findings completo. No hay ahorro de tokens en ese
  régimen.
- **Contrato de tamaño real** (Petstore 3.0, 17 KB): el payload que consume el
  agente (truncado, 3402 tokens) es ~2.5x menor que la ruta raw (8695), y no
  crece con el tamaño del contrato sino con la cantidad de findings.
- El diferencial verificable hoy no es ahorro de tokens sino: **detección
  determinista y reproducible** (9/9 contra ground truth; la ruta raw sin
  ApiGovScan no tiene tasa de detección medida — medirla requiere correr un
  modelo real, fuera del alcance offline), cobertura declarada por formato,
  fingerprints estables y paridad CLI ↔ MCP ↔ CI.
- **No se publica porcentaje de ahorro** de tokens/tiempo sin resultados
  medidos con un modelo de referencia.

## Límites soportados (matriz de comparación base-candidato)

| Formato   | Comparación | Estado                                       |
| --------- | ----------- | -------------------------------------------- |
| OpenAPI 3.x | ✅ sí     | BRK-001…008 (positivo+negativo por regla)    |
| Swagger 2.0 | ✅ sí     | tras conversión (best-effort + warning)      |
| GraphQL   | ❌ no       | análisis estático del candidato + error explícito |
| gRPC      | ❌ no       | ídem                                         |
| AsyncAPI  | ❌ no       | ídem                                         |
| Webhooks  | ❌ no       | ídem                                         |

"No soportado" nunca se presenta como "sin cambios incompatibles": el review
retorna `outcome: "error"` con `comparison.supported: false` y exit code 2.
