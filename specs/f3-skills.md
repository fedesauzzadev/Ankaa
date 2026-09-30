# f3-skills · Carga y aplicación de skills en analyze

| Campo     | Valor                                                                                                                                                                |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Estado    | cerrada                                                                                                                                                              |
| Fase      | 3                                                                                                                                                                    |
| Deriva de | SDD FR-33/FR-34, doc 03 §8 (skills), ADR-007, INV-2 (orden tras skills); specs `f2-config` (skillsDir), `f1-engine` (fingerprints), `f2-baseline` (patrón de filtro) |
| Roadmap   | Fase 3 — init + skills + learn                                                                                                                                       |

## 1. Objetivo

Como **tech lead**, quiero que `analyze` aplique suppressions y overrides de severidad versionados en `.apigovscan/skills/`, para que el equipo comparta el "aprendizaje" vía git sin re-ejecutar `learn` en cada máquina.

**User story canónica:**

> Given `skills/suppressions.yaml` con un fingerprint de un finding legacy y `skills/severities.yaml` con un override,  
> When corro `apigovscan analyze ./spec.yaml`,  
> Then el finding suprimido no aparece (`summary.skillsSuppressed ≥ 1`) y el override de severidad se refleja en el finding restante — sin flags extra.

## 2. Alcance

### Dentro

- Loader de skills desde `config.skillsDir` (default `.apigovscan/skills`), resuelto relative al config dir o cwd (igual que f2).
- **suppressions.yaml** v1:
  - por `fingerprint` exacto (string 64 hex) con `reason` obligatorio;
  - por `match: { ruleId, apiPath? }` (query; `apiPath` es regex segura opcional) con `reason` obligatorio.
