# Specs · ApiGovScan

Especificaciones **spec-driven** derivadas del [SDD v1.0](../docs/SDD.md). El SDD es el contrato de producto; estos specs descompone el **roadmap por fases** (0–5) en unidades implementables con criterios de aceptación verificables.

## Convención

| Elemento | Significado |
|---|---|
| `fN-*.md` | Spec de una feature (N = fase del roadmap) |
| Estado | `draft` → `ready` → `implementada` → `cerrada` |
| AC | Criterios de aceptación (Given/When/Then o checkboxes verificables en tests) |
| Fuera de alcance | Lo que este spec **no** cubre (evita scope creep) |

**Regla de oro:** no se escribe código de una feature sin su spec en `ready` y su plan/tasks asociados. Cambios de alcance = editar spec + changelog al pie, no improvisar en código.

## Índice

| Spec | Fase | Resumen | Estado |
|---|---|---|---|
| [f0-foundation](f0-foundation.md) | 0 | Monorepo, toolchain, CI, esqueletos de packages | implementada |
| [f1-analyze](f1-analyze.md) | 1 | Caso de uso end-to-end `analyze` + CLI | implementada |
| [f1-openapi](f1-openapi.md) | 1 | Parser/normalizador OpenAPI 3.x → modelo `Spec` | implementada |
| [f1-engine](f1-engine.md) | 1 | Rules engine + DSL whitelist + fingerprints | implementada |
| [f1-elite-pack](f1-elite-pack.md) | 1 | Pack elite ≥ 50 reglas con fuentes citadas | implementada |
| [f1-reporters](f1-reporters.md) | 1 | Reportes console + JSON canónico | implementada |
| [f1-invariants](f1-invariants.md) | 1 | INV-1…INV-7 como gates de CI | implementada |
| [f2-config](f2-config.md) | 2 | Config `apigovscan.yaml` completa (strict) | cerrada |
| [f2-custom-rules](f2-custom-rules.md) | 2 | DSL custom + `rules validate`/`list` | cerrada |
| [f2-baseline](f2-baseline.md) | 2 | Baseline: gate solo findings nuevos | cerrada |
| [f3-init](f3-init.md) | 3 | Scaffold `.apigovscan/` con `init` | cerrada |
| [f3-skills](f3-skills.md) | 3 | Carga/aplica suppressions + severities en analyze | cerrada |
| [f3-learn](f3-learn.md) | 3 | `learn` feedback → skills (INV-5) + list/promote | cerrada |
| [f4-mcp-server](f4-mcp-server.md) | 4 | Server MCP stdio + sandbox + cmd `mcp` | cerrada |
| [f4-mcp-tools](f4-mcp-tools.md) | 4 | Tools FR-50 con paridad CLI | cerrada |
| [f5-reporters](f5-reporters.md) | 5 | Reportes SARIF + Markdown + annotations | ready |
| [f5-action](f5-action.md) | 5 | GitHub Action oficial (composite) | ready |

## Orden de implementación sugerido

```
f0-foundation
    → f1-openapi ─┐
    → f1-engine  ─┼→ f1-analyze → f1-reporters
    → f1-elite-pack ┘                    ↘
                                          f1-invariants (corre sobre todo lo anterior)
```

## Relación con el roadmap del SDD

- **Fase 0 (SDD §7)** = spec `f0-foundation`.
- **Fase 1 (SDD §7)** = specs `f1-*` en conjunto (MVP).
- **Fase 2 (SDD §7)** = specs `f2-*` (config, custom rules, baseline) — cerrada en `v0.2.0-governance`.
- **Fase 3 (SDD §7)** = specs `f3-*` (init, skills, learn) — cerrada en `v0.3.0-learning`.
- **Fase 4 (SDD §7)** = specs `f4-*` (MCP stdio local) — cerrada en `v0.4.0-mcp`.
- **Fase 5 (SDD §7)** = specs `f5-*` (SARIF/Markdown/annotations + GitHub Action) — abierta.
- **Fases 6+** = specs futuros (MCP remoto/CF, registry…) — se abren cuando la fase anterior esté cerrada.

## Plantilla de spec (para futuras)

```markdown
# fN-nombre · Título
Estado | Fecha | Deriva de (SDD/ADR/FR)
## 1. Objetivo / user story
## 2. Alcance (in / out)
## 3. Contrato (interfaces, schemas, UX)
## 4. Criterios de aceptación (AC-1…)
## 5. Test plan
## 6. Dependencias
## 7. Riesgos y decisiones abiertas
## Changelog
```
