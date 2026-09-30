# Tasks · f8-scan-repo

Plan: [plans/f8-scan-repo.md](../plans/f8-scan-repo.md) · Spec: [specs/f8-scan-repo.md](../specs/f8-scan-repo.md)

## M8.11 — scan-repo por URL

- [x] Parser estricto de HTTPS/SSH; rechazos de credenciales inline, query/fragment y esquemas no permitidos (AC-SR.1)
- [x] Git shallow clone no interactivo, acotado por timeout y con errores redactados (AC-SR.3)
- [x] CLI `scan-repo` conectado al análisis local y reporters console/JSON (AC-SR.2)
- [x] Limpieza de tempdir / retención segura de `--workdir` y `--out`/`--force` (AC-SR.4–5)
- [x] Tests unit/e2e, INV-1/INV-7 y documentación (AC-SR.6)
- [x] `pnpm check` verde; cerrar spec e índices
