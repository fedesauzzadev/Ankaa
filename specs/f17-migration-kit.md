# f17-migration-kit · Migración de excepciones desde otros linters

| Campo     | Valor                                                          |
| --------- | -------------------------------------------------------------- |
| Estado    | implementada                                                    |
| Fase      | 17                                                             |
| Fecha     | 2026-09-30                                                     |
| Deriva de | [f8-spectral-import](f8-spectral-import.md) (ADR-014); [f3-skills](f3-skills.md); INV-1/INV-4/INV-5/INV-7 |

## 1. Objetivo / user story

Como equipo que ya usa Redocly CLI o vacuum, quiero migrar mis excepciones
acumuladas (ignore-files) a suppressions con fingerprint que sobreviven
refactors, en una operación local y offline, para adoptar el loop de skills de
Ankaa sin empezar de cero.

Los ignore-files de origen son estáticos (pointer/JSONPath): se rompen al
mover nodos y crecen para siempre. Las suppressions de Ankaa son por
fingerprint y viven en `.ankaa/skills/`, versionadas y revisables en PR.

## 2. Alcance (in / out)

### In (v0 — M17.3)

- `ankaa migrate --redocly-ignore <.redocly.lint-ignore.yaml> --spec <path>`:
  entries `<file> → <ruleId> → [pointers]` a suppressions.
- `ankaa migrate --vacuum-ignore <ignore.yaml> --spec <path>`: entries
  `<ruleId> → [JSONPath]`, convertidas a JSON Pointer.
- Cálculo del fingerprint re-analizando localmente el spec indicado (mismo
  pipeline que `fix`, sin skills/baseline en el camino).
- Destino: `.ankaa/skills/migrated/<origin>.yaml` (decisión del dueño), schema
  idéntico a `suppressions.yaml`, ordenado por fingerprint (idempotente).
- `--dry-run` (imprime el plan, no escribe), `--skills-dir`, `--config`,
  `--license-key`.
- El loader de skills aplica `migrated/*.yaml` igual que `suppressions.yaml`
  (analyze las cuenta en `skillsSuppressed`); `skills list` las muestra.

### Out (v0) — follow-ups explícitos

- `--spectral-rules` (transpilación de reglas): depende de
  `f8-spectral-import` en `ready` (spike ADR-014). El CLI lo rechaza con un
  error que apunta a ese spec.
- `--spectral-disables` (comentarios inline): **deferido con motivo**: los
  findings no exponen line/col y el parser descarta comentarios YAML, por lo
  que mapear disables por línea sería adivinar. Requiere mapper
  pointer→línea (mismo blocker que `f17-ci-reporters`).
- Mapeos de equivalencia ruleId-origen → ruleId-Ankaa (curados): v0 no
  pretende equivalencia de reglas.
- Ejecutar rulesets/functions de origen (INV-4), URLs/cloud (INV-1).

## 3. Semántica de matching (v0, explícita)

- **Matching por location:** una entrada (pointer) matchea **todos** los
  findings de Ankaa cuyo `location` (JSON Pointer normalizado, sin `#`)
  coincida exactamente. El ruleId de origen **no** se interpreta: queda
  registrado en el `reason` (p. ej.
  `migrated from redocly lint-ignore (rule: operation-operationId)`).
  Rationale honesto: la entrada marcó ese lugar como deuda aceptada;
  transferir esa aceptación por location es revisable en el diff del PR.
- Redocly: solo se procesan las entries cuyo file key matchea el basename del
  `--spec`; el resto queda unmatched con motivo.
- Vacuum: el JSONPath se convierte a pointer (`$.a.b[0]` → `/a/b/0`, con
  escape `~0`/`~1`); paths no representables (recursivos `..`, keys con `.`)
  quedan unmatched con motivo.
- Unmatched: se listan con motivo individual en stdout; **nunca** se escriben
  como suppressions adivinadas.
- Idempotencia: re-importar el mismo archivo produce YAML byte-idéntico.

## 4. Contrato

```bash
ankaa migrate --redocly-ignore <file> --spec <path> [--skills-dir <dir>] [--dry-run] [--config <f>] [--license-key <k>]
ankaa migrate --vacuum-ignore  <file> --spec <path> [mismos flags]
```