- **severities.yaml** v1: `overrides: [{ ruleId, severity }]` — misma semántica que config `rules:` pero en skills (merge: config rules < skills? → decisión §7).
- **drafts/**: se **leen** pero **no** se evalúan hasta `draft: false` o `skills promote` (promoción en f3-learn/f3-skills list).
- Aplicación post-evaluate / pre-baseline (orden doc 03 §6): suppress filtra; severity override re-enumera antes de sort/baseline/failOn.
- Conteo: `summary.suppressed` ya existe para baseline; skills usan **`summary.skillsSuppressed`** (opcional, solo si >0 o si skills activos) — decisión §7 para no chocar con baseline.
- Errores: YAML inválido / schema mal → exit 2 con path; missing skillsDir no es error (vacío).
- Snapshot: mismo reporte con skills cargados en distinto orden de archivos (INV-2).

### Fuera

- Escritura de skills (eso es `learn`) → `f3-learn`.
- `skills list` / `promote` → `f3-learn` (CLI de gestión).
- history/`skills/.history/` backups → fuera de v1 (git es el history).
- Suppression por query compleja (AND de múltiples campos) más allá de ruleId+apiPath → backlog.

## 3. Contrato

### Estructura de disco (ya f3-init)

```
<skillsDir>/
  suppressions.yaml
  severities.yaml
  drafts/*.yaml
  README.md
```

### suppressions.yaml

```yaml
version: 1
suppressions:
  - fingerprint: "<64 hex>"
    reason: "Legacy endpoint frozen until v2"
    by: "lead@team" # opcional
    owner: "payments-team" # opcional; dueño del waiver
    expires: "2026-12-31" # opcional; YYYY-MM-DD (fecha real); vencido ⇒ se ignora + warning
    createdAt: "2026-09-24" # metadata; no participa de hashes de reporte
  - match:
      ruleId: NAMING-001
      apiPath: "^/legacy/" # opcional; regex segura
    reason: "Legacy namespace excluded"
```

- `version` debe ser `1`; otro número ⇒ exit 2 `unsupported skills version`.
- Cada entry exige `reason` no vacío.
- `fingerprint` o `match` (exactamente uno); `match.ruleId` obligatorio.
- `expires` (opcional): `YYYY-MM-DD` con fecha de calendario real; formato inválido ⇒ exit 2 al cargar. Vencido (`expires` < fecha UTC del día del análisis) ⇒ el waiver **se ignora** (el finding queda visible, no cuenta en `skillsSuppressed`) + `warning: suppression expired …` en stderr.
- `owner` (opcional): string no vacío; solo metadata (quién responde por el waiver).
- Waiver huérfano (no matchea ningún finding del reporte actual, sin estar vencido) ⇒ `warning: suppression matches no findings …` en stderr (no exit 2).
- Determinismo (INV-2): la expiración se evalúa contra la fecha UTC del día **al momento del análisis** (dependencia wall-clock inherente); mismo instante ⇒ byte-idéntico. Tests inyectan `nowYmd`.
- `apiPath` se evalúa contra `finding.apiLocation` (`"GET /legacy/x"`) o contra path extraído — decisión: matchea si `apiLocation` completo o solo path cumple la regex; test fija comportamiento: **regex sobre el path de apiLocation sin method** (extraer path tras primer espacio) o si no hay apiLocation, sobre `location` JSON pointer. Simplificar: regex contra `apiLocation ?? location`.

### severities.yaml

```yaml
version: 1
overrides:
  - ruleId: PAGINATION-001
    severity: error # error | warning | info
```

- No soporta `off` (para apagar → config `rules: { id: off }` o baseline).
- `ruleId` desconocido al evaluar: warning en stderr, no exit 2.

### drafts/

Mismo schema que custom rule (`f2-custom-rules`) + `draft: true`. No entran a `evaluate` si `draft !== false`.

### Pipeline (doc 03 §6, concreto f3)

```
evaluate → findings
→ apply skills severity overrides (re-map severity)
→ apply skills suppressions (drop) → count skillsSuppressed
→ sort estable
→ apply baseline filter
→ summary / failOn / report
```

Severidad de skills **sobre** la del pack; si config `rules:` también overridea la misma id, precedence §7.

### Report

- `summary.skillsSuppressed?: number` — presente solo si el usuario tiene skillsDir con suppressions aplicadas (o siempre en 0 si dir existe? → solo si >0, para no cambiar reportHash de usuarios sin skills; decisión §7).
- Console: `(skills: N suppressed)` similar a baseline cuando N>0.
- `reportHash` incluye `skillsSuppressed` si está presente (igual criterio que baseline).

## 4. Criterios de aceptación

- [ ] **AC-S.1** Fingerprint en suppressions ⇒ finding no aparece; `skillsSuppressed ≥ 1`; exit/failOn solo sobre restantes.
- [ ] **AC-S.2** Suppression por `match.ruleId` + `apiPath` ⇒ matchea solo esos findings.
- [ ] **AC-S.3** Suppression sin `reason` o sin fingerprint/match ⇒ exit 2 al cargar.
- [ ] **AC-S.4** `severities.yaml` override cambia severity en findings y en conteo de summary.
- [ ] **AC-S.5** skillsDir inexistente / vacío ⇒ analyze igual que hoy (sin `skillsSuppressed` en summary).
- [ ] **AC-S.6** YAML skills inválido ⇒ exit 2 con path + mensaje, sin stack.
- [ ] **AC-S.7** Drafts con `draft: true` **no** generan findings hasta promovidos/`draft: false`.
- [ ] **AC-S.8** Orden de load de suppressions vs severities no cambia reportHash (INV-2 / snapshot).
- [ ] **AC-S.9** e2e: re-analyze tras agregar suppression manual al YAML refleja el cambio sin `learn` (FR-34).
- [ ] **AC-S.10** Console muestra `(skills: N suppressed)` cuando N>0.
- [x] **AC-S.11** Entry con `expires` válido + `owner` carga ok; `expires` con formato/fecha inválida u `owner` vacío ⇒ exit 2 al cargar.
- [x] **AC-S.12** Waiver vencido ⇒ finding visible, `skillsSuppressed` no lo cuenta, stderr trae `suppression expired`.
- [x] **AC-S.13** Waiver (no vencido) que no matchea nada ⇒ stderr trae `suppression matches no findings`; el análisis sigue exit normal.
- [x] **AC-S.14** `suppress --expires YYYY-MM-DD --owner NAME` y feedback `learn` con `expires`/`owner` escriben el entry; `expires` inválido ⇒ error honesto exit 2.

## 5. Test plan

| Caso                                          | Tipo          |
| --------------------------------------------- | ------------- |
| load schema ok / bad version / missing reason | unit          |
| fingerprint + match suppression               | unit + e2e    |
| severity override e2e                         | e2e           |
| drafts not evaluated                          | e2e           |
| determinism load order                        | unit          |
| no-regresión sin skillsDir                    | e2e existente |

## 6. Dependencias

- `f1-engine` / `f1-analyze` (evaluate, fingerprints)
- `f2-config` (`skillsDir`)
- `f2-custom-rules` (schema de drafts)
- `f3-init` (puede ir en paralelo; e2e usa scaffold)

## 7. Riesgos y decisiones abiertas

| Tema                                         | Decisión                                                                                                                                       |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `summary.suppressed` vs `skillsSuppressed`   | **Separados:** `suppressed` = baseline (f2); `skillsSuppressed` = skills (f3). Ambos pueden coexistir en summary; console muestra ambos notes. |
| ¿skillsSuppressed siempre presente?          | Solo si `> 0` (evita cambiar reportHash de runs sin skills útiles).                                                                            |
| Precedencia severity: config rules vs skills | **flag/config rules > skills severities > pack default.** Skills son "del equipo en git"; config local puede pinchar en PR.                    |
| apiPath regex                                | Seguridad: reusar la misma safe-regex que el engine (sin catastrophic backtracking); límite de longitud.                                       |
| drafts location                              | Solo `skillsDir/drafts/*.yaml`; no se auto-agregan a `customRules` de config.                                                                  |
| INV-7                                        | analyze solo **lee** skills; nunca escribe (learn/init escriben).                                                                              |

## Changelog

- 2026-09-24 · Spec creado desde SDD v1.0 §7 Fase 3 + FR-33/34 + doc 03 §8.
- 2026-09-24 · M3.1 implementado: `skills.ts` loader + wire analyze + reporters `skillsSuppressed` + tests AC-S.1…10. Flag `--skills-dir` agregado a analyze.
- 2026-09-24 · Cierre fase 3 con M3.3 → `cerrada`.
- 2026-09-30 · Waivers con expiración (AC-S.11…14, backlog M8.6): `expires` + `owner` opcionales en suppressions; vencido ⇒ ignorado + warning; huérfano ⇒ warning; `suppress --expires/--owner` y feedback `learn` los escriben.
