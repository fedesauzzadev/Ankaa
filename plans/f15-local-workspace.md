# Plan · f15-local-workspace · Espacio de trabajo local guiado

| Campo        | Valor                                                                |
| ------------ | -------------------------------------------------------------------- |
| Specs        | f15-local-workspace                                                  |
| Dependencias | ADR-015, `f8-scan-org`, `f10-dashboard`, casos de uso CLI existentes |

## M15.1 — Estado durable y reanudación de `scan-org`

1. Definir e implementar schema versionado de ejecuciones/checkpoints bajo
   `.apigovscan/workspace/`; escrituras atómicas, errores explícitos, sin secrets.
2. Extender `scan-org` con continuación y reanálisis desde cero sin cambiar el
   comportamiento por defecto ni borrar historial.
3. Almacenar resultado/checkpoint por repo y huellas verificables de commit,
   configuración, motor y packs; no reutilizar si la identidad/frescura es
   dudosa.
4. Cubrir interrupción/reanudación, cambios de origen/config, corridas frescas,
   fallos, persistencia y límites INV-7; actualizar ayuda y documentación.

**DoD:** AC-15.7–9 en el alcance de `scan-org`, INV-2/7, tests multi-OS y suite
focalizada verde. Sin endpoints web todavía.

## M15.2 — Operaciones tipadas y progreso

1. Extraer operaciones compartidas por los adapters, sin duplicar lógica CLI.
2. Definir estados de job, progreso estructurado, cancelación y errores.
3. Probar paridad de resultados CLI y operaciones internas.

**DoD:** AC-15.1/2/6 parcial, engine y core sin I/O.

## M15.3 — Workspace web local

1. Extender el server actual conservando `dashboard <report.json>`.
2. Añadir sesiones loopback, Host/Origin/token, rutas allowlist y límites de
   payload/tamaño.
3. Implementar Inicio, nuevo análisis/review, progreso y resultado con UI sin
   CDN ni framework pesado.
4. Añadir e2e y pruebas negativas de seguridad.

**DoD:** AC-15.3–6 verdes; dashboard anterior compatible.

## M15.4 — Historial y comparar

1. Listar runs locales por workspace con estados y fecha de inicio.
2. Abrir resultados íntegros y comparar dos runs compatibles.
3. Explicar incompatibilidad o falta de datos, sin fallback `clean`.

**DoD:** AC-15.9/11, snapshots deterministas.

## M15.5 — Asistente de terminal y CI

1. Añadir `guided` con menú, validación, confirmación y cancelación.
2. Construir catálogo de acciones existentes y preparar CI con preview.
3. Escribir solo archivos seleccionados tras confirmación explícita.

**DoD:** AC-15.2/10, UX de terminal probada sin depender de TTY real.

## M15.6 — Cierre multiplataforma

1. Revisar accesibilidad, rutas Windows, errores, copy y estados vacíos.
2. Ampliar tests de seguridad/invariantes y guía de operación local.
3. Ejecutar `pnpm check`; actualizar estado de spec/índices.

**DoD:** AC-15.1–12.

## Notas

- La selección es continuidad o reanálisis, nunca una actualización silenciosa.
- El dashboard actual continúa como visor de reportes explícitos durante el
  desarrollo de la nueva superficie.
- El shell no se ofrece como API: cada operación web se conecta a un caso de
  uso tipado allowlistado.

## Changelog

- 2026-10-01 · Plan inicial en el orden workspace acordado; M15.1 comienza por
  checkpoints seguros antes de añadir rutas mutantes al servidor.
- 2026-10-01 · M15.1 implementado: historial atómico, lock por organización,
  `--resume`/`--from-scratch`, verificación por SHA/config/versión/pack y
  cobertura e2e más `pnpm check`.
