# f16-ankaa-rebrand · Rebranding ApiGovScan → Ankaa

| Campo     | Valor                                                                                          |
| --------- | ---------------------------------------------------------------------------------------------- |
| Estado    | ready                                                                                          |
| Fecha     | 2026-10-01                                                                                      |
| Fase      | 16                                                                                             |
| Deriva de | Decisión de producto 2026-09-30 · Auditoría de disponibilidad GitHub/npm 2026-09-30 · `f6-distribution` (licencias) · `f9-launch-oss` (marca, cerrada sin publicar) · INV-7 (directorio de escritura) |

## 1. Objetivo / user story

Como equipo queremos rebautizar el producto **ApiGovScan → Ankaa** con un rename
big-bang **antes de la primera publicación pública** (f9 cerrada "sin publicar"),
aprovechando que hoy no existen consumidores externos del scope npm, bin,
config ni env vars. No se mantienen alias legacy.

### Por qué Ankaa (resumen de la auditoría de nombre, 2026-09-30)

- **Qué es:** Alpha Phoenicis, la estrella más brillante de la constelación
  Phoenix; del árabe *al-ʿanqāʾ*, "el fénix".
- **Semántica:** renacer/iteración (loop learn/skills) y vigilancia desde las
  alturas (escaneo global de contratos).
- **Disponibilidad verificada:** 0 paquetes npm con el nombre exacto; GitHub sin
  ningún proyecto notable llamado Ankaa; 5 letras, sin dígrafos, pronunciable
  en ES y EN (`ankaa analyze ./openapi.yaml`).
- **Descartes con evidencia:** Varuna (`microsoft/varuna` 252★), Eunomia
  (`eunomia-bpf` 905★), Maat (`trailofbits/maat` 651★ + `code-maat` 2.6k★),
  Bennu (146★ + FenixEdu), Thuban (npm `thuban` activo, misma categoría),
  Muninn (449 repos, `muninndb` 332★), Shaula (codename de release de
  Synthetix), Suzaku (Yamato-Security 224★), Zhuque (3.5k★), Al'ar/alar
  (framework Node existente), Simurgh (npm tomado), Anqa (firmware 31★),
  Keryx, Custos, Portunus, Seshat, Alcor, Arcturus, Janua, Mardil, Rukhmar
  (ergonomía de consola "kh"), Udjat (finalista; "dj" es fricción tipográfica
  en español), Alicanto (pareidolia con Alicante/marca de especias).

## 2. Alcance

### Dentro

- Tabla de nombres canónicos de la sección 3 aplicada a **todo** el monorepo.
- Scope npm `@apigovscan/*` → `@ankaa/*` (10 packages), bin, bundle
  `dist/apigovscan.mjs` → `dist/ankaa.mjs` y banner esbuild.
- Config `ankaa.yaml|ankaa.yml` (búsqueda automática); `init` scaffolea los
  nombres nuevos.
- Env vars `ANKAA_*` **sin** fallbacks `APIGOVSCAN_*`.
- Directorio `.apigovscan/` → `.ankaa/` (skills, baseline, workspace) con
  INV-7 y tests de invariantes actualizados.
- Licencias: **formato `AGS-<customer>-<YYYYMMDD>-<sig>` SIN cambios**
  (decisión cerrada); la community key pública y toda key emitida siguen
  validando; solo cambian los nombres de env (`ANKAA_LICENSE_KEY`,
  `ANKAA_LICENSE_SECRET`) y los textos de ayuda/error.
- Reporters: console `Ankaa`, markdown `# Ankaa report`, JSON
  `tool.name: "ankaa"`, SARIF `driver.name` + propiedades `ankaa/*` y
  `ankaaFingerprint`.
- Action compuesta (branding/URL) y workflows del repo; tarball
  `ankaa-cli-<version>.tgz`; imagen Docker; `examples/`.
- Docs: README, SDD (marca, INV-7, glosario), `docs/01–06`, `AGENTS.md`.
- Nota al pie en el changelog de specs afectadas (sin reescribir historia):
  `f2-config` (nombre de archivo), `f3-*` (skills dir), `f6-distribution`
  (env vars + tarball), `f9-launch-oss` (marca), `f15-local-workspace`
  (`.ankaa/workspace/`).
