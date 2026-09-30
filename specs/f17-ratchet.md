# f17-ratchet · Gate de deuda no creciente (ratchet)

| Campo     | Valor                                                        |
| --------- | ------------------------------------------------------------ |
| Estado    | implementada                                                     |
| Fase      | 17                                                           |
| Fecha     | 2026-09-30                                                   |
| Deriva de | [f2-baseline](f2-baseline.md); INV-2; historial `f8-scan-org`/`f15` |

## 1. Objetivo / user story

Como tech lead, congelé la deuda en un baseline, pero necesito que **no vuelva
a crecer** y que se vea bajar: los ignore-files de otros linters solo crecen y
nadie paga deuda. Quiero un gate que falle si entra deuda neta nueva, con los
números visibles en el reporte.

## 2. Decisiones (2026-09-30, delegadas por el dueño con el arranque de T2)

| Tema                       | Decisión                                                                    |
| -------------------------- | --------------------------------------------------------------------------- |
| Severidad del gate         | Default `error`; `--ratchet-severity error\|warning` (una sola severidad)   |
| Cálculo                    | `newCount` = findings visibles post-baseline con severidad ≥ gate; `resolvedCount` = fingerprints del baseline ausentes de los findings actuales (post-skills); `netDelta = new − resolved` |
| Skills                     | Un fingerprint del baseline silenciado por skills cuenta como resuelto (no aparece mientras viva la suppression) — documentado |
| Exit                       | `netDelta > 0` ⇒ exit 1 (combinado con `--fail-on`: gana el más severo)     |
| Requisito                  | `--ratchet` exige modo baseline lectura (`--baseline` o config `baseline.enabled`) |

## 3. Contrato

```bash
ankaa analyze ./specs --baseline --ratchet                     # gate error
ankaa analyze ./specs --baseline --ratchet --ratchet-severity warning
```

- Report JSON: `summary.ratchet { newCount, resolvedCount, netDelta }`
  (presente solo con `--ratchet`; entra al `reportHash` — determinista).
- Console/markdown: `(ratchet: +N new · M resolved · net +X)` en la línea de
  resumen.
- Exit codes: además de los de `analyze`, `--ratchet` sin baseline lectura ⇒
  exit 2; `--ratchet-severity` inválido o sin `--ratchet` ⇒ exit 2.

## 4. Alcance (in / out)

### In (M17.4)

- Flags `--ratchet` / `--ratchet-severity` en `analyze`.
- Cálculo puro (`computeRatchetStats`) reutilizable y testeable.
- `summary.ratchet` en JSON + nota en console y markdown.
- Matriz de interacción `fail-on` × `ratchet` documentada.

### Out (v0) — follow-up M17.5 (presentation sobre historial existente)

- Columna de tendencia por repo en `scan-org` (requiere historial
  `.ankaa/workspace/`).
- netDelta del run contra el anterior en la vista de comparación del
  dashboard.
- Ratchet por severidades acumuladas o por dominio.

## 5. Criterios de aceptación

- [x] AC-RA.1 Deuda neta +1 al gate ⇒ exit 1 con `summary.ratchet` correcto.
- [x] AC-RA.2 Neta ≤ 0 ⇒ exit 0 aunque persistan findings del baseline
      (visibles como `suppressed`).
- [x] AC-RA.3 `--ratchet` sin baseline lectura, o `--ratchet-severity`
      inválido/sin `--ratchet` ⇒ exit 2.
- [x] AC-RA.4 Determinismo: mismo input + mismo baseline ⇒ mismo `netDelta` y
      mismo `reportHash`.
- [x] AC-RA.5 Gate `warning` cuenta warnings+errors; baseline entry silenciado
      por skills cuenta como resuelto (test explícito).
- [x] AC-RA.6 Console y markdown muestran la nota ratchet; docs con la matriz
      `fail-on` × `ratchet`.
- [x] AC-RA.7 `pnpm check` e invariantes verdes.

## 6. Test plan

| Caso                                                       | Tipo |
| ---------------------------------------------------------- | ---- |
| `computeRatchetStats`: sube/baja/igual, gate warning, skills | unit |
| e2e: baseline → ratchet limpio → deuda nueva (exit 1) → mejora (exit 0) | e2e |
| usage/validaciones exit 2, determinismo, nota console       | e2e  |

## 7. Dependencias

- `f2-baseline` (cerrada), fingerprints (INV-2), summary/reportHash de
  `f1-reporters`.

## 8. Riesgos y notas

- Fingerprints "resueltos" por renombres de rutas cuentan como resueltos:
  aceptado y documentado (honesto, mismo criterio que baseline).
- `summary.ratchet` cambia el `reportHash` respecto de corridas sin
  `--ratchet` — esperado: el reporte declara cómo se calculó.

## Changelog

- 2026-09-30: draft inicial desde el backlog f17.
- 2026-09-30: decisiones resueltas por delegación del dueño (arranque T2):
  gate default `error`, severidad única, skills cuentan como resueltos.
  Scope v0 = gate + reporte; trends de scan-org/dashboard movidos a follow-up
  M17.5 con changelog → `ready`.
- 2026-09-30 · M17.4 implementado: `computeRatchetStats` en `baseline.ts` +
  flags `--ratchet`/`--ratchet-severity` + `summary.ratchet` (hashed) + nota
  console/markdown + exit combinado + 8 tests (AC-RA.1…6) · `pnpm check`
  verde · estado → `implementada`. Matriz `fail-on` × `ratchet`: exit final es
  el más severo — `--fail-on` por findings visibles, ratchet por deuda neta;
  ambos se aplican sobre findings post-supresiones.
