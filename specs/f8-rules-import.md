# f8-rules-import · Guideline interna → pack de reglas (LLM propone, engine valida)

| Campo | Valor |
|---|---|
| Estado | ready |
| Fecha | 2026-09-26 |
| Fase | 8 (M8.2 del umbrella `f8-oss-differentials`) |
| Deriva de | `f8-oss-differentials` M8.2; `f8-suggest-fix` (adapter `llm.ts`, gates); `f2-custom-rules` (validador determinista); FR-43 (redacción); INV-1/INV-3/INV-7 |

## 1. Objetivo / user story

Como equipo con un documento interno de diseño de APIs (PDF/Word/Markdown) que nadie enforcementa, quiero `apigovscan rules import --from <doc>` para convertirlo en un **archivo de reglas custom revisable**, usando mi propio LLM para draftear y el validador determinista para rechazar fruta.

**Regla de oro (heredada de f8-suggest-fix):** el LLM solo draftea; el validador determinista (`validateRule`/`collectCustomRules` existente) decide qué sobrevive. Nada se ejecuta ni aplica solo: el archivo resultante lo revisa un humano como código.

## 2. Alcance

### In

- **CLI**: `apigovscan rules import --from <file> [--out <file>] [--config <file>] [--license-key <key>] [--force]`
  - Default `--out`: `imported-rules.yaml` en cwd.
  - Se niega a sobrescribir un `--out` existente sin `--force` (precedente: baseline).
- **Extracción de texto**: `.md`, `.txt`, `.yaml/.yml` (texto plano), `.pdf` (pdf-parse), `.docx` (mammoth). Extension desconocida → exit 2 con lista soportada.
- **Redacción antes del LLM**: el texto extraído pasa por `redactText` (FR-43).
- **Chunking**: documentos más largos que `MAX_CHUNK_CHARS` (~8000) se parten por líneas en blanco/límites de sección; 1 request por chunk; dedupe de ids entre chunks (gana el primero, duplicados reportados).
- **Prompt**: system explica el DSL (id `PREFIX-NNN` con prefijo `TEAM-`, taxonomy cerrada, severities, `when` opcional con whitelist existente) + 1 ejemplo mínimo; pide SOLO un JSON array de objetos regla `{id, category, severity, message, fix?, when?}`.
- **Parseo tolerante**: fences, JSON embebido, o array crudo; entradas no-objeto se descartan individualmente (no tumba el lote).
- **Validación determinista**: cada draft pasa por el validador existente; válidas se escriben, inválidas se reportan con su error.
- **Salida**: YAML de reglas (mismo formato que `team-rules.yaml`), más stdout con resumen: `N imported, M rejected — review imported-rules.yaml and add it to customRules in apigovscan.yaml`.
- **Gates**: license (igual que `fix`) + llm configurado (mensaje idéntico a fix si falta).

### Out

- Escribir en `.apigovscan/` (skills) — INV-7: solo el `--out` explícito.
- Aplicar/activar reglas automáticamente (el humano las agrega a `customRules`).
- Import desde URLs/red (archivos locales solamente).
- Fine-tuning, RAG sobre estándares, o cualquier estado.

## 3. Contrato

```ts
// packages/cli/src/rules-import.ts
export function extractText(file: string, bytes: Buffer): { ok: true; text: string } | { ok: false; error: string };
export function chunkGuideline(text: string, maxChars?: number): string[];
export function parseRulesEnvelope(text: string): unknown[];              // objetos regla crudos
export function buildImportMessages(chunk: string): ChatMessage[];       // redacta el chunk
export function serializeRulesDrafts(rules: Rule[]): string;             // YAML del mismo formato que team-rules.yaml
```

- Exit codes: `0` con ≥1 regla válida escrita; `2` en error de config/llm/license/extracción, o si **0 reglas válidas** (`no valid rules produced`).
- Formato del YAML de salida: idéntico al que `collectCustomRules` ya consume (stamping local: `packId: custom` lo hace el validador al cargar, NO se escribe en el archivo).

