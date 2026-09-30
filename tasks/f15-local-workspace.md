# Tasks · f15-local-workspace

Plan: [plans/f15-local-workspace.md](../plans/f15-local-workspace.md) · Spec:
[specs/f15-local-workspace.md](../specs/f15-local-workspace.md)

## M15.1 — Estado durable y reanudación de `scan-org`

- [x] Definir schema versionado de run, repo y fingerprint de análisis (AC-15.7–8)
- [x] Implementar almacenamiento atómico bajo `.apigovscan/workspace/` (AC-15.7, .11)
- [x] Añadir modos explícitos continuar y desde cero, preservando historial (AC-15.7, .9)
- [x] Verificar revisión remota/config/versión/packs antes de reutilizar resultado (AC-15.8)
- [x] Guardar progreso por repo y resultados completos; recuperarse de ejecución interrumpida (AC-15.6–7)
- [x] Probar resume, fallos, cambios de revisión/config y from-scratch (AC-15.7–9)
- [x] Actualizar ayuda/documentación y mantener comportamiento por defecto (AC-15.1)
- [x] Ejecutar tests focalizados y `pnpm check`

## M15.2 — Operaciones tipadas y progreso

- [ ] Extraer operaciones compartidas para CLI y adapters guiados (AC-15.1–2)
- [ ] Definir estados estructurados, cancelación y progreso real (AC-15.6)
- [ ] Probar paridad de las operaciones con CLI (AC-15.2)

## M15.3 — Workspace web local

- [ ] Añadir `workspace` al server loopback con puerto efímero por defecto (AC-15.3)
- [ ] Validar Host/Origin y token por proceso en mutaciones (AC-15.4)
- [ ] Limitar endpoints a acciones tipadas allowlistadas (AC-15.4)
- [ ] Implementar navegación, selección de origen y confirmaciones (AC-15.3–6)
- [ ] Probar errores, estados de carga, cancelación y seguridad del browser

## M15.4 — Historial y comparación

- [ ] Listar historial persistido sin revelar secrets (AC-15.9, .11)
- [ ] Abrir resultados guardados y comparar dos runs compatibles (AC-15.9)
- [ ] Explicar formatos/resultados no comparables sin declararlos limpios

## M15.5 — Asistente de terminal y CI

- [ ] Añadir `guided` para los flujos implementados (AC-15.2)
- [ ] Añadir catálogo de comandos/acciones existentes (AC-15.1)
- [ ] Previsualizar y confirmar cambios antes de generar configuración CI (AC-15.10)
- [ ] Probar cancelación, rechazos y destinos de salida

## M15.6 — Cierre

- [ ] Revisar accesibilidad y UX en estados vacíos, loading y error
- [ ] Verificar rutas/sesiones en Windows, macOS y Linux (AC-15.12)
- [ ] Verificar INV-1/2/3/4/7 y `pnpm check` (AC-15.12)
- [ ] Actualizar docs/índices y estado de spec al cerrar cada milestone
