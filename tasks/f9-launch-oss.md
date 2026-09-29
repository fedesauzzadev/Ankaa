# Tasks · f9-launch-oss

Plan: [plans/f9-launch-oss.md](../plans/f9-launch-oss.md) · Spec: [specs/f9-launch-oss.md](../specs/f9-launch-oss.md)

## M9.1 — papeles de lanzamiento OSS (sin publicar)

- [x] `packages/cli/LICENSE.md` → Apache-2.0 + copyright; `license`/`author` en `package.json` (raíz + cli + resto de packages unificados)
- [x] Community key con secreto local (no commitear secreto) + roundtrip `license --key` + `analyze` mismo `reportHash`
- [x] README sección lanzamiento + split OSS/pago + key comunitaria
- [x] Grep de secreto + repo sigue privado + sin publish
- [x] `pnpm check` verde + `verify-pack` OK
- [x] Spec `f9-launch-oss` → `cerrada` + índices

## M9.2 — quitar licencia en edición gratuita (pre-público, pendiente)

Decisión del dueño (2026-09-29): la versión gratuita no debe pedir licencia.

- [ ] Decisión previa (bloqueante, sin código hasta cerrarla): ¿quitar el gate total en OSS o mantener community key como activación? Registrar en ADR o enmienda de `f6-distribution`/`f9-launch-oss` (AGENTS.md: sin spec `ready` no hay código)
- [ ] Specs: actualizar `f6-distribution` (gates por comando), `f9-launch-oss` (split OSS/pago) y SDD si cambia el modelo de distribución
- [ ] Implementar: retirar `checkLicense` de `runAnalyze`, `runMcpCommand`, `runFixCommand`, `runDriftCommand`, `runScanOrgCommand`, `runRulesImport`; mantener el comando `license` para la edición empresarial
- [ ] Tests: actualizar `license.e2e` (los gates que caen), `verify-pack` sin key, boundary/INV intactos, `pnpm check` verde
- [ ] Docs: README (instalación sin key), `docs/05 §3`, help texts que mencionan licencia, ejemplos y Action sin `license-key` requerida
- [ ] Release: tarball + Docker + Action funcionando sin key; grep de secretos (`APIGOVSCAN_LICENSE_SECRET`, keys reales); tag de versión pública
- [ ] Publicar: push público + publish en registry (decisión explícita del dueño; hoy prohibido por F9) + settings del repo (secretos, branches, SECURITY.md vigente)
