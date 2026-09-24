# f2-config · Configuración completa `apigovscan.yaml`

| Campo | Valor |
|---|---|
| Estado | cerrada |
| Fase | 2 |
| Deriva de | SDD FR-13, doc 01 §6.2, doc 03 §5, doc 03 §8 (skills dir placeholder); specs `f1-analyze` (subconjunto f1) |
| Roadmap | Fase 2 — Config + custom rules + baseline |

## 1. Objetivo

Como **tech lead**, quiero un `apigovscan.yaml` completo y versionable en git, para que el equipo configure reglas, baseline y fail policy sin depender de flags en cada corrida de CI.

**User story canónica:**

> Given un repo con `apigovscan.yaml` que declara `failOn`, overrides de severidad, archivos de reglas custom y la ruta del baseline,  
> When corro `apigovscan analyze ./specs` sin flags,  
> Then se aplica la config completa (mismo resultado que con los flags equivalentes), con merge determinista CLI > config > defaults.

## 2. Alcance

### Dentro

- Schema completo (zod/hand-rolled estricto) de `apigovscan.yaml` / `.yml`.
- Claves nuevas de f2: `rules` (paths a archivos custom), `baseline` (path / enable), extensiones de `standards` solo-documentadas.
- Precedencia: flag CLI > config file > default.
- Errores de config: mensajes claros, exit 2, sin stack crudo.
- `--config` override ya existente; se mantiene.
- Documentación de schema en README + ejemplo committeado.

### Fuera (explícito)

- `skills/` (suppressions, drafts) → **f3** (`f3-skills`); la config solo reserva `skillsDir` opcional sin validar contenido.
- Descarga de packs remotos / pin efectivo con registry → f6.
- `apigovscan init` que genere el config → f3 (`init`); aquí solo el schema y el ejemplo manual.
- Multi-config / monorepo overrides por paquete → fuera de v1.

## 3. Contrato

### Búsqueda (ya implementada en f1, se congela)

1. `--config <file>` (si no existe → exit 2)
2. `./apigovscan.yaml`
3. `./apigovscan.yml`
4. Sin config → defaults

### Schema (f2 completo)

```yaml
# apigovscan.yaml — ejemplo mínimo
failOn: error                    # error | warning | info | never

standards:
  pack: elite                    # f2: solo "elite" (embebido); otros → exit 2
  # version: "2026.09.1"        # se valida contra embed cuando aplique; warning si difiere

rules:
  # Overrides de severidad / off (ya en f1)
  NAMING-001: off
  ERR-010: warning
  # Paths a archivos custom (NUEVO en f2) — relative al cwd del config
  # Un string path o lista de paths; se añaden al pack (mismo canal que --rules)
  # Clave especial:
  files:
    - ./team-rules.yaml
    # - ./more-rules.json

baseline:
  enabled: true                  # equivale a --baseline (si path existe)
  path: .apigovscan/baseline.json  # default si enabled y path omitido
  # strictHash: false            # equivale a --strict-hash

# Reservado f3 — parseado como string opcional, sin validar contenido en f2
skillsDir: .apigovscan/skills
```

**Notas de diseño:**

- `rules` puede ser **solo** un mapping de overrides (f1) **o** contener la subclave especial `files` (f2). Para no romper configs f1, se aceptan dos formas:
  1. `rules: { NAMING-001: off, files: [...] }` — `files` es reserved key.
  2. Alternativa documentada si el reserved key es frágil: `customRules: [paths]` top-level. **Decisión f2:** usar `customRules` top-level para no mezclar con overrides de ids de reglas (ids de pack jamás se llaman `files`).
- **Decisión:** `customRules: string | string[]` top-level. Más limpio que reserved key en `rules`.

```yaml
customRules:
  - ./team-rules.yaml
```

### Precedencia (merge)

| setting | orden |
|---|---|
| `failOn` | flag `--fail-on` > config > `error` |
| `standards.pack` | config > `elite` (flag no existe aún) |
| severity overrides / off | config `rules:` (ids) — CLI no tiene flag de override en f2 |
| custom rules set | union de: config `customRules[]` + `--rules` + `--rule` (orden estable: config files → `--rules` → inline `--rule`) |
| baseline path/enabled | flags `--baseline`/`--write-baseline`/`--baseline-path` > config `baseline` > off |
| `strictHash` | flag `--strict-hash` > config > false |

