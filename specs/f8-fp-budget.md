# f8-fp-budget · Métrica de feedback por regla (fp-budget)

| Campo     | Valor                                                         |
| --------- | ------------------------------------------------------------- |
| Estado    | implementada                                                      |
| Fase      | 8                                                             |
| Fecha     | 2026-09-30                                                    |
| Deriva de | backlog `f8-elite-100`; [f3-learn](f3-learn.md); INV-1/INV-2/INV-5/INV-7 |

## 1. Objetivo / user story

Como dueño de un pack o tech lead, quiero saber **qué reglas generan más falsos
positivos** usando solo datos locales que el equipo ya decidió entregar
(feedback de `learn` + tracking del dashboard), para calibrar severidades y
priorizar el curado del pack. La métrica **informa**: no cambia packs, reglas
ni severidades, y no envía nada a nadie.

Esto convierte el loop de skills en calidad medible sin telemetría: ningún
competitor puede cuantificar el ruido de sus reglas offline.

## 2. Decisiones (dueño, 2026-09-30)

| Tema                 | Decisión                                                                    |
| -------------------- | --------------------------------------------------------------------------- |
| Fuentes              | Feedback explícito de `learn` **+** estados del tracking del dashboard      |
| Unidad               | Señal por fingerprint, deduplicada; una señal como máximo por fingerprint   |
| Precedencia          | Feedback > tracking; dentro de una fuente, el archivo posterior gana        |
| Señales que cuentan  | `false_positive`, `wontfix`, `confirm` (feedback) + `resolved` (tracking)   |
| Silencio             | `pending`/`in_progress` y `severity_change`/`suggest_rule` **no cuentan** (se reportan como conteos, nunca como aprobación) |
| Muestra mínima       | `10` señales revisadas (flag `--min-sample`)                                 |
| Umbral               | FP rate `> 0.3` (flag `--fp-threshold`) marca la regla `noisy`              |
| Salida               | Informe local (`ankaa skills stats`), console o JSON; **no mutante**        |

## 3. Contrato

### CLI

```bash
ankaa skills stats --report <r.json> [--report <r2.json>] \
  [--feedback <f.json> ...] [--tracking <t.json> ...] \
  [--min-sample 10] [--fp-threshold 0.3] \
  [--format console|json] [--output <file>]
```

- Requiere ≥ 1 `--report` y ≥ 1 de (`--feedback` | `--tracking`); si no, exit 2.
- `--output` requiere `--format json`: escribe el documento JSON y imprime
  `wrote: <path>` (INV-7: única escritura, explícita).
- Sin gate de licencia (operación local como `learn`).

### Semántica

- `sample(ruleId) = falsePositive + wontfix + confirm + resolved`
- `rate = falsePositive / sample` (`null` si `sample = 0`)
- `noisy = sample >= minSample && rate > fpThreshold`
- Fingerprints de feedback (8–64 hex) se resuelven contra la unión de los
  reports (mismo mecanismo que `learn`). Prefijo inexistente/ambiguo o
  fingerprint ausente de los reports ⇒ **warning + skip** (no exit 2: es un
  informe, no un gate).
- Tracking: solo fingerprints presentes en los reports aportan `resolved`;
  desconocidos ⇒ warning + skip.

### JSON (estable, INV-2: sin timestamps)

```json
{
  "settings": { "minSample": 10, "fpThreshold": 0.3 },
  "sources": { "reports": 1, "feedbackFiles": 2, "trackingFiles": 1,
               "ignoredDecisions": 0, "unreviewedTracking": 3 },
  "rules": [
    { "ruleId": "NAMING-001", "sample": 12, "falsePositive": 6,
      "wontfix": 2, "confirm": 3, "resolved": 1,
      "rate": 0.5, "noisy": true }
  ],
  "warnings": ["fingerprint 0a1b… not in reports (skipped)"]
}
```

- `rules` ordenado por `ruleId` asc; `warnings` en orden de procesamiento.
- Console: tabla `RULE SAMPLE FP RATE WONTFIX CONFIRM RESOLVED STATUS` con
  status `noisy | ok | insufficient sample`; warnings a stderr.

