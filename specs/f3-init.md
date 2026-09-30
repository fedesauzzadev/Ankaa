# f3-init · Scaffold `.apigovscan/`

| Campo     | Valor                                                                                                                  |
| --------- | ---------------------------------------------------------------------------------------------------------------------- |
| Estado    | cerrada                                                                                                                |
| Fase      | 3                                                                                                                      |
| Deriva de | SDD FR-30, doc 03 §8 (estructura skills), doc 01 §6.4; specs `f2-config` (schema), `f2-baseline` (path `.apigovscan/`) |
| Roadmap   | Fase 3 — init + skills + learn                                                                                         |

## 1. Objetivo

Como **dev backend**, quiero un comando `init` que deje el repo listo para baseline y skills, para no tener que inventar la estructura `.apigovscan/` a mano.

**User story canónica:**

> Given un repo sin ApiGovScan,  
> When corro `apigovscan init`,  
> Then se crean `apigovscan.yaml`, `.apigovscan/skills/{suppressions,severities}.yaml`, `.apigovscan/skills/drafts/` y un README corto — sin pisar archivos existentes salvo `--force`.

## 2. Alcance

### Dentro

- Comando `apigovscan init [dir]` (default `.`).
- Crea (si no existen):
  - `apigovscan.yaml` — ejemplo mínimo compatible con schema f2 (failOn, skillsDir, baseline placeholder).
  - `.apigovscan/skills/suppressions.yaml` — `{ version: 1, suppressions: [] }`.
  - `.apigovscan/skills/severities.yaml` — `{ version: 1, overrides: [] }`.
  - `.apigovscan/skills/drafts/` — directorio vacío (con `.gitkeep`).
  - `.apigovscan/skills/README.md` — explicación corta del flujo learn.
- Respetar `skillsDir` si ya hay config con esa key (crear allí); default `.apigovscan/skills`.
- `--force` sobrescribe solo los archivos de scaffold que genera `init` (no baseline ni skills con contenido real del usuario — decisión abajo).
- Exit 0 con lista de creados/saltados; exit 2 si path no es directorio o error de FS.

### Fuera

- `apigovscan.yaml` no se regenera si ya existe (sin `--force`).
- No escribe baseline.json (eso es `--write-baseline`).
- No migra skills de versiones anteriores (v1 es la primera).
- No toca git (no `git init`, no commit).

## 3. Contrato

### CLI

```bash
apigovscan init [dir] [--force] [--skills-dir <path>]
```

| Condición                                    | Exit | Mensaje (EN)                                                 |
| -------------------------------------------- | ---- | ------------------------------------------------------------ |
| Todo creado                                  | 0    | `created: …` por archivo; `ok: already present: …` para skip |
| Archivo existe sin `--force`                 | 0    | skip (no es error)                                           |
| `--force` y existe uno de los scaffold files | 0    | sobrescribe **solo** scaffold files de init                  |
| `dir` no existe / no es directorio           | 2    | `init target is not a directory: <path>`                     |
| Error de escritura                           | 2    | `init failed: …`                                             |

### Contenido scaffold

**`apigovscan.yaml`** (ejemplo):

```yaml
failOn: error
standards:
  pack: elite
skillsDir: .apigovscan/skills
baseline:
  enabled: false
  path: .apigovscan/baseline.json
```

**`.apigovscan/skills/suppressions.yaml`:**

```yaml
version: 1
suppressions: []
```

**`.apigovscan/skills/severities.yaml`:**

```yaml
version: 1
overrides: []
```

**`.apigovscan/skills/README.md`:** párrafo corto: report → feedback → `learn` → commit; suppressions por fingerprint; drafts se promueven con `skills promote`.

### Orden de creación

Directorios primero (`mkdir -p`), luego archivos. Determinista: mismo orden de "created" en stdout.

## 4. Criterios de aceptación

- [x] **AC-I.1** `init` en dir vacío ⇒ exit 0 y existen los 4 paths (+ drafts dir).
- [x] **AC-I.2** `init` dos veces sin `--force` ⇒ exit 0; segunda vez todo `already present` (INV-7: no reescribe).
- [x] **AC-I.3** `init --force` ⇒ sobrescribe scaffold; no toca `baseline.json` ni `suppressions.yaml` si el usuario ya puso contenido distinto de `version:1 + empty` (decisión: force solo regenera README + config si eran de init — ver §7).
- [x] **AC-I.4** `init ./nope` (no existe) ⇒ exit 2.
- [x] **AC-I.5** Con config existente que declara `skillsDir: custom/skills`, init crea skills ahí (no en el default).
- [x] **AC-I.6** help/README mencionan `init`.

## 5. Test plan

| Caso                                | Tipo                     |
| ----------------------------------- | ------------------------ |
| scaffold fresh / second run / force | e2e                      |
| skillsDir custom desde config       | e2e                      |
| target inválido                     | e2e                      |
| contenido YAML mínimo válido        | unit (parse de scaffold) |

## 6. Dependencias

- `f2-config` (schema y `skillsDir` allowlist)
- `f2-baseline` (convención `.apigovscan/`)

## 7. Riesgos y decisiones abiertas

| Tema                        | Decisión                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| force vs skills del usuario | **`--force` solo regenera archivos creados por init si siguen siendo el scaffold known** (o README siempre); suppressions/severities con entradas del usuario **nunca** se pisan con init. Decisión simplificada f3: force reescribe config + skills README + empties solo si el archivo matchea el scaffold exacto o no existe; si suppressions tiene entradas, se salta con warning. |
| init crea baseline?         | No — baseline es `--write-baseline`.                                                                                                                                                                                                                                                                                                                                                   |
| `--skills-dir` flag         | Sí, override de config para el path de creación.                                                                                                                                                                                                                                                                                                                                       |

## Changelog

- 2026-09-24 · Spec creado desde SDD v1.0 §7 Fase 3 + FR-30.
- 2026-09-24 · M3.3 implementado: `init` + e2e AC-I.1…6 + S4 full loop → `cerrada`.
- 2026-10-01 - Ankaa rename (f16): init now scaffolds ankaa.yaml and .ankaa/skills/. No legacy aliases; see specs/f16-ankaa-rebrand.md.
