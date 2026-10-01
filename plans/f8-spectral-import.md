# Plan f8-spectral-import · Transpiler offline de rulesets Spectral

| Campo     | Valor                                             |
| --------- | ------------------------------------------------- |
| Estado    | completada                                          |
| Fase      | 17 (backlog [f17](f17-diferenciales.md) T1 #2 reglas) |
| Fecha     | 2026-10-01                                        |
| Deriva de | [spec f8-spectral-import](../specs/f8-spectral-import.md) (`ready`) |

## M17.9 — transpiler shapes S1..S7

1. Vendor: serializar ruleset `oas` 1.23.0 a
   `packages/cli/spectral/oas-1.23.0.json` (formato authored: `given` +
   `then[].function` string; atribución Apache-2.0).
2. Resolver `extends`: `spectral:oas` → vendor; archivos locales (depth ≤ 5,
   sin ciclos); resto → error claro. Overrides del usuario mergean
   (severity/description/given/then; `false` = disabled).
3. Clasificar: A cubiertas (14, tabla de equivalencia elite) / shapes S1..S7
   (import) / resto skip con motivo por regla.
4. Emitir: envelope `rules import` — draft YAML custom rules `SPEC-NNN`
   (alfabético, determinista), cada una por `validateRule`; resumen
   imported/skipped; exit 0/2.
5. CLI: `ankaa migrate --spectral <ruleset> [--out <file>] [--force]`
   (misma familia que redocly/vacuum-ignore).
6. Tests: shapes true/false (S1..S7 sobre fixtures), extends+overrides,
   covered-skip, safeRegex/flags skip, límites, e2e exit codes + determinismo,
   INV-1.

## Definition of done

- Spec §3b/§3c/§4 implementados; `pnpm check` verde; spec → `implementada`.

## Changelog

- 2026-10-01 · Plan creado con las 5 decisiones del dueño cerradas (spec §4).
- 2026-10-01 · M17.9 completo: 18 tests, `pnpm check` verde. Vendor como
  módulo TS bundleado (sin IO de archivos); `--spectral-disables` queda
  follow-up como en migration-kit.
