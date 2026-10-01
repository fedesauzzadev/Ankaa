# Plan f17-ci-reporters · Paridad CI enterprise

| Campo     | Valor                                              |
| --------- | -------------------------------------------------- |
| Estado    | completada                                         |
| Fase      | 17 (backlog [f17](f17-diferenciales.md) T3 #7)    |
| Fecha     | 2026-10-01                                         |
| Deriva de | [spec f17-ci-reporters](../specs/f17-ci-reporters.md) (`ready`) |

## M17.7a — reporters con fallback (decisión A→B §8.6)

1. `@ankaa/reporters`: `formatJunit` (testsuites por spec, error/failure/
   skipped), `formatCheckstyle` (file/error, fallback line/column=1 +
   pointer en message), `formatCodequality` (CodeClimate, fingerprint del
   finding) — byte-estables, sin timestamps (INV-2), sin DTD fetch (INV-1).
2. CLI: `--format junit|checkstyle|codequality` en analyze (args, sink,
   help).
3. `examples/ci/`: `gitlab-ci.yml`, `azure-pipelines.yml`, `Jenkinsfile`
   publicando artifacts.
4. Tests: unit (schemas, escapes, agrupación multi-input, determinismo
   byte-estable) + e2e (exit codes por formato, --output, snapshots).

## M17.7b — mapper YAML pointer→line/col (a demanda)

- Solo si la adopción real de checkstyle exige inline. Requiere editar
  `specs/f1-openapi.md` primero (side-table de posiciones en `Spec`).

## Definition of done

- AC-CI.1…5 verdes; `pnpm check` + invariantes verdes; spec → `implementada`.

## Changelog

- 2026-10-01 · Plan creado tras cerrar decisiones §5.7 (A→B + schemas).
- 2026-10-01 · M17.7a completo: AC-CI.1..5 verdes, `pnpm check` verde.
  M17.7b queda a demanda (checkstyle inline).