Conflictos de **ids de reglas custom** (mismo `id` en dos fuentes): **exit 2** con mensaje citando ambas fuentes (no merge silencioso). Override de regla **del pack** por custom con mismo id: **exit 2** (usar config `rules:` para severidad/off; no redefinir elite).

### Errores de config

| condición | exit | mensaje (EN) |
|---|---|---|
| YAML inválido | 2 | `config <path>: <parse error>` |
| root no mapping | 2 | `config <path>: root must be a mapping` |
| `failOn` inválido | 2 | ya en f1 |
| unknown top-level key | 2 | `config <path>: unknown key "x"` (strict — catch typos) |
| `customRules` path inexistente | 2 | `config <path>: customRules[0] not found: ...` |
| `baseline.path` no existe con `enabled: true` | 2 en analyze con baseline on | `baseline not found: ... (run --write-baseline)` |
| `standards.pack` ≠ elite | 2 | ya en f1 |

**Decisión:** unknown top-level keys → error (strict). Keys de f3 (`skillsDir`) se **allowlistean** desde f2 (parseadas, no validadas a fondo).

### API (cli, no core)

```ts
interface AnalyzeConfig {
  failOn?: FailOn;
  standards?: { pack?: string; version?: string };
  rules?: Record<string, Severity | "off">;
  customRules?: string[];          // rutas resueltas relative al config dir o cwd
  baseline?: { enabled?: boolean; path?: string; strictHash?: boolean };
  skillsDir?: string;
}
```

Resolución de rutas en config: **relativas al directorio del archivo de config** si se encontró uno; si no hay config file, relative a `cwd`.

## 4. Criterios de aceptación

- [x] **AC-C.1** Config con unknown top-level key ⇒ exit 2 + `unknown key`.
- [x] **AC-C.2** `customRules` (path o lista) carga y evalúa reglas igual que `--rules` (union).
- [x] **AC-C.3** Precedencia: `--fail-on warning` gana sobre `failOn: error` en config.
- [x] **AC-C.4** `customRules` con path inexistente ⇒ exit 2 antes de analizar.
- [x] **AC-C.5** Rutas en config relativas al config file (test: config en subdir con rules vecinas).
- [x] **AC-C.6** Config válida de f1 (solo `failOn` + `rules` overrides) sigue funcionando (no-regresión).
- [x] **AC-C.7** `skillsDir` presente ⇒ no error (allowlist f3); contenido no se lee en f2.
- [x] **AC-C.8** Merge custom rules: config + `--rules` + `--rule` ⇒ todos aplican; orden de carga estable.
- [x] **AC-C.9** Ejemplo `examples/apigovscan.yaml` (o snippet README) coincide con schema (test de smoke opcional).

## 5. Test plan

| Caso | Tipo |
|---|---|
| schema parse ok / unknown key / bad types | unit `config.test.ts` |
| customRules load + e2e analyze | e2e cli |
| precedence failOn | unit + e2e |
| relative path resolution | unit |
| no-regresión config f1 | e2e existente + unit |

## 6. Dependencias

- `f1-analyze` (config base, CLI)
- `f2-custom-rules` (carga/validación de archivos custom — puede implementarse en paralelo o primero)

## 7. Riesgos y decisiones abiertas

| Tema | Decisión |
|---|---|
| `rules.files` vs `customRules` top-level | **`customRules` top-level** (ids de reglas no colisionan con reserved key) |
| Unknown keys strict | Sí, exit 2 (typos en CI) |
| Pin `standards.version` | Se parsea; mismatch con embed → warning en f2 (no falla hasta registry f6) |
| skillsDir | Allowlist + string; validación f3 |

## Changelog

- 2026-09-24 · Spec creado desde SDD v1.0 §7 Fase 2 + FR-13.
- 2026-09-24 · M2.2 implementado: schema estricto, customRules, baseline parseado, merge, ejemplo, tests AC-C.*; estado → `implementada`.
