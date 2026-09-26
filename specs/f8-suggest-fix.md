# f8-suggest-fix · Proponer arreglos de findings con LLM del cliente (opcional)

| Campo | Valor |
|---|---|
| Estado | cerrada |
| Fecha | 2026-09-26 |
| Fase | 8 (M8.1 del umbrella `f8-oss-differentials`) |
| Deriva de | `f8-oss-differentials` M8.1; FR-43 (redacción); INV-1/INV-3; `f2-config` (schema strict) |

## 1. Objetivo / user story

Como dev con un finding delante, quiero que la herramienta me **muestre el arreglo propuesto** (diff del spec), generado por el LLM que YO configuré (privado u abierto), sin que la herramienta escriba nada por mí.

**Regla de oro (no negociable):** el LLM nunca es árbitro — no afecta findings, score ni gate. Solo propone texto. Todo lo que produce es **draft** que un humano aplica.

## 2. Alcance

### In

- **Config LLM** en schema strict (`apigovscan.yaml`): `llm: { baseUrl?: string; apiKey?: string; model?: string }`. Sin `llm` configurado → el resto del producto funciona idéntico a hoy.
- **Adapter** `packages/cli/src/llm.ts`: cliente compatible OpenAI (`POST {baseUrl}/chat/completions`), timeout ~30s, errores limpios (EN). NUNCA importado por `analyze` (INV-1: el path de analyze sigue sin red). `apiKey` nunca se loguea.
- **CLI**: `apigovscan fix <path> [--fingerprint <fp>]` — lee/analiza el spec, toma los findings (o el del fingerprint), pide propuestas al LLM e imprime **diffs unificados propuestos**. **Nunca escribe archivos** (no existe modo write en v1).
- **MCP tool** `suggest_fix(fingerprint, reportPath?)` → payload `{ ok, fingerprint, patch, explanation, confidence }`; `isError` si no hay LLM o falla.
- **Prompt**: regla (mensaje + fix hint + fuente), finding (message/location ya redactados) y un **fragmento acotado** del spec alrededor del JSON pointer del finding (pasa por `redactText`).
- Salida del LLM validada: si el diff no parsea como unified diff del archivo → error honesto (`could not produce a valid patch`), no fruta.

### Out

- Aplicar patches automáticamente (v2 con confirmación interactiva).
- `fix` masivo/CI (v1 es local, humano al lado).
- LLM en core/engine/score/gate.
- Selección de modelo automática (usa el configurado).

## 3. Contrato

```ts
// packages/cli/src/llm.ts
export interface LlmConfig { baseUrl: string; apiKey?: string; model?: string }
export function loadLlmConfig(config: unknown, env: Record<string, string|undefined>): LlmConfig | undefined;
// undefined => features LLM deshabilitadas (mensaje claro, no error de analyze)
export async function chatCompletion(cfg: LlmConfig, messages: Array<{role: string; content: string}>, opts?: { timeoutMs?: number }): Promise<string>;
```

- CLI `fix`: sin LLM configurado → stderr `error: llm not configured: set llm.baseUrl in apigovscan.yaml (AI features are optional)` + exit 2. Con LLM → exit 0 (imprime diffs) o exit 2 en error.
- Env override: `APIGOVSCAN_LLM_BASE_URL` / `_API_KEY` / `_MODEL` (gana sobre config, igual patrón que license).
- Config schema strict gana `llm` con keys exactas `baseUrl|apiKey|model` (typos → error como el resto).

## 4. Criterios de aceptación

- [x] **AC-SF.1** `loadLlmConfig`: env > config; strings no vacíos; sin config → `undefined` (no error).
- [x] **AC-SF.2** Config strict: `llm` aceptada; key desconocida (`llm.url`) → `config ...: llm: unknown key "url"`; `baseUrl` no-string → error.
- [x] **AC-SF.3** `analyze` SIN `llm` configurado se comporta byte a byte igual que hoy (reportHash y score idénticos; INV-1 test con fetch stubbed sigue verde).
- [x] **AC-SF.4** `fix` sin config LLM → exit 2 + mensaje con `llm.baseUrl`.
- [x] **AC-SF.5** `fix` con stub OpenAI-compatible (servidor http local en test): imprime `--- a/<file>` / `+++ b/<file>` unified diff; **no escribe** el spec (mtime/contenido iguales).
- [x] **AC-SF.6** `--fingerprint <fp>` limita a ese finding; fingerprint inexistente → exit 2 `finding not found`.
- [x] **AC-SF.7** Redacción: con un secret en el spec (PEM/AKIA…), el body del request al LLM NO contiene el secret (stub captura el body y lo aserta).
- [x] **AC-SF.8** MCP `suggest_fix`: payload con `patch`+`explanation`+`confidence`; sin LLM → `isError` con mensaje; el diff inválido del LLM → error honesto, nunca patch roto.
- [x] **AC-SF.9** INV-1: `packages/core` y el path de `analyze` no importan `llm.ts` (test de boundary por imports o grep en CI).

## 5. Test plan

- Unit `packages/cli/test/llm.test.ts`: AC-SF.1–2 (config/env), timeout, error de red → mensaje limpio.
- E2E `packages/cli/test/fix.e2e.test.ts`: stub server OpenAI-compatible (node:http en puerto efímero, respuesta fija con diff válido) → AC-SF.4–7.
- E2E MCP en `mcp.e2e` o archivo propio: AC-SF.8.
- INV: suite invariants existente sin cambios (AC-SF.3/9).

## 6. Dependencias

- `f2-config` (schema + changelog), `f1-analyze` (findings/report), `f4-mcp-tools` (registro de tool nueva).
- Sin deps nuevas de runtime (fetch nativo).

## 7. Riesgos y decisiones abiertas

| Tema | Decisión v1 |
|---|---|
| Formato de salida del LLM | Prompt estricto ("responde SOLO un unified diff") + parser tolerante; inválido → error honesto. |
| Contexto del spec | Fragmento alrededor del pointer (límite de tamaño); specs enormes → trunca y avisa. |
| Tokens/costo | Es el LLM del cliente; timeout y 1 request por finding. |
| `confidence` | v1: lo que declare el LLM (low/medium/high); informativo, jamás gate. |

## Changelog

- 2026-09-26 · Spec creado en `ready` (primer milestone ejecutable de f8; handoff a cualquier agente vía AGENTS.md + este spec).
- 2026-09-26 · M8.1 implementado → `cerrada` (AC-SF.1–9 verdes; `pnpm check` verde). Decisiones de implementación:
  - `fix` exige licencia (mismo gate que `analyze`: corre el análisis completo en memoria — dejarlo libre sería un bypass).
  - El MCP usa el gate del arranque del server (ya existente); la tool no revalida.
  - Respuesta del LLM: envelope JSON `{patch, explanation, confidence}` (parser tolerante a fences y a diffs crudos); `confidence` inválida → `"low"`.
  - `reportPath` es opcional en el schema MCP pero obligatorio en la práctica → error guiado si falta.
