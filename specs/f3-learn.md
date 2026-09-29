# f3-learn · feedback → skills (idempotente) + gestión de drafts

| Campo     | Valor                                                                                                                                  |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Estado    | cerrada                                                                                                                                |
| Fase      | 3                                                                                                                                      |
| Deriva de | SDD FR-31/FR-32, INV-5, doc 03 §9, ADR-007/ADR-011; specs `f3-skills`, `f1-reporters` (report JSON), `f2-custom-rules` (schema drafts) |
| Roadmap   | Fase 3 — criterio de salida: flujo report→feedback→learn→re-analyze                                                                    |

## 1. Objetivo

Como **tech lead**, quiero transformar `report.json` + `feedback.json` en un patch idempotente sobre `.apigovscan/skills/`, para que el aprendizaje sea un diff de git auditable y portable al equipo (INV-5).

**User story canónica:**

> Given un `report.json` con findings y un `feedback.json` que marca 2 como `false_positive` y 1 como `severity_change`,  
> When corro `apigovscan learn --report r.json --feedback f.json` dos veces,  
> Then los skills quedan byte-idénticos (INV-5) y un re-analyze ya no muestra los FPs.

## 2. Alcance

### Dentro

- Comando `apigovscan learn --report <file> --feedback <file> [--skills-dir <path>] [--dry-run] [--force]`.
- Comando `apigovscan suppress --report <r.json> --fingerprint <fp|prefijo> --decision false_positive|wontfix|severity_change [--severity <s>] [--reason "..."] [--skills-dir <p>] [--dry-run]`: atajo sin `feedback.json` a mano — arma el item en memoria y reusa `buildLearnPatch`/`writeLearnPatch` (misma idempotencia, mismos warnings, nunca guarda un prefijo). Sin gate de licencia (operación local como `learn`). `--severity` exigido solo con `severity_change`.
- Schema de `feedback.json` (doc 03 §9).
- Mapeo decision → skills:

| decision          | efecto                                                                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `false_positive`  | upsert suppression por fingerprint; `reason` = comment o `"false_positive"` si vacío? → **comment obligatorio** o default documentado (§7) |
| `wontfix`         | suppression con reason = comment (default `"wontfix"`)                                                                                     |
| `severity_change` | upsert override severity para `ruleId` del finding (global)                                                                                |
| `confirm`         | no cambia skills; se puede loguear en stderr count                                                                                         |
| `suggest_rule`    | escribe `skills/drafts/<id>.yaml` con `draft: true`                                                                                        |

- Idempotencia INV-5: upsert por clave (`fingerprint` o `match` canónico; override por `ruleId`; draft por `id`); listas ordenadas estables al serializar.
- Validación feedback: unknown decision → exit 2; fingerprint no está en report → **warning** + aplica igual (doc 03).
- `reportHash` distinto no invalida.
- Crea skillsDir si no existe (mismo scaffold mínimo que init).
- **no** escribe fuera de skillsDir (INV-7).
- `--dry-run` imprime diff resumen (counts + paths) sin escribir.

- `apigovscan skills list [--format json]` — enumera suppressions, overrides, drafts (activos vs draft).
- `apigovscan skills promote <draftId>` — draft → activo: saca `draft: true` / set `draft: false` y **mueve** a nivel de activos; en f3, drafts promovidos viven en `skillsDir/custom/<id>.yaml` o se reescribe el archivo con `draft: false` y el loader de skills los inyecta como customRules (§7).
- `skills list` exit 0; id inexistente → exit 2.

### Fuera

- UI de picking de findings (HTML) → fuera; feedback es JSON a mano o generado por el usuario.
- Métricas de `confirm` en `feedback/` histórico → opcional nice-to-have, no gate (se puede skip o solo stderr).
- Promoción a pack elite → requiere PR al repo ApiGovScan (no un comando local).
- Undo / `learn --revert` → git revert.

## 3. Contrato