### Exit codes

| Exit | Condición                                                            |
| ---- | -------------------------------------------------------------------- |
| 0    | informe producido (aunque haya warnings o reglas noisy)              |
| 2    | flags inválidos, archivos ilegibles/schema inválido, `--output` sin `--format json` |

## 4. Límites (invariantes)

- Sin telemetría ni envío de feedback fuera de la máquina (INV-1/privacidad).
- No calcular porcentajes con muestra insuficiente; el silencio nunca es
  aprobación (`unreviewedTracking` se cuenta, no se interpreta).
- Sin `Date.now()` ni estado no versionado en el resultado (INV-2).
- No escribir packs, skills ni severidades; solo `--output` explícito (INV-5/INV-7).
- Sin contenido de specs en logs: solo fingerprints, ruleIds y paths.

## 5. Criterios de aceptación

- [x] AC-FP.1 Regla con 12 señales revisadas y 6 FP ⇒ `rate 0.5`, `noisy: true`.
- [x] AC-FP.2 Regla con sample < `--min-sample` ⇒ `noisy: false` y status
      `insufficient sample` (nunca "0% FP").
- [x] AC-FP.3 Sin feedback ni tracking resolvido ⇒ `rules: []`, exit 0.
- [x] AC-FP.4 Dedup: el mismo fingerprint en dos feedback files cuenta una vez
      (gana el posterior); feedback gana sobre tracking `resolved`.
- [x] AC-FP.5 `pending`/`in_progress` y `severity_change`/`suggest_rule` no
      afectan sample; aparecen como `unreviewedTracking`/`ignoredDecisions`.
- [x] AC-FP.6 Prefijo de feedback irresoluble o fingerprint de tracking
      desconocido ⇒ warning listado + skip; exit 0.
- [x] AC-FP.7 Determinismo: mismo input ⇒ mismo JSON byte a byte (snapshot).
- [x] AC-FP.8 `--output` solo con `--format json`; escribe solo ese archivo
      (INV-7); combinación inválida ⇒ exit 2.
- [x] AC-FP.9 Flags inválidos / archivo ilegible ⇒ exit 2 con mensaje claro.
- [x] AC-FP.10 `pnpm check` e invariantes verdes (INV-1 sin red nueva).

## 6. Test plan

| Caso                                                       | Tipo     |
| ---------------------------------------------------------- | -------- |
| AC-FP.1/2/3: agregación, muestra mínima, vacío             | unit     |
| AC-FP.4/5: dedup, precedencia, conteos de silencio         | unit     |
| AC-FP.6: warnings honestos (skip, no error)                | unit     |
| AC-FP.7: snapshot determinismo                             | unit     |
| AC-FP.8/9: e2e CLI exit codes + `--output` INV-7           | e2e      |

## 7. Dependencias

- `f3-learn` (loaders de report/feedback, `resolveFingerprint`).
- `f10-dashboard` (formato tracking `{version:1, states}`).
- Sin cambios en engine/skills.

## 8. Riesgos y decisiones abiertas

- Denominador elegido (señales revisadas, no findings emitidos): documenta que
  una regla muy ruidosa pero poco revisada no aparecerá — honesto por diseño.
- Futuro (fuera de alcance): comparar packs entre equipos requeriría compartir
  stats; cualquier export para eso pasa por decisión explícita del dueño.

## Changelog

- 2026-09-30 · Draft inicial desde backlog `f8-elite-100`.
- 2026-09-30 · Dueño aprueba fuentes (feedback + tracking), unidad por
  fingerprint, muestra mínima 10, umbral 0.3, salida informativa no-mutante →
  `ready`. Envolvido en el backlog [f17-diferenciales](../plans/f17-diferenciales.md) (T1 #3).
- 2026-09-30 · M17.1 implementado: `packages/cli/src/fp-stats.ts` + subcomando
  `skills stats` (`packages/cli/src/index.ts`) + tests AC-FP.1…9
  (`packages/cli/test/fp-stats.test.ts`, 12 tests) · `pnpm check` verde ·
  estado → `implementada`.
