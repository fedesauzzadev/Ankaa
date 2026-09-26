# Tasks · f8-rules-import

Plan: [plans/f8-rules-import.md](../plans/f8-rules-import.md) · Spec: [specs/f8-rules-import.md](../specs/f8-rules-import.md)

## M8.2 — rules import

- [ ] `rules-import.ts`: extractText/chunkGuideline/parseRulesEnvelope/buildImportMessages/serializeRulesDrafts + unit tests (AC-RI.1, .3, .4)
- [ ] Fixtures: `fixtures/guideline.md` + scripts generadores + binarios `guideline.pdf`/`guideline.docx` commiteados
- [ ] Extracción pdf (pdf-parse) + docx (mammoth) + deps justificadas
- [ ] CLI `rules import` (gates, validación determinista, dedupe, --out/--force, resumen, exit codes) (AC-RI.5, .6, .10)
- [ ] E2E con llm-stub: válidas+inválidas mezcladas, redacción, determinismo byte a byte (AC-RI.2, .4, .7)
- [ ] E2E fixtures pdf/docx (AC-RI.8, .9)
- [ ] Boundary INV-7/analyze-sin-llm (AC-RI.11)
- [ ] Help/README/índices/changelogs
- [ ] `pnpm check` verde
- [ ] Spec `f8-rules-import` → `cerrada` + índices