- Rename del repo GitHub a `Ankaa` como **paso final** (ops): GitHub deja
  redirect; badges, `uses:` y URLs `npm.pkg.github.com` se actualizan.
- Un único cambio de `reportHash` (ver sección 4), documentado en release.

### Fuera de alcance

- Cambios funcionales de comportamiento: mismo pipeline, mismas reglas, mismos
  exit codes, mismas tools MCP.
- Bump de `schemaVersion` (JSON/SARIF siguen v1; `tool.name` cambia dentro del
  mismo schema versionado).
- Migración asistida de `.apigovscan/` → `.ankaa/` (big-bang: el usuario mueve
  su carpeta o regenera con `init` / `--write-baseline`).
- Alias legacy de cualquier tipo (bin, config, env, directorio).
- Registro de dominio y screening de marca: **prerrequisito de ops previo al
  merge** (ver riesgos), no código.
- Renombrar tags git históricos o changelogs pasados.

## 3. Contrato — nombres canónicos

| Superficie | Antes | Después |
| ---------- | ----- | ------- |
| Marca | ApiGovScan | **Ankaa** |
| Scope npm | `@apigovscan/*` | `@ankaa/*` (10 packages) |
| bin | `apigovscan` | `ankaa` |
| Bundle | `dist/apigovscan.mjs` + banner `__apigovscanCreateRequire` | `dist/ankaa.mjs` + banner `__ankaaCreateRequire` |
| Config | `./apigovscan.yaml\|.yml` | `./ankaa.yaml\|.yml` |
| Directorio | `.apigovscan/` | `.ankaa/` |
| Env | `APIGOVSCAN_LICENSE_KEY`, `APIGOVSCAN_LICENSE_SECRET`, `APIGOVSCAN_LLM_{BASE_URL,API_KEY,MODEL}` | `ANKAA_LICENSE_KEY`, `ANKAA_LICENSE_SECRET`, `ANKAA_LLM_{BASE_URL,API_KEY,MODEL}` |
| License key | `AGS-…` | `AGS-…` **(sin cambios)** |
| Tarball | `apigovscan-cli-<v>.tgz` | `ankaa-cli-<v>.tgz` |
| MCP docs | `npx @apigovscan/cli mcp` | `npx @ankaa/cli mcp` |
| JSON | `tool.name: "apigovscan"` | `tool.name: "ankaa"` |
| SARIF | `apigovscan/*`, `apigovscanFingerprint` | `ankaa/*`, `ankaaFingerprint` |
| Console/MD | "ApiGovScan" / "# ApiGovScan report" | "Ankaa" / "# Ankaa report" |
| Repo | `github.com/fedesauzzadev/ApiGovScan` | `github.com/fedesauzzadev/Ankaa` (paso final) |

## 4. Impacto en determinismo (INV-2) — decisión cerrada

`reportHash` se computa sobre el reporte que incluye `tool.name`
(`packages/reporters/src/build.ts`), por lo que el rename produce **un único
cambio de todos los `reportHash`**. Se acepta y se congela en fixtures nuevas.

Los **fingerprints de findings NO dependen del nombre** y no deben cambiar:
misma spec + mismas reglas ⇒ mismos fingerprints antes y después del rename.
Los baselines (que comparan por fingerprint y `inputHash`) siguen suprimiendo
igual tras el rename; artifacts viejos que guarden `reportHash` no se
re-validan.

## 5. Criterios de aceptación

- [ ] **AC-16.1** `ankaa --help` muestra branding nuevo y exit codes intactos
      (0 ok · 1 findings · 2 usage/parse/config); el bin `apigovscan` ya no
      existe en el package publicado.
- [ ] **AC-16.2** La búsqueda automática de config resuelve `ankaa.yaml` y
      `ankaa.yml`; `apigovscan.yaml` ya no se autodetecta (test negativo);
      `init` scaffolea `ankaa.yaml` + `.ankaa/skills/`.
