# 06 · Seguridad

ApiGovScan · SDD · v1.0

---

## 1. Modelo de amenazas (resumen)

| # | Activo | Amenaza principal | Severidad |
|---|---|---|---|
| T1 | Confidencialidad de specs/API surface del usuario | Exfiltración accidental (red, logs, telemetría) | Crítica |
| T2 | Integridad de la supply chain del CLI | Paquete comprometido / install script malicioso | Alta |
| T3 | Disponibilidad del proceso de análisis | DoS local: YAML bomb, regex catastrófica, spec gigante | Media |
| T4 | Integridad de skills/baseline | Suppression maliciosa que apaga reglas de seguridad | Media |
| T5 | Integridad de los packs elite | Pack adulterado o update silencioso malicioso | Alta |
| T6 | Cliente LLM vía MCP | Prompt injection desde el spec → acciones del agente | Media (depende del cliente) |
| T7 | Servicios de borde CF | Abuse del MCP remoto / registry (spam, scraping) | Baja (datos públicos) |
| T8 | Reportes | Secrets del spec parpadeando en logs/CI artifacts | Media |

Correspondencia con invariantes: T1 ↔ INV-1; T3 ↔ NFR-08; T4 ↔ INV-5/INV-7; T5 ↔ INV-6 + firmas/hash de packs.

## 2. Privacidad por arquitectura (T1)

1. **No hay HTTP client en `@apigovscan/core` ni en el path de `analyze`.** Verificación: test de red (global `fetch`/`XMLHttpRequest`/`net.connect` que **falla** el test si se invoca) en CI.
2. `standards update` es comando **separado**, explícito, con log claro; jamás se invoca desde `analyze` (sin "update-check" silencioso).
3. Logs y `--debug` **nunca** imprimen el cuerpo completo del spec ni ejemplos de schema (solo paths, ruleIds, pointers).
4. Sin telemetría de uso en v1. Si se añade en el futuro: opt-in, solo conteos, ADR + major bump (política documentada en README).
5. `--output` solo escribe en rutas indicadas por el usuario; INV-7 prohíbe escribir fuera de `.apigovscan/` y outputs explícitos.

**Auditoría fácil para el usuario:** `apigovscan analyze spec.yaml --debug` + proxy ambiental opcional (`HTTPS_PROXY` a un logger) o simplemente corre en entorno red-isolate.

## 3. Hardening de parsers (T3)

Specs son **input hostil** (pueden venir de terceros o de un repo comprometido).

| Control | Límite / política |
|---|---|
| Tamaño máximo de input | default 10 MB, configurable; excede → exit 2 con mensaje |
| Alias expansion / YAML anchors | depth máx. 20; anchors por archivo máx. 1000; rechazar `!!python/...` u tags no permitidos |
| Billion laughs / quadratic expansion | parser YAML con límites de expansión (usar lib con `maxAliasCount`/equiv. o pre-scan) |
| Profundidad de JSON structure | máx. 100 niveles |
| `$ref` cycles y remote refs | **remote `$ref` (http/https) prohibidos** por defecto (INV-1); local files resueltos con path sandbox al directorio del spec raíz (no escape con `../` fuera del root sin `--allow-outside-root`) |
| Regex DSL del usuario | engine de regex seguro (límite de pasos / linear-time donde sea posible); timeout 50 ms por evaluación; patrones de reglas se validan en `rules validate` |
| Recurso de CPU | budget opcional `--max-ms` (default off en local, on en CI examples) |
| Deserialización | nada de `eval`, `Function`, `vm`, `serialize-javascript` de terceros en el camino caliente |

Path sandbox:

```
root = dirname(spec)
resolve($ref) ∈ root  ✓
resolve($ref) = /etc/...  ✗ (error de parseo, no lectura)
```

## 4. DSL: specs y reglas son datos (INV-4 / T4)

- Whitelist estricta de constructores (ver 03); YAML unknown-key ⇒ error.
- Sin propiedades dinámicas que ejecuten código; sin `__proto__` pollution (maps null-prototype, validación de keys).
- Reglas custom del usuario son **tantas como quiera**, pero siguen el mismo DSL — no hay "regla que corre npm".
- Suppression que apague reglas críticas: permitido (equipo dueño de su gate) pero:
  - `reason` obligatorio;
  - option config `protectedRules: [AUTH-*, SEC-*]` → suppression de esas reglas requiere `--allow-suppress-protected` (advertencia en console).

## 5. Skills y baseline (T4)

| Riesgo | Control |
|---|---|
| Alguien commitea suppression masiva que apaga el gate | Code review de `.apigovscan/`; `protectedRules`; CI con `--deny-suppressions-touching-protected` opcional |
| Learn duplica o corrompe skills | INV-5 idempotente + schema validation + backups timestamped en `skills/.history/` (git ya da history) |
| Baseline gigante que oculta todo | `--write-baseline` imprime conteo; opción `maxBaseline` warning; review normal de PR |
| Fingerprint collision | sha256; colisión práctica irrelevante |

