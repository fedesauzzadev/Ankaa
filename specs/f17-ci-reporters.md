# f17-ci-reporters · Paridad CI enterprise: junit, checkstyle, codequality + recetas

| Campo     | Valor                                 |
| --------- | ------------------------------------- |
| Estado    | draft                                 |
| Fase      | 17                                    |
| Fecha     | 2026-09-30                            |
| Deriva de | [f5-reporters](f5-reporters.md) (cerrada); INV-2 |

## 1. Objetivo / user story

Como equipo con Jenkins, GitLab o Azure DevOps (no GitHub), quiero reportes
que mis pipelines ya consumen (JUnit XML, Checkstyle, CodeQuality de GitLab) y
recetas listas para copiar, para que Ankaa no me fuerce a cambiar de CI.

## 2. Alcance (in / out)

### In

- `--format junit`: `<testsuite>` por spec, `<testcase>` por finding
  (error → `<error>`, warning → `<failure>`), **sin timestamps** (INV-2).
- `--format checkstyle`: XML con file/line/col/severity/message/`source=ruleId`.
- `--format codequality`: JSON CodeClimate / GitLab CodeQuality.
- `examples/ci/`: `gitlab-ci.yml`, `azure-pipelines.yml`, `Jenkinsfile` con
  publicación de reportes como artifacts.

### Out

- Red; HTML interactivo; cambios en el análisis (solo salida).
- Soporte de pipelines que requieran tokens o servicios externos.

## 3. Contrato (interfaces, schemas, UX)

- Mismos flags `--output`/`--fail-on`; mismos exit codes que los reporters
  existentes.
- Determinismo byte-estable (snapshots); orden = orden canónico de findings.
- line/col: si no existe mapper pointer → posición, emitir `line="1"` con el
  pointer en el message (decisión §7); nunca inventar posiciones.

## 4. Criterios de aceptación (preliminares)

- [ ] AC-CI.1 XML/JSON válidos y parseables contra schemas de referencia.
- [ ] AC-CI.2 e2e exit codes por formato.
- [ ] AC-CI.3 Snapshots deterministas: dos corridas → bytes idénticos.
- [ ] AC-CI.4 Recetas de `examples/ci/` corren el CLI y publican artifacts.
- [ ] AC-CI.5 `pnpm check` e invariantes verdes.

## 5. Test plan

- Fixtures multi-spec; validación de schemas; e2e CLI; snapshots.

## 6. Dependencias

- `f5-reporters` (cerrada): infraestructura de formatos.

## 7. Riesgos y decisiones abiertas

- ¿El parser conserva line/col de los nodos YAML/JSON? Si no, checkstyle pierde
  valor: evaluar mapper pointer → línea antes de implementar.
- Versión de schema JUnit (4 vs 5) y de Checkstyle a pinnear.

## Changelog

- 2026-09-30: draft inicial desde el backlog f17
  ([plan](../plans/f17-diferenciales.md)).
