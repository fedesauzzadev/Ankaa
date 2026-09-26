# Plan · f8-rules-import · Guideline → reglas (M8.2)

| Campo | Valor |
|---|---|
| Specs | f8-rules-import |
| Dependencias | f8-suggest-fix cerrado (llm.ts, stub, gates) |

## M8.2 — Extracción + prompt + validación + salida

1. `packages/cli/src/rules-import.ts`: extractText (md/txt/yaml plano), chunkGuideline, parseRulesEnvelope, buildImportMessages (chunk redactado), serializeRulesDrafts.
2. Fixtures binarios: `scripts/make-pdf-fixture.mjs` (pdfkit) y `scripts/make-docx-fixture.mjs` (docx) → `fixtures/guideline.pdf|.docx` commiteados; texto de los fixtures = mismas 4-5 normas que `fixtures/guideline.md` (crearlo también).
3. Extracción pdf (pdf-parse) y docx (mammoth) — deps runtime justificadas.
4. CLI `rules import` en `index.ts`: gates (license + llm, strings idénticos a fix), extracción, chunks, stub-eable, validación vía `collectCustomRules` con `eliteRuleIds`, dedupe, YAML a `--out` (default `imported-rules.yaml`), negativa a sobrescribir sin `--force`, resumen stdout, exit codes.
5. Tests: unit + e2e con `llm-stub` parametrizable (reglas válidas + inválidas mezcladas) + redacción + determinismo byte a byte + fixtures pdf/docx.
6. Help/README (sección AI features: línea de `rules import`), changelog `f2-custom-rules` si toca contrato, índices.
7. `pnpm check` verde → spec `cerrada`.

**DoD:** AC-RI.1–11 verdes; INV-1/2/3/7 verdes; `analyze` sin llm sigue byte-idéntico.

## Notas para el agente

- Después de tocar `packages/mcp/src` (no debería hacer falta acá) → `pnpm build` antes de tests de cli (resuelven contra dist).
- Commits: mensaje sin comillas dobles embebidas (quirk PowerShell); usar `$msg = @'...'@` o string de una línea.

## Changelog del plan

- 2026-09-26 · Plan inicial (handoff desde revisión de M8.1).
