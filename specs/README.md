# Specs · ApiGovScan

Especificaciones **spec-driven** derivadas del [SDD v1.0](../docs/SDD.md). El SDD es el contrato de producto; estos specs descompone el **roadmap por fases** (0–5) en unidades implementables con criterios de aceptación verificables.

## Convención

| Elemento         | Significado                                                                  |
| ---------------- | ---------------------------------------------------------------------------- |
| `fN-*.md`        | Spec de una feature (N = fase del roadmap)                                   |
| Estado           | `draft` → `ready` → `implementada` → `cerrada`                               |
| AC               | Criterios de aceptación (Given/When/Then o checkboxes verificables en tests) |
| Fuera de alcance | Lo que este spec **no** cubre (evita scope creep)                            |

**Regla de oro:** no se escribe código de una feature sin su spec en `ready` y su plan/tasks asociados. Cambios de alcance = editar spec + changelog al pie, no improvisar en código.

## Índice

| Spec                                            | Fase | Resumen                                                                              | Estado       |
| ----------------------------------------------- | ---- | ------------------------------------------------------------------------------------ | ------------ |
| [f0-foundation](f0-foundation.md)               | 0    | Monorepo, toolchain, CI, esqueletos de packages                                      | implementada |
| [f1-analyze](f1-analyze.md)                     | 1    | Caso de uso end-to-end `analyze` + CLI                                               | implementada |
| [f1-openapi](f1-openapi.md)                     | 1    | Parser/normalizador OpenAPI 3.x → modelo `Spec`                                      | implementada |
| [f1-engine](f1-engine.md)                       | 1    | Rules engine + DSL whitelist + fingerprints                                          | implementada |
| [f1-elite-pack](f1-elite-pack.md)               | 1    | Pack elite ≥ 50 reglas con fuentes citadas                                           | implementada |
| [f1-reporters](f1-reporters.md)                 | 1    | Reportes console + JSON canónico                                                     | implementada |
| [f1-invariants](f1-invariants.md)               | 1    | INV-1…INV-7 como gates de CI                                                         | implementada |
| [f2-config](f2-config.md)                       | 2    | Config `apigovscan.yaml` completa (strict)                                           | cerrada      |
| [f2-custom-rules](f2-custom-rules.md)           | 2    | DSL custom + `rules validate`/`list`                                                 | cerrada      |
| [f2-baseline](f2-baseline.md)                   | 2    | Baseline: gate solo findings nuevos                                                  | cerrada      |
| [f3-init](f3-init.md)                           | 3    | Scaffold `.apigovscan/` con `init`                                                   | cerrada      |
| [f3-skills](f3-skills.md)                       | 3    | Carga/aplica suppressions + severities en analyze                                    | cerrada      |
| [f3-learn](f3-learn.md)                         | 3    | `learn` feedback → skills (INV-5) + list/promote                                     | cerrada      |
| [f4-mcp-server](f4-mcp-server.md)               | 4    | Server MCP stdio + sandbox + cmd `mcp`                                               | cerrada      |
| [f4-mcp-tools](f4-mcp-tools.md)                 | 4    | Tools FR-50 con paridad CLI                                                          | cerrada      |
| [f5-reporters](f5-reporters.md)                 | 5    | Reportes SARIF + Markdown + annotations                                              | cerrada      |
| [f5-action](f5-action.md)                       | 5    | GitHub Action oficial (composite)                                                    | cerrada      |
| [f6-score](f6-score.md)                         | 6    | Governance score 0-100 + grade A–F                                                   | cerrada      |
| [f6-distribution](f6-distribution.md)           | 6    | Licencia offline + tarball/registry/Docker privados                                  | cerrada      |
| [f7-enterprise](f7-enterprise.md)               | 7    | Packs por cliente + self-host completo + edge CF (todo lo pendiente, fase única)     | draft        |
| [f8-oss-differentials](f8-oss-differentials.md) | 8    | Diferenciales OSS: LLM opcional, drift/generación de spec, scan-org, multi-protocolo | cerrada      |
| [f8-suggest-fix](f8-suggest-fix.md)             | 8    | M8.1: proponer arreglos con LLM del cliente (opcional)                               | cerrada      |
| [f8-rules-import](f8-rules-import.md)           | 8    | M8.2: guideline interna → reglas (LLM propone, engine valida)                        | cerrada      |
| [f8-drift](f8-drift.md)                         | 8    | M8.3: drift spec↔código + generación de spec                                         | cerrada      |
| [f8-scan-org](f8-scan-org.md)                   | 8    | M8.4: informe consolidado multi-repo (batch)                                         | cerrada      |
| [f8-scan-repo](f8-scan-repo.md)                 | 8    | M8.11: analizar un repo Git individual por HTTPS/SSH                                 | cerrada      |
| [f8-spectral-import](f8-spectral-import.md)     | 8    | Transpilar un subconjunto offline del ruleset Spectral (ADR-014) | implementada |
| [f8-certify](f8-certify.md)                     | 8    | Verificación de integridad/autenticidad para reportes                | implementada |
| [f8-fp-budget](f8-fp-budget.md)                 | 8    | Medir feedback falso positivo por regla sin telemetría ni mutación                | implementada |
| [f8-elite-100](f8-elite-100.md)                 | 8    | M8.5: pack elite 65 → 88 reglas curadas (cierre honesto)                             | cerrada      |
| [f8-graphql](f8-graphql.md)                     | 8    | M8.6: GraphQL SDL — adapter + pack 8 reglas (protocolo 1 de 4)                       | cerrada      |
| [f8-grpc](f8-grpc.md)                           | 8    | M8.7: proto/gRPC — parser propio + pack 7 reglas (protocolo 2 de 4)                  | cerrada      |
| [f8-asyncapi](f8-asyncapi.md)                   | 8    | M8.8: AsyncAPI/eventos v2+v3 — parser + pack 6 reglas (protocolo 3 de 4)             | cerrada      |
| [f8-webhooks](f8-webhooks.md)                   | 8    | M8.9: webhooks/HTTP callbacks — parser + pack 6 reglas (protocolo 4 de 4)            | cerrada      |
| [f8-legacy-convert](f8-legacy-convert.md)       | 8    | Legacy Swagger 1.x/2.0 → Spec best-effort                                            | cerrada      |
| [f9-launch-oss](f9-launch-oss.md)               | 9    | Lanzamiento OSS gratuito (papeles, sin publicar)                                     | cerrada      |
| [f10-dashboard](f10-dashboard.md)               | 10   | Visor local de reportes + tracking, OSS para todos (loopback, sin nube)              | cerrada      |
| [f10-export](f10-export.md)                     | 7    | Contrato JSON para integraciones, edición empresarial (F7/M7.4)                      | cerrada      |
| [f11-coverage](f11-coverage.md)                 | 11   | Métrica de cobertura de gobernanza (% de la spec inspeccionada por reglas)           | cerrada      |
| [f12-breaking](f12-breaking.md)                 | 12   | Diff spec-vs-spec: breaking changes base..head (BRK-001…008)                         | cerrada      |
| [f13-mini-validator](f13-mini-validator.md)     | 13   | Mini-validador offline de ejemplos schema-level (EXVAL-001/002, M17.6)               | implementada  |
| [f14-agent-api-gate](f14-agent-api-gate.md)     | 14   | Revisión local de cambios API para personas/agentes, con salida CI verificable       | cerrada      |
| [f15-local-workspace](f15-local-workspace.md)   | 15   | Workspace local guiado con historial, comparación y reanudación                      | cerrada      |
| [f16-ankaa-rebrand](f16-ankaa-rebrand.md)       | 16   | Rebranding ApiGovScan → Ankaa (big-bang pre-publicación, sin alias legacy)            | implementada |
| [f16-ankaa-rebrand](f16-ankaa-rebrand.md)       | 16   | Rebranding ApiGovScan → Ankaa (big-bang, pre-publicación)                            | ready       |
| [f17-migration-kit](f17-migration-kit.md)       | 17   | Migración desde Spectral/Redocly/vacuum: reglas + excepciones → skills               | implementada |
| [f17-compliance-pack](f17-compliance-pack.md)   | 17   | Evidencia compliance offline: PII + mapeo finding→control (OWASP/GDPR) en export     | implementada |
| [f17-ratchet](f17-ratchet.md)                   | 17   | Gate de deuda neta no creciente + burn-down en scan-org/dashboard                    | implementada |
| [f17-ci-reporters](f17-ci-reporters.md)         | 17   | Reporters junit/checkstyle/codequality + recetas GitLab/Azure/Jenkins | implementada |
| [f17-lsp](f17-lsp.md)                            | 17   | `ankaa lsp`: server LSP para feedback en editor con el mismo engine                  | implementada  |

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
- **Fase 5 (SDD §7)** = specs `f5-*` (SARIF/Markdown/annotations + GitHub Action) — cerrada en `v0.5.0-action`.
- **Fase 6 (re-priorizada 2026-09-26)** = producto **privado instalable**: `f6-score` + `f6-distribution` — **cerradas en `v0.6.0-private`**.
- **Fase 7** = todo lo pendiente consolidado en `f7-enterprise` (estado `draft`): packs por cliente, self-host compose completo, edge Cloudflare (opcional). Se abre cuando se arranque.
- **Fases 8+** = specs futuros — se abren cuando la fase anterior esté cerrada.
- **Fase 17** = backlog de diferenciales competitivos ([plan f17](../plans/f17-diferenciales.md)): specs `f17-*` + drafts existentes `f8-certify`, `f8-fp-budget`, `f8-spectral-import`, `f13-mini-validator`. Todas en `draft`, pendientes de las decisiones del dueño anotadas en el plan.

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
