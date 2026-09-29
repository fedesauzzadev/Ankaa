# Plan · f9-launch-oss · Papeles de lanzamiento OSS (M9.1, sin publicar)

| Campo        | Valor                                             |
| ------------ | ------------------------------------------------- |
| Specs        | f9-launch-oss                                     |
| Dependencias | Ninguna nueva; `f6-distribution` (formato de key) |

## M9.1 — Licencia + marca + community key + docs

1. `LICENSE.md` + `package.json` (licencia Apache-2.0, autor).
2. Community key (secreto local, jamás commiteado) + roundtrip de verificación.
3. README (lanzamiento + split + key) + índices.
4. `pnpm check` + `verify-pack` → spec `cerrada`.

**DoD:** AC-LO.1—6 verdes; repo privado; nada publicado.

## Notas para el agente

- No pushear, no publicar, no taggear en este milestone.
- El secreto de firma solo vive en env local del dueño.
- Commits sin comillas dobles embebidas (quirk PowerShell).

## Changelog del plan

- 2026-09-28 · Plan inicial (handoff).
