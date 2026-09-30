# f17-lsp · `ankaa lsp`: feedback en editor con el mismo engine

| Campo     | Valor                              |
| --------- | ---------------------------------- |
| Estado    | draft                              |
| Fase      | 17                                 |
| Fecha     | 2026-09-30                         |
| Deriva de | SDD §3 (local-first); INV-1/INV-2  |

## 1. Objetivo / user story

Como dev escribiendo una spec, quiero ver los findings mientras escribo (no en
CI), con el mismo motor y los mismos resultados que el CLI, sin red ni LLM.

Nota honesta: vacuum ya trae language-server y Spectral tiene extensiones de
VS Code/JetBrains. Esto es paridad necesaria para adopción, no diferencial.

## 2. Alcance (in / out)

### In

- `ankaa lsp`: server LSP sobre stdio (editor-agnóstico).
- v0 single-file: `textDocument/didOpen|didChange|didSave` → `diagnostics`
  del archivo abierto, con debounce configurable.
- Mapeo de severidades: error → 1, warning → 2, info → 3.
- Paridad: mismos findings que `analyze` sobre el mismo archivo (ni más ni
  menos reglas).
- Config vía `ankaa.yaml` (pack, rules, skills) y workspace root.

### Out

- Red, LLM, formateo/quickfix en v0, multi-root workspaces, `$ref` externos
  multi-archivo en v0.
- Empaquetar extensiones (VS Code marketplace etc.): decisión posterior al
  server (§7).

## 3. Contrato (interfaces, schemas, UX)

- LSP 3.17 base con capabilities mínimas declaradas.
- Debounce default ~300 ms; target < 1 s por análisis en specs ≤ 1 MB.
- Diagnostics con `source: "ankaa"`, `code: ruleId`, message canónico en
  inglés (mismo string que CLI/JSON).

## 4. Criterios de aceptación (preliminares)

- [ ] AC-LSP.1 Handshake + `didOpen` produce los mismos findings que el CLI
      (fixture compartido CLI-vs-LSP).
- [ ] AC-LSP.2 `didChange` con debounce no duplica ni pierde diagnostics.
- [ ] AC-LSP.3 Spec inválido → diagnóstico de parse honesto, sin crash.
- [ ] AC-LSP.4 Test de red: el server no hace fetch (INV-1).
- [ ] AC-LSP.5 Determinismo: dos análisis del mismo buffer → mismos findings.

## 5. Test plan

- Harness con client LSP fixture; e2e de paridad CLI-vs-LSP; tests de timeout
  y specs grandes; invariantes.

## 6. Dependencias

- Motor `analyze` reutilizable como biblioteca (ya existe vía MCP/workspace).

## 7. Riesgos y decisiones abiertas

- ¿Extensión VS Code publicada en marketplace o solo binario + docs de
  configuración por editor?
- Rendimiento en specs grandes: ¿cache del modelo por versión de documento?
- Prioridad relativa contra Tier 1/2: este spec no debería ganarle al backlog
  superior.

## Changelog

- 2026-09-30: draft inicial desde el backlog f17
  ([plan](../plans/f17-diferenciales.md)).
