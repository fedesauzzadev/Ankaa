# f2-custom-rules · DSL de reglas custom del usuario

| Campo     | Valor                                                                     |
| --------- | ------------------------------------------------------------------------- |
| Estado    | cerrada                                                                   |
| Fase      | 2                                                                         |
| Deriva de | SDD FR-14/FR-15, doc 03 §3 reglas custom; specs `f1-engine`, `f1-analyze` |
| Roadmap   | Fase 2 — Config + custom rules + baseline                                 |

## 1. Objetivo

Como **platform/API guild**, quiero escribir reglas de equipo en YAML (misma DSL que el pack) y validarlas antes de CI, para personalizar governance sin forkear el motor ni TypeScript.

**User story canónica:**

> Given `team-rules.yaml` con 3 reglas `TEAM-*`,  
> When corro `apigovscan rules validate ./team-rules.yaml` y luego `analyze --rules ./team-rules.yaml`,  
> Then validate sale 0 si el DSL es válido; analyze produce findings de TEAM-* con pack `custom@<cli version>`.

## 2. Alcance

### Dentro

- Carga de archivos custom (YAML/JSON): array de rules o `{ rules: [...] }` o single rule object. _(parte ya en f1 `--rules`; se endurece)_
- Validación con `validateRule` de core (zod strict + MIXED_SCOPE + unsafe regex) — **ya parcial** en f1; f2 expone comando `rules validate`.
- Colisión de ids: entre fuentes custom → exit 2; custom vs pack elite → exit 2.
- Subcomando `rules validate <file...>`.
- `rules list` (lista activas: pack + custom si `--rules`/`config`) — mínima f2.
- Prefijo de id recomendado `TEAM-NNN` o `ORG-NNN` (formato ya `PREFIX-NNN`); **no** se obliga prefijo nuevo, solo formato.
- Mensajes EN literales (AC-P.10 ya aplicado al pack; aplica a errors de validate).

### Fuera

- `learn` / drafts → f3.
- Nuevos átomos DSL (solo si un AC de ejemplo los necesita → PR a `f1-engine`/core con changelog).
- Reglas como módulos TS (INV-4 / anti-alcance).
- Pack registry / distribución de packs de org → f6/compose.

## 3. Contrato

### Formatos de archivo aceptados

```yaml
# 1) top-level array
- id: TEAM-001
  category: custom
  severity: error
  message: "..."
  when: { op: headerRequired, name: x-request-id }

# 2) wrapper
rules:
  - id: TEAM-001
    ...

# 3) single object con id
id: TEAM-001
...
```

JSON equivalente.

### Camino de validación (core)

```ts
validateRule(raw, { strictSource: false }); // custom NO exige source.url
// stamp: packId: "custom", packVersion: packageVersion()
```

Opcionales permitidos igual que pack: `fix`, `enabledByDefault`, `deprecated`.

### CLI

```bash
apigovscan rules validate <file...> [options]
apigovscan rules list [--rules <file>] [--format console|json]
apigovscan rules explain <ruleId>   # ya f1; busca pack + custom si se pasan --rules
```

| Comando                     | Exit 0                                      | Exit 2                                         |
| --------------------------- | ------------------------------------------- | ---------------------------------------------- |
| `rules validate`            | todas las reglas OK (imprime `ok: N rules`) | cualquier issue; imprime `file#i: issues`      |
| `rules list`                | lista impresa                               | archivo de rules inválido / pack no encontrado |
| analyze con rules inválidas | —                                           | ya f1 (`invalid custom rule`) + path/file      |

`rules validate` acepta múltiples files. Flags: `--format json` opcional para machine output.

### Colisiones (analyze y validate multi-file)

1. **Dentro de custom:** mismo `id` dos veces → exit 2 `duplicate rule id`.
2. **Custom vs elite:** id existe en pack → exit 2  
   `rule id NAMING-001 already exists in pack elite; use config rules: overrides or a new id`.
3. Override de severidad sigue siendo solo via config `rules:` / engine overrides.

### Orden de evaluación (sin cambio de semántica f1)

`packs elite` + `customRules` (config files → `--rules` → `--rule`) pasan a `evaluate({ packs, customRules })`.

## 4. Criterios de aceptación

- [x] **AC-R2.1** `rules validate` con file válido (≥1 regla) ⇒ exit 0 y conteo.
- [x] **AC-R2.2** `rules validate` con unknown atom / MIXED_SCOPE / bad id ⇒ exit 2 y issues legibles (sin stack).
- [x] **AC-R2.3** `rules validate` con N files: falla si alguno falla; lista todos los issues.
- [x] **AC-R2.4** Duplicate id entre dos files custom en analyze ⇒ exit 2.
- [x] **AC-R2.5** Custom rule con id `NAMING-001` (choca con elite) ⇒ exit 2 mensaje citando pack.
- [x] **AC-R2.6** `rules list` muestra reglas elite (≥50) y, con `--rules`, las custom al final ordenadas por id.
- [x] **AC-R2.7** `rules explain TEAM-001` con `--rules` cargado ⇒ imprime source si la regla lo tiene (o nota `pack: custom@…`).
- [x] **AC-R2.8** e2e: fixture + `--rules team-rules.yaml` ⇒ finding `TEAM-001` en JSON con `packId: custom`.
- [x] **AC-R2.9** Custom no exige `source` (validate pasa sin source); pack elite sigue exigiéndolo (no-regresión AC-P.2).
- [x] **AC-R2.10** File no encontrado / YAML inválido ⇒ exit 2 con path.

## 5. Test plan

| Caso                            | Tipo               |
| ------------------------------- | ------------------ |
| validate ok / issues matrix     | unit + e2e         |
| collisions id                   | unit (merge) + e2e |
| list / explain custom           | e2e                |
| findings custom end-to-end      | e2e                |
| no-regresión elite strictSource | unit pack tests    |

## 6. Dependencias

- `f1-engine` (`validateRule`, evaluate customRules)
- `f1-analyze` (`--rules`/`--rule` ya existentes)
- Sin dependencia de f2-config (pero config `customRules` lo usa)

## 7. Riesgos y decisiones abiertas

| Tema                                | Decisión                                                      |
| ----------------------------------- | ------------------------------------------------------------- |
| Prefijo TEAM vs libre               | Formato `PREFIX-NNN` solo; docs recomiendan `TEAM`/`ORG`      |
| source opcional en custom           | Sí opcional (INV solo obliga citation en packs elite)         |
| `rules explain` sin --rules         | Solo busca elite (f1); con `--rules` o config, incluye custom |
| Compatible con future skills drafts | Drafts f3 no pasan por este loader (skills dir aparte)        |

## Changelog

- 2026-09-24 · Spec creado desde SDD v1.0 §7 Fase 2 + FR-14/15.
- 2026-09-24 · M2.1: implementada (AC-R2.1…10; `custom-rules.ts`, `rules validate|list|explain`, colisiones).