- Requiere exactamente un origen (`--redocly-ignore` | `--vacuum-ignore`) y
  `--spec` (archivo individual; directorios no).
- Gate de licencia como `fix` (corre el análisis en memoria).
- Exit codes: `0` import ok (aunque haya unmatched), `2` usage/parse/load.
- Salida: `migrate: <origin> → <destino>`, `imported: N`, `unmatched: M` +
  detalle.

## 5. Criterios de aceptación

- [x] AC-MG.1 Redocly ignore con ≥ 2 pointers reales de un spec analizado
      genera las suppressions esperadas por fingerprint, con reason citando la
      regla de origen.
- [x] AC-MG.2 `analyze` posterior aplica `migrated/*.yaml` y reporta
      `(skills: N suppressed)` incluyendo lo migrado.
- [x] AC-MG.3 Entradas sin match (pointer sin finding, file key ajeno al
      spec, JSONPath no convertible) quedan listadas con motivo; ninguna
      suppression adivinada.
- [x] AC-MG.4 Doble import del mismo archivo → `migrated/<origin>.yaml`
      byte-idéntico (INV-5 style).
- [x] AC-MG.5 `--dry-run` no escribe nada (INV-7).
- [x] AC-MG.6 Vacuum ignore: JSONPath simple se convierte y matchea; el
      recursivo queda unmatched con motivo.
- [x] AC-MG.7 `skills list` muestra las suppressions migradas.
- [x] AC-MG.8 Sin licencia ⇒ exit 2; flags inválidos/archivos ilegibles ⇒
      exit 2; `--spectral-rules` ⇒ exit 2 con referencia al spec.
- [x] AC-MG.9 Test de red en `migrate` falla ante fetch (INV-1).
- [x] AC-MG.10 `pnpm check` e invariantes verdes.

## 6. Test plan

| Caso                                                       | Tipo |
| ---------------------------------------------------------- | ---- |
| Parsers redocly/vacuum + convertidor JSONPath→pointer       | unit |
| Matching por location, unmatched honestos, determinismo    | unit |
| e2e: analyze → migrate → re-analyze suppressed (AC-MG.1/2) | e2e  |
| dry-run, idempotencia, gating, INV-7 (AC-MG.4/5/8)         | e2e  |

## 7. Dependencias

- `analyze-setup`/`analyze` (pipeline en memoria, como `fix`).
- `skills.ts` (loader extendido a `migrated/*.yaml`).
- `f8-spectral-import` **no** bloquea v0 (solo la parte de reglas).

## 8. Riesgos y decisiones abiertas

- Schema de `.redocly.lint-ignore.yaml` pinneado al formato documentado
  (root: file → ruleId → array de pointers); formato desconocido ⇒ exit 2.
- Matching exacto de pointers: si la herramienta de origen apuntaba un nodo
  ligeramente distinto, queda unmatched (visible, no silencioso).
- Follow-up natural: mapa curado de equivalencias ruleId (cuando haya demanda
  real), y `--spectral-disables` tras el mapper de líneas.

## Changelog

- 2026-09-30: draft inicial desde el backlog f17
  ([plan](../plans/f17-diferenciales.md)).
- 2026-09-30: dueño decide destino `skills/migrated/*.yaml` separado por
  origen; §3 actualizado, decisión abierta del §7 resuelta.
- 2026-09-30: alcance v0 ajustado con honestidad — redocly+vacuum exceptions
  primero; `--spectral-rules` queda gated a `f8-spectral-import`,
  `--spectral-disables` deferido por falta de line/col (motivo documentado);
  semántica de matching por location explícita → `ready`.
- 2026-09-30 · M17.3 implementado: `packages/cli/src/migrate.ts` (parsers
  redocly/vacuum + convertidor JSONPath→pointer + matching por location sobre
  findings crudos) + loader de skills extendido a `migrated/*.yaml` +
  comando `ankaa migrate` + 13 tests (AC-MG.1…9) · `pnpm check` verde ·
  estado → `implementada` (piezas Spectral siguen como follow-up documentado).