## 6. Integridad de packs (T5)

1. Packs publicados son **inmutables** + CalVer (ver 04).
2. Manifiesto de release incluye **sha256 de cada bundle**; el CLI verifica hash al `standards update`.
3. Recomendación CI: **pin exacto** de versión (INV-6) — no `latest`.
4. Canal `canary` solo fuera de prod.
5. Firma cosign/attestación en GitHub Releases como hardening post-v1 (no bloqueante v1; hash ya mitiga tampering de CDN).
6. El sync de fuentes (worker/Actions) corre con credenciales mínimas: scope solo a `packs/` path; nunca write al CLI del usuario.

## 7. MCP (T6, T7)

### Local stdio (primario)

| Control | Detalle |
|---|---|
| Attack surface | Sin puerto de red; el proceso lo spawn el cliente LLM |
| Tools | Sólidos y finos: `analyze_spec(path)`, `explain_rule(id)`, … sin tool de "run arbitrary" |
| Paths | Mismo sandbox de $ref; rechazar paths fuera de cwd sin flag explícito documentado |
| Output size | Trunca findings para no inyectar kilos de texto en el contexto (top N + "use CLI para completo") |
| Prompt injection desde spec | El spec es attacker-controlled: mensajes de finding son texto plano; **nunca** instrucciones al LLM; documentar en README que el cliente debe no treat tool results como comandos (mitigación parcial, depende del cliente) |

### Remoto CF (consulta de estándares)

| Control | Detalle |
|---|---|
| Superficie | Solo lectura de packs públicos (ya publicados en registry) |
| Rate limit | CF WAF / rate limiting por IP en `/mcp` y `/packs/*` |
| Auth | v1 pública opcional; si abuse → API key o Cloudflare Access |
| No análisis remoto | FR-52: el remoto **no** acepta specs de usuarios (reduce data exposure y CPU abuse) |

## 8. Secrets en specs y reportes (T8)

- Regla `SEC-*` detecta ejemplos con shape de credencial (AWS keys, JWTs, `password:`, private keys PEM, tokens alt-entropy) → finding + **redacción en reportes** (`***REDACTED***` en preview de ejemplo).
- Reportes CI: artefactos subidos al action deben usar la versión redactada por defecto.
- `--no-redact` existe para debug local con advertencia.

## 9. Supply chain del producto (T2)

| Control | Implementación |
|---|---|
| Dependencias mínimas | audit manual de cada deps; preferir stdlib / 0-dep en core |
| Lockfile | pnpm-lock committed; `--frozen-lockfile` en CI |
| npm provenance | publish con `--provenance` cuando repo público |
| Install scripts | `ignore-scripts=true` recomendado; ningún `postinstall` nuestro |
| Code review | CODEOWNERS en `packages/core`, `packs/` |
| Release | tags anotados + changelog; imágenes GHCR con SBOM (fase 5+) |
| Análisis estático | `npm audit` / `pnpm audit` en CI (fail en high) |
| Runtime | sin eval; test grep de `eval(`/`new Function` en core |

## 10. Seguridad del worker / registry (T7)

- TLS siempre (CF termina TLS).
- Headers: `X-Content-Type-Options: nosniff`, cache `immutable` solo para URLs con versión, no para manifiestos de canal.
- No almacenar nada de usuarios (no hay uploads).
- Secrets en CF: wrangler secrets; mínimo privilegio token R2 (`Object Read & Write` solo bucket `packs/`).
- Dependencias del worker: oficiales CF (`workers-types`, SDK); sin frameworks pesados.

## 11. Modelo de amenazas de insider del repo (equipo)

No pretendemos defender contra un admin malicioso del repo que edita skills — eso es igual a que edite el CI. Documentamos el límite: **la confianza base es el code review del repo del usuario.**

## 12. Checklist de release de seguridad

- [ ] Test INV-1 (red) verde
- [ ] Test INV-4 (sin eval) verde
- [ ] Limits de YAML/depth activos con fixtures de ataque en repo (`fixtures/attacks/*.yaml`)
- [ ] `pnpm audit` sin high
- [ ] Verificación de hash de packs en tests de `standards update`
- [ ] Redacción de secrets probada en reportes
- [ ] MCP: schema de tools revisado (sin tool expansivo)
- [ ] CHANGELOG menciona cambios de seguridad

## 13. Disclosure

Cuando el repo sea público: `SECURITY.md` con email/GitHub private advisory; compromiso de respuesta 7 días para high.

---

*Fin de la documentación SDD v1.0. Próximo paso: validación del usuario y apertura de specs/plans/tasks (spec-driven development) para Fase 0–1.*
