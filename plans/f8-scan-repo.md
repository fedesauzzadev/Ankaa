# Plan · f8-scan-repo · Analizar repositorio individual por URL

| Campo        | Valor                        |
| ------------ | ---------------------------- |
| Specs        | `f8-scan-repo`               |
| Dependencias | `f8-scan-org`, Git instalado |

## M8.11 — Clone explícito + analyze

1. Parser/validador URL HTTPS/SSH y `cloneRepo` no interactivo con timeout y
   errores redactados.
2. Comando `scan-repo` con tempdir seguro/cleanup, o `--workdir` explícito.
3. Reporters console/JSON, `--out`/`--force` y help.
4. Tests unit, e2e de pipeline con stub Git, limpieza, INV-1/INV-7 y docs.
5. `pnpm check` verde → spec cerrada.

**DoD:** AC-SR.1–6 verdes en Node soportado.
