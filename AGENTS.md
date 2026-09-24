# AGENTS.md · Convenciones para agentes en ApiGovScan

Guía para humanos y agentes (opencode, Claude, Cursor, etc.) que trabajen en este repo.

## 0. Orden de lectura (obligatorio antes de codear)

1. [README.md](README.md)
2. [docs/SDD.md](docs/SDD.md) — contrato de producto, invariantes, roadmap
3. Spec de la feature que vas a tocar en [specs/](specs/README.md)
4. Plan + tasks en [plans/](plans/README.md) y [tasks/](tasks/README.md)
5. ADRs en [docs/02-arquitectura.md](docs/02-arquitectura.md) si la decisión es arquitectónica

**No** implementes features sin spec `ready`. Si falta spec, pide crearla primero.

## 1. Principios no negociables (del SDD)

| Invariante | Regla práctica |
|---|---|
| INV-1 | Cero red en `analyze` / parse / engine. No agregar `fetch`, axios, update-check. |
| INV-2 | Determinismo: sin `Date.now()`/`Math.random()` en el hash de findings; sort estable. |
| INV-3 | Core sin LLM ni clientes de IA. |
| INV-4 | No `eval`, no `new Function`, no código arbitrario desde specs/rules. |
| INV-5 | Fingerprint estable; learn idempotente (fase 2+). |
| INV-7 | Escribir FS solo en `.apigovscan/` y outputs explícitos del usuario. |

Si un cambio viola un invariante → **detente** y pide ADR/SDD update. No "raras excepciones".

## 2. Stack y comandos

- TypeScript strict, ESM, Node ≥ 20, pnpm workspaces.
- Tests: Vitest. Lint: ESLint + Prettier.
- Comandos raíz:

```bash
pnpm install
pnpm build
pnpm test
pnpm lint
pnpm typecheck
pnpm ci              # lint + typecheck + test + build
pnpm test:invariants # gates INV-*
```

## 3. Estructura del código

```
packages/
  core/        # domain puro — SIN node:fs, net, http, fetch
  openapi/     # parse + normalizar → Spec
  reporters/   # console + json (+ futuros)
  cli/         # adaptador: argv, FS, exit codes, bin
  mcp/         # tools MCP (stdio)
packs/elite/   # rule packs YAML versionados
fixtures/      # specs de prueba y de ataque
docs/ specs/ plans/ tasks/
```

Dependencias: `cli/mcp → application(core) → core`; los adapters inyectan I/O. Nada de `core → adapters`.

## 4. Estilo de cambios

- **Ids y código en inglés.** Docs y SDD en español. Mensajes de findings/`message` de reglas: **inglés** (consumer CI global).
- Commits convencionales: `feat:`, `fix:`, `docs:`, `test:`, `chore:`, `refactor:` (Conventional Commits).
- Un PR = un milestone o un slice coherente; enlaza `AC-x.y` que cierra.
- No reescribas specs viejos para justificar código; actualiza spec + changelog al pie si el alcance cambia.
- Sin comentarios innecesarios en código; nombres que expliquen.
- No commitear secrets, `.env` reales, ni specs de clientes con datos sensibles.

## 5. Al agregar una regla elite

1. Siguiar [specs/f1-elite-pack.md](specs/f1-elite-pack.md) (id, category taxonomy, source obligatorio).
2. `validateRule` debe pasar; añadir test de impacto en fixtures si es ruidosa.
3. Si falta un átomo de DSL → extender whitelist en `f1-engine` (spec primero, luego código).
4. Actualizar `CHANGELOG.md` del pack.

## 6. Al tocar el engine / DSL

- Whitelist estricta; unknown op = error, no ignore silencioso.
- Specs primero: edita `specs/f1-engine.md` si cambia contrato público (`evaluate`, fingerprint, sort).

## 7. Tests esperados

| Cambio | Test mínimo |
|---|---|
| Átomo DSL | true + false |
| Regla nueva | fixture donde matchea + una donde no |
| Parse/normalize | fixture + ataque si aplica |
| CLI flag | e2e exit code |
| Cualquier PR | `pnpm ci` + `pnpm test:invariants` verde en matriz CI |

No borres snapshots de determinismo "porque flaquean": investiga (INV-2).

## 8. Privacidad y seguridad

- Specs de usuarios: jamás subirlos, loguear bodies, ni meterlos en URLs.
- Logs: paths, ruleIds, pointers — no ejemplos completos.
- Dependencias nuevas: justificar en PR (supply chain); `ignore-scripts`.

## 9. Qué NO hacer (anti-alcance del SDD)

- No reescribir specs/código del usuario (solo sugerir fixes en texto).
- No añadir telemetría.
- No auto-actualizar packs en `analyze`.
- No meter frameworks pesados en `core`.
- No expandir alcance a portal/gateway/catalog sin nuevo ADR.

## 10. Flujo sugerido para el agente

```
1. Leer spec target + tasks correspondientes
2. Marcar en tasks/ lo que vas a hacer [ ]
3. Implementar slice + tests
4. pnpm ci && pnpm test:invariants
5. Actualizar AC cumplidos en tasks y estado de spec
6. Redactar commit/PR con referencia a AC
```

Si algo del SDD/spec es ambiguo → **pregunta**, no elijas en silencio.