### feedback.json

```json
{
  "reportHash": "optional-hex",
  "items": [
    { "fingerprint": "…64hex…", "decision": "false_positive", "comment": "internal only" },
    { "fingerprint": "…", "decision": "wontfix", "comment": "migrate in Q4" },
    { "fingerprint": "…", "decision": "severity_change", "severity": "info" },
    { "fingerprint": "…", "decision": "confirm" },
    {
      "fingerprint": "…",
      "decision": "suggest_rule",
      "draft": {
        "id": "TEAM-008",
        "category": "custom",
        "severity": "warning",
        "message": "Batch endpoints must document max array size.",
        "when": {
          "all": [
            { "op": "method", "in": ["post"] },
            { "op": "pathMatches", "pattern": "/batch$" }
          ]
        }
      }
    }
  ]
}
```

- `items` array no vacío (vacío ⇒ exit 0 con `ok: no feedback items` o exit 2? → exit 0 no-op).
- Cada item: `fingerprint` (64 hex completos **o prefijo único de 8+ chars**, resuelto contra el report; lo guardado en skills siempre es el fingerprint completo) + `decision` del enum.
- `severity_change` exige `severity` ∈ error|warning|info; se resuelve `ruleId` **desde el report** (finding con ese fingerprint). Fingerprint ausente del report ⇒ exit 2 para severity_change (necesita ruleId); para FP/wontfix ⇒ warning + aplica.
- `suggest_rule` exige `draft.id` formato `PREFIX-NNN` + `when` + `message` + `category`; validado con `validateRule` de core (`strictSource: false`); `source` opcional se rellena `{ title: "Derived from feedback (learn)", url: "" }`.
- `reportHash` si difiere del report file ⇒ warning.

### CLI learn

```bash
apigovscan learn --report <r.json> --feedback <f.json> [--skills-dir <p>] [--dry-run]
apigovscan suppress --report <r.json> --fingerprint <fp|prefijo> --decision wontfix --reason "..." [--skills-dir <p>] [--dry-run]
```

| Exit | Condición                                                                                               |
| ---- | ------------------------------------------------------------------------------------------------------- |
| 0    | patch aplicado (o dry-run); imprime summary                                                             |
| 2    | args faltantes, report/feedback ilegibles, schema inválido, draft inválido, severity_change sin finding |

Salida console (ejemplo):

```
learn: 2 suppressions, 1 severity override, 0 drafts
skills: .apigovscan/skills/suppressions.yaml (+1), severities.yaml (+1)
```

### Serialización estable (INV-5)

- suppressions: sort por `fingerprint` o por `match` canónico (`ruleId|apiPath`) — upsert no duplica.
- overrides: sort por `ruleId`.
- YAML con `version` primero, listas siempre presentes (aunque vacías).
- Mismo feedback + mismo report ⇒ **mismos bytes** en los archivos tocados (salvo si se inyecta `createdAt` — **decisión: NO poner createdAt en v1** para simplificar INV-5 byte-idempotente; doc lo permite como metadata opcional).

### skills promote

```bash
apigovscan skills promote TEAM-008
```

- Lee `drafts/TEAM-008.yaml`; si `draft` es true → escribe con `draft: false` **y** lo copia/mueve a loader de activos: **decisión f3:** el loader de skills (f3-skills) acepta `drafts/*.yaml` con `draft !== true` como customRules adicionales. Promover = flip `draft: false` en el mismo archivo (queda en drafts/ pero activo) + `skills list` lo muestra como active. Alternativa mover a `custom/` — preferimos flip para diff mínimo.
- Id no encontrado → exit 2.

### skills list

```
suppressions: 3
overrides: 1  (PAGINATION-001 → error)
drafts:
  TEAM-008  [draft]
custom active:
  TEAM-007  [warning]
```

`--format json` máquina.

## 4. Criterios de aceptación

