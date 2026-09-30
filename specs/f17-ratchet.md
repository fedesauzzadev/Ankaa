# f17-ratchet · Gate de deuda no creciente + burn-down

| Campo     | Valor                                                        |
| --------- | ------------------------------------------------------------ |
| Estado    | draft                                                        |
| Fase      | 17                                                           |
| Fecha     | 2026-09-30                                                   |
| Deriva de | [f2-baseline](f2-baseline.md); INV-2; historial `f8-scan-org`/`f15` |

## 1. Objetivo / user story

Como tech lead, congelé la deuda en un baseline, pero necesito que **no vuelva
a crecer** y que se vea bajando: los ignore-files de otros linters solo crecen
y nadie paga deuda. Quiero un gate que falle si entra deuda neta nueva, y
tendencia visible por repo.

## 2. Alcance (in / out)

### In

- `ankaa analyze <path> --baseline --ratchet`: exit `1` si
  `newFindings - resolvedFindings > 0` para la severidad del gate.
- `--ratchet-severity error|warning` (default `error`).
- `summary.ratchet {newCount, resolvedCount, netDelta}` en report JSON.
- `scan-org`: columna de tendencia por repo calculada desde el historial
  local (`.ankaa/workspace/`), determinista (sin timestamps en el cálculo).
- Dashboard: netDelta del run contra el anterior en la vista de comparación.

### Out

- Auto-fix de deuda; bloqueo por warnings por default; red.
- Cambiar cómo se computan los fingerprints de findings (se reusan).

## 3. Contrato (interfaces, schemas, UX)

- Cálculo por diferencia de fingerprints no suprimidos entre corrida actual y
  baseline. Fingerprints desaparecidos por refactor cuentan como resolved:
  aceptado y documentado.
- Interacción con `--fail-on`: ratchet se evalúa después de supresiones; el
  exit code final es el más severo de ambos gates.

## 4. Criterios de aceptación (preliminares)

- [ ] AC-RA.1 Deuda neta +1 (error) → exit 1 con `summary.ratchet` correcto.
- [ ] AC-RA.2 Neta ≤ 0 → exit 0 aunque persistan findings del baseline.
- [ ] AC-RA.3 Baseline faltante/corrupto con `--ratchet` → exit 2.
- [ ] AC-RA.4 Determinismo: mismo input + mismo baseline ⇒ mismo netDelta.
- [ ] AC-RA.5 `scan-org` muestra tendencia reproducible en fixtures con
      historial sintético.
- [ ] AC-RA.6 Docs con la matriz `fail-on` × `ratchet`.

## 5. Test plan

- Fixtures de baseline: deuda sube / baja / igual; e2e exit codes; snapshots;
  scan-org con historial sintético bajo `.ankaa/workspace/`.

## 6. Dependencias

- `f2-baseline` (cerrada), fingerprints (INV-2), historial de `scan-org` (f15).

## 7. Riesgos y decisiones abiertas

- Confusión `fail-on` vs `ratchet`: mitigar con docs y mensajes claros.
- ¿Gate por severidad única o acumulada? Propuesta: solo la severidad del gate.
- Fingerprints "resueltos" por renombres de rutas: documentar honestamente.

## Changelog

- 2026-09-30: draft inicial desde el backlog f17
  ([plan](../plans/f17-diferenciales.md)).