## 4. Criterios de aceptación

- [ ] **AC-RI.1** Extracción md/txt/yaml: texto plano íntegro; extensión no soportada → exit 2 con lista.
- [ ] **AC-RI.2** Redacción: un secret (AKIA/PEM) en el guideline NO aparece en ningún body enviado al stub.
- [ ] **AC-RI.3** Chunking: doc > maxChars produce >1 request al stub; cada body ≤ maxChars (+ prompt).
- [ ] **AC-RI.4** Envelope: array JSON (con fences) parsea; objetos inválidos se descartan sin tumbar los válidos; cero objetos → exit 2 `no valid rules produced`.
- [ ] **AC-RI.5** Validación determinista: reglas inválidas del stub (severity mala, id mal formato, `when` con op inexistente) se rechazan con su error; solo las válidas se escriben.
- [ ] **AC-RI.6** Salida: `imported-rules.yaml` es YAML válido con N reglas; `--out` alternativo funciona; sobreescribir existente sin `--force` → exit 2 (no crea/borra nada).
- [ ] **AC-RI.7** Determinismo: re-run con mismo stub → archivo byte-idéntico (INV-2 friendly: sin timestamps).
- [ ] **AC-RI.8** PDF: fixture `fixtures/guideline.pdf` extrae su texto y el flujo completo funciona e2e.
- [ ] **AC-RI.9** DOCX: fixture `fixtures/guideline.docx` ídem.
- [ ] **AC-RI.10** Gates: sin license → exit 2 mensaje license; sin llm → exit 2 mensaje `llm not configured` (los mismos strings que `fix`).
- [ ] **AC-RI.11** Boundary: `rules import` no importa `analyze.ts`/core; solo escribe el `--out` (INV-7); `analyze` sin config llm sigue byte-idéntico.

## 5. Test plan

- Unit `packages/cli/test/rules-import.test.ts`: extract/chunk/parse/serialize (AC-RI.1, .3, .4, .7 parcial).
- E2E `packages/cli/test/rules-import.e2e.test.ts` con `test/llm-stub.ts` (response parametrizable): AC-RI.2, .4–.7, .10, .11.
- Fixtures binarios: `fixtures/guideline.pdf` y `fixtures/guideline.docx` generados UNA VEZ con scripts (`scripts/make-pdf-fixture.mjs` con pdfkit, `scripts/make-docx-fixture.mjs` con docx — ambos devDeps justificados) y commiteados; los scripts quedan para regenerarlos.
- Boundary: extender `llm-boundary.test.ts` si hace falta (rules-import no importa analyze).

## 6. Dependencias

- `pdf-parse` y `mammoth` (runtime, solo usados por `rules import` — justificación supply-chain en AGENTS §8: extracción local de texto, sin postinstall scripts, instalar con `--ignore-scripts` si aplica); `pdfkit` y `docx` (devDeps, solo generación de fixtures).
- `f8-suggest-fix` (`llm.ts`, stub, gates), `f2-custom-rules` (validador).

## 7. Riesgos y decisiones abiertas

| Tema | Decisión v1 |
|---|---|
| Calidad de drafts con `when` complejo | Se acepta: el validador filtra; el humano revisa. El prompt pide `when` solo si es simple. |
| PDFs escaneados (sin texto) | Texto vacío → exit 2 `could not extract text (scanned PDFs are not supported)`. |
| Docs gigantes | N chunks = N requests; sin límite v1 (es el LLM del cliente), aviso con `--debug`. |
| Ids duplicados entre chunks | Gana el primero; resto reportado como `duplicate id skipped`. |

## Changelog

- 2026-09-26 · Spec creado en `ready` (segundo milestone ejecutable de f8; handoff vía AGENTS.md + este spec).
