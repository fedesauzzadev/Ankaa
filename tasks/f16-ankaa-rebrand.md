# Tasks · f16-ankaa-rebrand

Spec: [f16-ankaa-rebrand](../specs/f16-ankaa-rebrand.md) ·
Plan: — (spec directa)

## M16.0 — Prerrequisitos (ops + baseline dorada)

- [ ] Verificar disponibilidad de dominio `ankaa.dev` / `ankaa.io` y hacer
      screening rápido de marca (clases 9/42); documentar resultado en la spec
      (riesgos).
- [ ] Con el build actual (pre-rename), correr `analyze` sobre el corpus de
      fixtures y guardar findings ordenados + fingerprints como baseline dorada
      (insumo del test de AC-16.6).
- [ ] Crear allowlist inicial del grep-gate (changelogs históricos, tags,
      spec f16, changelogs al pie de specs afectadas).

## M16.1 — Identidad npm y bin (AC-16.1)

- [ ] `git mv` del bin: `packages/cli/bin/apigovscan.js` → `bin/ankaa.js`;
      actualizar `bin` en `packages/cli/package.json`.
- [ ] Renombrar scope en los 10 `package.json` (`@apigovscan/*` → `@ankaa/*`)
      y las referencias `workspace:*` + imports `@apigovscan/` en src y tests.
- [ ] Renombrar bundle esbuild `dist/apigovscan.mjs` → `dist/ankaa.mjs` y el
      banner `__apigovscanCreateRequire` → `__ankaaCreateRequire` en el script
      de build.
- [ ] Actualizar descripción/author/repository de `packages/cli/package.json`
      (marca Ankaa; la URL del repo se completa en M16.8).
- [ ] Verificar `ankaa --help` local con branding nuevo y exit codes 0/1/2
      intactos.

## M16.2 — Config, env y `.ankaa/` (AC-16.2, 16.3, 16.4)

- [ ] `config.ts`: búsqueda automática `ankaa.yaml` / `ankaa.yml`; eliminar
      detección de `apigovscan.yaml|.yml`.
- [ ] `init.ts`: scaffold de `ankaa.yaml` y `.ankaa/skills/` (constantes
      `CONFIG_KEY` y defaults de `skillsDir`).
- [ ] Renombrar defaults de directorios: `.apigovscan/` → `.ankaa/`
      (skills, baseline, workspace de scan-org).
- [ ] Renombrar env vars en src (`index.ts`, `license.ts`, `llm.ts`):
      `ANKAA_LICENSE_KEY`, `ANKAA_LICENSE_SECRET`, `ANKAA_LLM_*`; sin
      fallbacks legacy.
- [ ] Actualizar SDD: texto de INV-7 (`.ankaa/`) y glosario/marca.
- [ ] Actualizar tests de invariantes (`fs-boundary`, imports `@ankaa/*`,
      `setup-license.ts` de `tests/invariants`).

## M16.3 — Licencias (AC-16.5)

- [ ] Confirmar que `KEY_RE` y la emisión `AGS-…` quedan intactas.
- [ ] Actualizar mensajes de ayuda/error de `license.ts` e `index.ts` para
      citar `ANKAA_LICENSE_KEY` y `ankaa.yaml`.
- [ ] Test: la community key pública del README sigue validando.
- [ ] Tests negativos: `APIGOVSCAN_LICENSE_KEY` seteada ⇒ missing license
      (no se lee); ídem `APIGOVSCAN_LLM_*`.

## M16.4 — Reporters y determinismo (AC-16.6, 16.7)

- [ ] `console.ts`: encabezado `Ankaa`; `markdown.ts`: `# Ankaa report`.
- [ ] `build.ts`: `name: "ankaa"` (constante del paquete y `tool.name` del
      JSON canónico).
- [ ] `sarif.ts`: `driver.name`, propiedades `ankaa/*` y `ankaaFingerprint`.
- [ ] Test dorado: diff de findings+fingerprints pre/post rename = vacío
      sobre la baseline de M16.0; congelar `reportHash` nuevo en snapshots.
- [ ] Actualizar snapshots afectados (report/score/markdown/formats).
- [ ] Renombrar env vars en toda la suite e2e (license, mcp, fix, drift,
      scan-org, scan-repo, review, rules-import, action) y en
      `packages/cli/test/setup-license.ts`.

## M16.5 — Action, workflows y distribución (AC-16.8)

- [ ] `action/action.yml`: branding/URL Ankaa; inputs/outputs sin cambios
      contractuales.
- [ ] Renombrar workflows (`apigovscan.yml` → `ankaa.yml`) y actualizar el
      job que inyecta `ANKAA_LICENSE_KEY` (test `action.e2e.test.ts`).
- [ ] Tarball `ankaa-cli-<version>.tgz`: scripts de release, `docker/Dockerfile`
      (`--build-arg TARBALL`) y docs de instalación.
- [ ] README del Action y ejemplos de `uses:`/badges apuntando al path nuevo.

## M16.6 — Docs y specs al pie (AC-16.10)

- [ ] README raíz: título, quickstart (`node packages/cli/bin/ankaa.js`),
      comandos, sección licencia/MCP, badges.
- [ ] `docs/01–06` + `docs/SDD.md` (marca, INV-7, glosario) y `AGENTS.md`.
- [ ] `examples/apigovscan.yaml` → `examples/ankaa.yaml` + referencias.
- [ ] Nota al pie en changelog de `f2-config`, `f3-init`, `f3-skills`,
      `f3-learn`, `f6-distribution`, `f9-launch-oss`, `f15-local-workspace`.
- [ ] Nota de migración manual en README (mover `.apigovscan/` con `git mv`
      en Windows case-insensitive).

## M16.7 — Gates y cierre (AC-16.9, 16.12)

- [ ] Implementar grep-gate de CI (`apigovscan|ApiGovScan|APIGOVSCAN_` con
      allowlist) y dejarlo corriendo en la matriz.
- [ ] `pnpm check` verde (lint + typecheck + test + build + invariants) en
      Linux/macOS/Windows.
- [ ] Marcar ACs cerrados en la spec y actualizar estado/changelog de la spec.

## M16.8 — Rename del repo + dogfood (AC-16.11)

- [ ] Renombrar `github.com/fedesauzzadev/ApiGovScan` → `Ankaa` (GitHub
      redirect cubre clones viejos).
- [ ] Actualizar `repository.url` de packages, badges, `uses: ./action` docs
      y URLs de `npm.pkg.github.com` (`@ankaa/*`).
- [ ] Correr el workflow dogfood del repo sobre sí mismo post-rename y
      verificar el release de `@ankaa/cli` en el registry privado.