- [ ] **AC-16.3** Solo se leen env vars `ANKAA_*`; setear `APIGOVSCAN_*` no
      tiene efecto (test negativo con license faltante y LLM).
- [ ] **AC-16.4** INV-7 reescribe su contrato a `.ankaa/` en SDD y gates; los
      tests de invariantes (incluido `fs-boundary`) pasan con el directorio
      nuevo.
- [ ] **AC-16.5** Keys `AGS-` existentes (incluida la community key pública
      del README) validan igual; `KEY_RE` y la emisión no cambian; los
      mensajes citan `ANKAA_LICENSE_KEY`.
- [ ] **AC-16.6** Fixture dorada: mismo corpus ⇒ mismos findings ordenados y
      mismos fingerprints pre/post rename (diff vacío); `reportHash` cambia
      exactamente una vez y queda congelado en snapshots (INV-2).
- [ ] **AC-16.7** Reporters actualizados: console "Ankaa", markdown
      "# Ankaa report", JSON `tool.name: "ankaa"`, SARIF `ankaa/*` +
      `ankaaFingerprint`; snapshots/typecheck verdes.
- [ ] **AC-16.8** Action compuesta actualizada (branding, URL del repo) sin
      cambios contractuales en inputs/outputs; workflow e2e del repo verde
      (dogfood sobre el propio repo renombrado).
- [ ] **AC-16.9** Grep-gate en CI: cero ocurrencias de
      `apigovscan|ApiGovScan|APIGOVSCAN_` fuera de la allowlist (changelogs
      históricos, tags, este spec, changelogs al pie de specs afectadas).
- [ ] **AC-16.10** Docs al día (README, SDD, docs/01–06, AGENTS.md, examples/)
      y nota al pie en changelog de `f2-config`, `f3-*`, `f6-distribution`,
      `f9-launch-oss`, `f15-local-workspace`.
- [ ] **AC-16.11** Repo renombrado a `Ankaa`; badges, `uses:` y registry
      (`npm.pkg.github.com`) apuntan al path nuevo; el workflow `release`
      publica `@ankaa/cli`.
- [ ] **AC-16.12** `pnpm check` (lint + typecheck + test + build + invariants)
      verde en la matriz CI.

## 6. Plan de pruebas

- Suite existente: renombrar env/config/bin en todos los tests identificados
  (license, mcp, fix, drift, scan-org, scan-repo, review, rules-import,
  action e2e, invariants).
- **Test dorado de fingerprints:** analizar el corpus de fixtures con el build
  pre-rename (commit anterior) y post-rename; diff de fingerprints = vacío.
- Tests negativos de legacy: env `APIGOVSCAN_*` ignorados; `apigovscan.yaml`
  no autodetectado; bin viejo inexistente.
- Grep-gate como script de CI con allowlist versionada.
- Dogfood: el workflow de análisis del repo corre sobre sí mismo post-rename.

## 7. Dependencias y riesgos

- **Prerrequisito ops (antes del merge):** verificar dominio
  (`ankaa.dev`/`ankaa.io`) y screening rápido de marca (clases 9/42). Nota de
  convivencia: el supercomputador Pawsey usa "Ankaa" en HPC; sin producto de
  software comercial conocido con el nombre (riesgo bajo, documentado).
- `reportHash` cambia una vez → comunicado en el changelog del release;
  baselines intactos por fingerprint.
- Propiedades SARIF renombradas romperían consumidores externos → no existen
  públicos aún (f9 sin publicar); se documenta en el changelog.
- Renombrar `.apigovscan/` en checkouts Windows (case-insensitive) del
  dogfood propio: mover manualmente con `git mv`; nota en README.
- Errores residuales de tipeo en docs: cubiertos por grep-gate (AC-16.9).

## Changelog

- 2026-10-01 · Spec creada con decisiones cerradas: big-bang sin legacy,
  prefijo `AGS-` intacto, rename de repo incluido como paso final. Ankaa
  elegida tras auditoría de disponibilidad (GitHub + npm, 2026-09-30) que
  descartó ~30 candidatas con evidencia.
