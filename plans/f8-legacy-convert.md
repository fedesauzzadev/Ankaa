# Plan · f8-legacy-convert · Swagger 1.x/2.0 → Spec (legacy REST)

| Campo        | Valor                                                          |
| ------------ | -------------------------------------------------------------- |
| Specs        | f8-legacy-convert                                              |
| Dependencias | `f1-openapi` (parser base); `yaml` existente; cero deps nuevas |

## M8.10 — Conversor best-effort en `packages/openapi`

1. `packages/openapi/src/legacy.ts` (puro): `isSwagger2(doc)` + `isSwagger1(doc)` + `convertSwagger2(doc)` + `convertSwagger1(doc)` → `{ spec parcial, dropped[] }`; refs en `parse.ts` (detección antes del gate 3.x, warning `SWAGGER_CONVERTED` con tope).
2. `fixtures/swagger1-minimal.yaml` (nuevo) + reutilizar `swagger2-minimal.yaml`; ataque `attack/swagger-remote-ref.yaml` si falta.
3. CLI: `discovery.ts` (`swagger.*` + `**/swagger.*` + `DISCOVERY_PATTERNS`) + retirar `SWAGGER_20` como error (ahora es convertido).
4. Tests: unit `packages/openapi/test/legacy.test.ts` + e2e `packages/cli/test/swagger-analyze.e2e.test.ts` + regresión 3.x + boundary/INV.
5. README (sumar legacy) + índices. Sin cambios de contrato ajeno (mismo `Spec`, pack `elite`).
6. `pnpm check` verde → spec `cerrada`.

**DoD:** AC-LG.1—7 verdes; suites 3.x intactas.

## Notas para el agente

- Commits sin comillas dobles embebidas (quirk PowerShell).
- `pnpm build` tras tocar `packages/*/src`.
- Warning con tope: no meter arrays gigantes en el mensaje (determinismo + snapshot).
- Ante la duda, dropear con pérdida listada antes que inventar dato.

## Changelog del plan

- 2026-09-28 · Plan inicial (handoff).