- [ ] **AC-L.1** `learn` con FP + severity_change + suggest_rule ⇒ crean/actualizan suppressions, severities, drafts correctos.
- [ ] **AC-L.2** Segundo `learn` idéntico ⇒ archivos byte-idénticos (INV-5).
- [ ] **AC-L.3** `false_positive` sin comment ⇒ exit 2 o default `reason: "false_positive"` (fijar en §7: **default `false_positive` si comment ausente; comment lo usa como reason si está**).
- [ ] **AC-L.4** decision desconocida / fingerprint malformado ⇒ exit 2.
- [ ] **AC-L.5** fingerprint en feedback pero no en report ⇒ warning stderr; suppression igual se aplica (FP/wontfix).
- [ ] **AC-L.6** `severity_change` con fingerprint no en report ⇒ exit 2 (no sabe ruleId).
- [ ] **AC-L.7** `suggest_rule` inválida (DSL) ⇒ exit 2 con issues de validateRule.
- [ ] **AC-L.8** `--dry-run` no escribe archivos (INV-7 spy).
- [ ] **AC-L.9** e2e flujo S4: analyze → feedback 2 FP → learn → re-analyze ⇒ esos 2 no aparecen; `skillsSuppressed ≥ 1`.
- [ ] **AC-L.10** `skills list` muestra suppressions/overrides/drafts; `--format json` estable.
- [ ] **AC-L.11** `skills promote TEAM-008` ⇒ pasa a active; re-analyze evalúa la regla; promote de id inexistente ⇒ exit 2.
- [ ] **AC-L.12** learn no escribe fuera de skillsDir (INV-7).

## 5. Test plan

| Caso                                      | Tipo       |
| ----------------------------------------- | ---------- |
| map decisions → files                     | unit       |
| idempotencia INV-5 (run twice deep equal) | unit + e2e |
| dry-run no write                          | e2e        |
| e2e S4 full loop                          | e2e        |
| promote + re-analyze                      | e2e        |
| validateRule draft                        | unit       |

## 6. Dependencias

- `f3-skills` (loader + aplicación; learn escribe lo que skills lee)
- `f1-reporters` (report JSON con fingerprints)
- `f2-custom-rules` / `f1-engine` (`validateRule` para drafts)
- `f3-init` (scaffold base; learn puede mkdir -p skills)

## 7. Riesgos y decisiones abiertas

| Tema                      | Decisión                                                                               |
| ------------------------- | -------------------------------------------------------------------------------------- |
| reason en FP sin comment  | Default `reason: "false_positive"`; si hay `comment`, se usa como reason.              |
| createdAt en suppressions | **Omitido en v1** para byte-stable INV-5.                                              |
| promote = flip vs move    | Flip `draft: false` en `drafts/<id>.yaml`; loader acepta drafts no-draft como activos. |
| confirm                   | Solo count en stdout (`confirm: N`); no escribe `feedback/` histórico en v1.           |
| report + feedback paths   | Relativos a cwd; abs OK.                                                               |
| skillsDir default         | igual que config/init: `.apigovscan/skills` resuelto vs cwd si no hay config.          |

## Changelog

- 2026-09-24 · Spec creado desde SDD v1.0 §7 Fase 3 + FR-31/32 + INV-5 + doc 03 §9.
- 2026-09-24 · M3.2 implementado: `learn.ts` + CLI `learn`/`skills list`/`skills promote` + tests AC-L.1…12 (INV-5 byte-idempotent).
- 2026-09-24 · Cierre fase 3 con M3.3 (S4 e2e) → `cerrada`.
- 2026-09-29 · `feedback.json` acepta prefijo único corto (8–64 hex): `buildLearnPatch` resuelve contra el report vía `resolveFingerprint` y guarda siempre el fingerprint completo. Prefijo inexistente/ambiguo ⇒ exit 2 (nunca se guarda un prefijo); 64 completos ausentes mantienen el warning + apply legacy.
