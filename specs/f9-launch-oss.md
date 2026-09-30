# f9-launch-oss · Lanzamiento open source gratuito (papeles, sin publicar)

| Campo     | Valor                                                                                              |
| --------- | -------------------------------------------------------------------------------------------------- |
| Estado    | cerrada                                                                                            |
| Fecha     | 2026-09-28                                                                                         |
| Fase      | 9 (lanzamiento OSS; ejecuta sobre f8 cerrado)                                                      |
| Deriva de | `f8-oss-differentials` (M8.1–M8.9 cerradas); `f6-distribution` (privado actual); dueño de producto |

## 1. Objetivo / user story

Como dueño de producto quiero que ApiGovScan pueda publicarse como **open source gratuito** con mi sello, sin romper nada del producto privado ni publicar nada todavía. Este slice deja los papeles listos (licencia, marca, key comunitaria, docs) y **prohíbe expresamente** el push público y el publish en este milestone.

**Regla de oro:** cero cambios de motor, cero cambios de contrato, cero red nueva. Solo papeles + marca + verificación.

## 2. Alcance

### In

- **Licencia Apache-2.0** (decisión reversible hasta publicar): `packages/cli/LICENSE.md` pasa de propietaria a Apache-2.0 con `Copyright (c) 2026 fedesauzzadev`; `package.json` raíz y de packages: `license: "Apache-2.0"`, campo `author` con el handle del vendor. (Si el dueño prefiere MIT, es un reemplazo 1:1 antes de publicar.)
- **Sello del autor**: banner `apigovscan --version` ya muestra la herramienta; README suma autor + link al repo + badge de licencia. Nada de telemetría ni phone-home (INV-1 intacto en ambas versiones).
- **Community key sin código nuevo**: se genera UNA key `AGS-community-<expiry>-<sig>` con el secreto privado del vendor (el secreto jamás se commitea; vive solo en `APIGOVSCAN_LICENSE_SECRET` local). La key se publica en el README porque es verificable offline y no permite forjar otras (HMAC). El gate `analyze`/`mcp` sigue idéntico: la key comunitaria pasa como cualquier key válida.
- **Split documentado** (propuesta, a confirmar por el dueño): OSS = analyze multi-protocolo + elite + custom a mano + baseline + skills + reporters + Action + MCP + score + features LLM trae-tu-key + `scan-org` local. Pago = packs por cliente + self-host registry + edge + soporte (F7).
- **Tests**: `pnpm check` verde + `verify-pack` OK + roundtrip `apigovscan license --key <community>` exit 0 + `analyze` con community key sobre `fixtures/` byte-idéntico al run con dev key (mismo `reportHash`).
- Docs: README sección lanzamiento + índices.

### Out (expresamente prohibido en este slice)

- Push público a GitHub, publish a npm público, tags de release.
- Cambiar el secreto de licencia o commitearlo.
- Tiers en el código (el gate sigue válido/inválido, sin niveles).
- Post de LinkedIn (vive fuera del repo, en temp del dueño).
- Tocar `engine`, packs o DSL.

## 3. Contrato

```ts
// Sin cambios de código. Solo archivos:
// packages/cli/LICENSE.md (Apache-2.0 + copyright)
// package.json: { license: "Apache-2.0", author: "fedesauzzadev <url>" }
// README.md: sección lanzamiento + community key + split OSS/pago
```

- Community key: `scripts/gen-license.mjs --customer community --expiry <YYYYMMDD>` (el secreto NO se commitea; la key sí, en README).
- Verificación: `apigovscan license --key AGS-community-...` → `customer community · valid`, exit 0.

## 4. Criterios de aceptación

- [ ] AC-LO.1: `LICENSE.md` Apache-2.0 con copyright del autor; `license`/`author` en `package.json`.
- [ ] AC-LO.2: community key valida offline (`license --key` exit 0) y `analyze` con ella da el mismo `reportHash` que con dev key.
- [ ] AC-LO.3: el secreto de firma no aparece en ningún archivo commiteado (grep en CI/manual).
- [ ] AC-LO.4: README con sección lanzamiento + split OSS/pago + key comunitaria.
- [ ] AC-LO.5: `pnpm check` verde + `verify-pack` OK; repo sigue privado (verificación manual: `gh repo view` = private).
- [ ] AC-LO.6: sin push público ni publish (verificación manual).

## 5. Test plan

`pnpm check` + `verify-pack` + roundtrip de licencia (comando real, exit codes) + grep de secreto (`APIGOVSCAN_LICENSE_SECRET`, `ags-verify` solo en tests/setup esperados).

## 6. Dependencias

- Ninguna nueva. `f6-distribution` (formato de key), `f8-*` (producto a lanzar).

## 7. Riesgos y decisiones abiertas

| Tema                  | Decisión v1                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Apache-2.0 vs MIT     | Apache-2.0 por default (patent grant, estándar infra); MIT es reemplazo 1:1 si el dueño lo pide antes de publicar. |
| Nombre real vs handle | Se usa el handle `fedesauzzadev` (ya en LICENSE actual); el dueño confirma el nombre legal antes del publish.      |
| Community key abusada | Aceptado: es verificable pero no forjable; no da acceso a nada (el análisis es local).                             |
| Secreto filtrado      | Si el secreto se filtra, rotar: re-emitir keys (enterprise) + nueva community key; documentado, no codeado.        |

## Changelog

- 2026-09-28 · Spec creada en `ready` a pedido del dueño (slice solo-papeles; publicar queda para después).
- 2026-09-28 · M9.1 implementado → `cerrada` (AC-LO.1–6 verdes; `pnpm check` + `verify-pack` OK; repo privado; nada publicado). Extra: sub-packages unificados a Apache-2.0 + autor (estaban en MIT).
- 2026-10-01 - Ankaa rename (f16): the brand is now Ankaa; the public community key is unchanged and still validates. No legacy aliases; see specs/f16-ankaa-rebrand.md.
