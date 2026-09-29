# f1-invariants · Invariantes como gates de CI

| Campo         | Valor                                           |
| ------------- | ----------------------------------------------- |
| Estado        | implementada                                    |
| Fase          | 1 (corre sobre todo el MVP)                     |
| Deriva de     | SDD §5 invariantes INV-1…INV-7, NFR-01/05/06/08 |
| Cross-cutting | Sí                                              |

## 1. Objetivo

Convertir los invariantes del SDD en **tests y checks automáticos** que fallan el build si alguien los rompe. No son "tests de features": son la cinta métrica del producto.

## 2. Alcance

### Dentro

- Suite `test:invariants` ejecutada en CI en cada PR.
- Cobertura mínima:

| ID    | Qué verificar en f1                                           |
| ----- | ------------------------------------------------------------- |
| INV-1 | Cero red en analyze/parse/engine (stub global)                |
| INV-2 | Determinismo de report/findings                               |
| INV-3 | `@apigovscan/core` sin dependencias/código LLM ni net         |
| INV-4 | No `eval`/`Function`/`vm`; DSL estricta                       |
| INV-5 | Fingerprint estable (base de learn futuro); sort idempotente  |
| INV-6 | Todo reporte lleva `packs[].version`                          |
| INV-7 | Solo escrituras en rutas autorizadas (test de FS con tempdir) |

### Fuera

- Learn idempotente completo (INV-5 full) → spec f3 (fase 2).
- Verificación de pin en CI de usuarios → Action f5.

## 3. Contrato

### Comando

```bash
pnpm test:invariants
```

Ejecuta (nombres orientativos):

```
invariants/
  no-network.test.ts
  determinism.test.ts
  no-eval.test.ts
  core-purity.test.ts
  report-meta.test.ts
  fs-boundary.test.ts
  pack-embed.test.ts
```

### INV-1 · no-network

**Mecanismo:**

1. Setup global: reemplazar `globalThis.fetch`, `XMLHttpRequest`, `WebSocket` por funciones que **lanzan** `new Error("NETWORK_CALL_FORBIDDEN")`.
2. Para Node: también enganchar `net.Socket.prototype.connect` o usar approach de test que falle si se abre socket (implementación práctica: `node:http`/`https` request interceptado + `net.connect` spy que throw).
3. Ejecutar: `parseSpec` sobre fixtures + `evaluate` con pack elite + `buildReport` + `formatConsole/formatJson` + e2e `analyze` vía CLI si es posible en el mismo proceso o subprocess con `NODE_OPTIONS` de preload que instala el stub.

**AC:**

- [ ] Cualquier llamada a red ⇒ test falla con `NETWORK_CALL_FORBIDDEN`.
- [ ] Happy path completo de análisis no dispara el stub.
- [ ] Corre en la matriz OS completa.

### INV-2 · determinism

- Mismo Spec + mismos packs ⇒ `evaluate` dos veces ⇒ deep equal.
- Shuffle de claves de entrada del report builder ⇒ mismo `reportHash`.
- E2E: dos `analyze` sobre fixture ⇒ mismo `reportHash` en JSON.

### INV-3 · core sin LLM / sin net

- Lint/`@apigovscan/core`:
  - banned import patterns: `node:http*`, `node:net`, `node:dgram`, `fetch` (identifier), `undici`, `openai`, `@anthropic-ai/*`, `@modelcontextprotocol/*`
- Sin package.json dependency de core que sea cliente HTTP/IA (allowlist vacía).

### INV-4 · no eval

- Grep/AST en CI (`pnpm test:no-eval` o lint rule): bans `eval(`, `new Function(`, `vm.runIn`, `child_process` en `packages/core/**` y en path caliente de `openapi`.
- Fixture con YAML tag maliciosa ⇒ error controlado (ya en openapi AC).

### INV-5 (mínimo f1) · fingerprints estables

- `computeFingerprint` golden.
- `sortFindings` idempotente: `sort(sort(x)) ≡ sort(x)` y shuffle in → mismo out.
- _(f3 extiende: learn twice ⇒ same skills state.)_

### INV-6 · packs versionados

- Todo finding y todo `Report.packs[]` tiene `version` non-empty match `/^\d{4}\.\d{2}(\.\d+)?$/` (CalVer) o semver de pack dev (`0.0.0-dev` solo en tests de engine suelto — **pack elite** siempre CalVer).
- Build de report sin packs ⇒ throw en `buildReport`.

### INV-7 · fs boundary

- Unit: use case con `ReportSink` mock y loader en tempdir; spy en `fs.writeFile`/`mkdir`: solo rutas bajo tmpdir out y `.apigovscan` (aunque f1 aún no escribe skills, el gate prepara).
- No hay escrituras en el directorio del spec al correr `analyze` (stat mtime + lista de archivos pre/post).

### `packs-embed` · pack dentro del CLI

- Test: `node -e` o import del cli dist **sin** `packs/` externo montado (corre desde dist con files embebidos) ⇒ `analyze` funciona. Simula npx.

## 4. Criterios de aceptación (gate global f1)

- [x] **AC-I.1** `pnpm test:invariants` verde en CI matriz OS.
- [x] **AC-I.2** Un PR que introduzca `fetch` en core rompe CI (demostrado: test falla en rama de prueba o lint rule documentado).
- [x] **AC-I.3** Cobertura lista INV-1..7 en f1 documentada arriba; gaps → issues con due date antes de cerrar fase.
- [x] **AC-I.4** Runtime de suite invariants < 60 s en CI shared runners (si se excede, marcar heavy y justificar).
- [x] **AC-I.5** Ningún archivo de `cli/src`/`core/src` importa dos símbolos distintos bajo el mismo nombre local (shadowing silencioso en el bundle; gate `no-duplicate-imports.test.ts`).

## 5. Test plan

- Cada archivo de invariant con su fixture más barata posible.
- Job CI dedicado `invariants` (no solo dentro de `pnpm test`) para visibilidad.
- Artefacto: en failure, dump de stack sin contenido de specs.

## 6. Dependencias

- Features f1 implementadas (corre sobre ellas); se puede ir construyendo el harness en paralelo desde f0 (INV-3/4 ya desde f0).
- Orden recomendado: INV-3/4 desde f0; INV-1/2/5/6/7 al integrar analyze.

## 7. Riesgos y decisiones abiertas

| Tema                               | Decisión                                                     |
| ---------------------------------- | ------------------------------------------------------------ |
| Stub de red en subprocess e2e      | preload `--import` con stub + env `APIGOVSCAN_TEST_NO_NET=1` |
| Falsos positivos de no-eval (deps) | aplicar solo a nuestro código, no a `node_modules`           |
| Windows                            | evitar bash-isms en scripts invariants                       |

## Changelog

- 2026-09-23 · Spec creado desde SDD v1.0.
- 2026-09-24 · M1.5: suite `tests/invariants/{full,fs-boundary}.test.ts` cubre INV-1…7 + pack embed; CI job `invariants` en matriz OS; AC-I.1…4 verdes. Estado → `implementada`.
- 2026-09-28 · AC-I.5: gate contra shadowing silencioso de imports (un `loadReportFile` de `learn.js` tapaba al de `dashboard.js` en el bundle sin que `tsc`/eslint avisaran; detectado en M10.1).
