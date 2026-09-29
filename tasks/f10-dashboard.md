# Tasks · f10-dashboard

Plan: [plans/f10-dashboard.md](../plans/f10-dashboard.md) · Spec: [specs/f10-dashboard.md](../specs/f10-dashboard.md)

## M10.1 — visor local + tracking (OSS)

- [x] CLI `dashboard` (loopback, `/`, `/api/report`, `/api/tracking`) + HTML inline con diseño AC-DB.7
- [x] Sidecar tracking + comparador `--against`
- [x] Fixture chica + e2e + INV-7
- [x] README + índices + revisión visual con disaster real
- [x] `pnpm check` verde
- [x] Spec `f10-dashboard` → `cerrada` + índices
- [x] Hint de puerto ocupado con sugerencia a `--port 0` (AC-DB.8) + test e2e

## M10.2 — feedback sin dolor (pendiente, propuesta del dueño 2026-09-29)

Hoy `feedback.json` se escribe a mano (spec f3-learn: "JSON a mano o generado por el usuario"); el dashboard solo trackea local sin afectar el gate. Para que marcar FP/wontfix no sea un dolor:

- [ ] Spec: enmienda menor `f3-learn`/`f10-dashboard` (el dashboard propone texto, nunca escribe skills ni specs: sigue siendo solo clipboard, sin mutación)
- [x] Comando `apigovscan suppress` (f3-learn): atajo sin `feedback.json` a mano — reusa `buildLearnPatch`, acepta prefijos, `--dry-run`, sin gate de licencia
- [ ] Botón "Copy suppress command" por tarjeta: copia `apigovscan suppress --report ... --fingerprint <12> --decision wontfix --reason ...` (reemplaza la idea del JSON: ya no hay archivo a mano)
- [ ] Docs: ejemplo end-to-end dashboard → feedback.json → learn → re-analyze en README/sección dashboard
- [ ] Tests e2e del botón + `pnpm check` verde
