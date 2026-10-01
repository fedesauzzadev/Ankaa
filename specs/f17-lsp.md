# f17-lsp · `ankaa lsp`: feedback en editor con el mismo engine

| Campo     | Valor                              |
| --------- | ---------------------------------- |
| Estado    | implementada                       |
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

- [x] AC-LSP.1 Handshake + `didOpen` produce los mismos findings que el CLI
      (fixture compartido CLI-vs-LSP).
- [x] AC-LSP.2 `didChange` con debounce no duplica ni pierde diagnostics.
- [x] AC-LSP.3 Spec inválido → diagnóstico de parse honesto, sin crash.
- [x] AC-LSP.4 Test de red: el server no hace fetch (INV-1).
- [x] AC-LSP.5 Determinismo: dos análisis del mismo buffer → mismos findings.

## 5. Test plan

- Harness con client LSP fixture; e2e de paridad CLI-vs-LSP; tests de timeout
  y specs grandes; invariantes.

## 6. Dependencias

- Motor `analyze` reutilizable como biblioteca (ya existe vía MCP/workspace).

## 7. Riesgos y decisiones (cerradas por el dueño, 2026-10-01)

| Tema                             | Decisión                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------ |
| Distribución v0                  | **Solo binario `ankaa lsp` + docs por editor** (Neovim/Helix/Zed/Emacs; VS Code vía cliente LSP genérico). Marketplace/.vsix = decisión posterior al server (como f9). |
| Protocolo                        | **Hand-rolled** subset LSP 3.17 sobre stdio (cero deps nuevas): `initialize/initialized`, `didOpen/didChange/didSave`, `shutdown/exit`, `textDocument/publishDiagnostics`. Framing `Content-Length` con tests propios. |
| Rangos de diagnostics            | **Activar M17.7b** (mapper YAML ya analizado en f17-ci-reporters §8, spike validado): diagnostics con línea real en YAML; fallback `(0,0)` file-level en JSON/GraphQL/gRPC y pointers con miss. Requiere `Spec.positions` (spec `f1-openapi` regla 5b, editada antes). |
| Cache                            | **Content-hash**: si el hash del buffer no cambió entre eventos, no re-analizar. |
| Rendimiento specs grandes         | Debounce default 300 ms (configurable) + cache por hash; parse duplicado (valor + CST) aceptado en v0 (specs ≤ 1 MB ⇒ ms). |

## Changelog

- 2026-09-30: draft inicial desde el backlog f17
  ([plan](../plans/f17-diferenciales.md)).
- 2026-10-01: dueño cierra las 4 decisiones (§7) → spec `ready`. El slice
  incluye M17.7b (posiciones) como prerrequisito: spec `f1-openapi` regla 5b
  primero (regla de oro).
- 2026-10-01: M17.8 implementado: `packages/lsp` (protocolo hand-rolled, 11
  tests) + `ankaa lsp` con paridad CLI (5 e2e) + `docs/editors.md` ·
  AC-LSP.1..5 verdes → `implementada`. M17.7b quedó activo vía
  `Spec.positions` (checkstyle/sarif/codequality con líneas reales).
