# f8-certify · Attestations firmadas de reportes (certify/verify)

| Campo     | Valor                                                                              |
| --------- | ---------------------------------------------------------------------------------- |
| Estado    | implementada                                                      |
| Fase      | 8 (backlog [f17](../plans/f17-diferenciales.md) T1 #1)                             |
| Fecha     | 2026-09-30                                                                         |
| Deriva de | `f1-reporters` (report JSON); `f6-distribution` (licencia offline); INV-1/INV-2/INV-7 |

## 1. Objetivo / historia de consumidor

Una GitHub Action (o cualquier CI) verifica el reporte producido por una
corrida de agente o de una persona **antes** de usar su score o su gate:
nadie puede alterar el reporte después de generado sin que la verificación
falle. El productor firma; el consumidor tiene la clave pública pineada en el
repo. Todo offline, todo local, cero dependencias nuevas (`node:crypto`).

**User story canónica:**

> Given un `report.json` firmado con la clave privada del productor,  
> When el CI corre `ankaa verify` con la pública pineada,  
> Then exit 0 si los bytes del reporte no cambiaron; exit 1 si cambiaron o la
> firma no corresponde; nunca un "válido" silencioso ante manipulación.

## 2. Decisiones (dueño, 2026-09-30)

| Tema             | Decisión                                                                        |
| ---------------- | ------------------------------------------------------------------------------- |
| Firma            | ed25519 **detached** sobre los **bytes crudos del archivo** `report.json`       |
| Attestation      | JSON v1 separado (`reportSha256` + `signature` + `publicKeyFingerprint` + tool) |
| Custodia        | El consumidor genera el par; pública pineada en el repo; privada = secret del productor |
| KMS/HSM         | Fuera de v0 (candidato F7 enterprise)                                            |
| Claves          | PEM: privada PKCS#8, pública SPKI (generables con `--gen-keys` u openssl)        |
| Licencia        | `certify` gated (produce valor de producto); `verify` **ungated** (consumidor)   |

## 3. Contrato

### CLI

```bash
# Generar el par de claves (local, sin licencia)
ankaa certify --gen-keys --private-out <f.pem> --public-out <f.pem> [--force]

# Firmar un reporte (requiere licencia como analyze)
ankaa certify --report <r.json> --key <private.pem> [--out <attestation.json>] [--force]

# Verificar (sin licencia: el consumidor no es cliente necesariamente)
ankaa verify --report <r.json> --attestation <a.json> --key <public.pem>
```

### Attestation v1 (orden de keys estable, INV-2)

```json
{
  "version": 1,
  "algorithm": "ed25519",
  "reportSha256": "<64 hex — sha256 de los bytes crudos del reporte>",
  "signature": "<base64 — ed25519 sobre los bytes crudos del reporte>",
  "publicKeyFingerprint": "<64 hex — sha256 del DER SPKI de la pública>",
  "tool": { "name": "ankaa", "version": "<versión>" }
}
```

- `certify` valida que el reporte sea JSON con root objeto antes de firmar.
- `certify` sin `--out` imprime la atestación a stdout; con `--out` escribe el
  archivo (rechaza existente sin `--force`, deja `.bak` con `--force`? **no**:
  solo rechaza; sin `.bak` en v0) e imprime `wrote: <path>`.
- ed25519 es determinista: mismos bytes + misma clave ⇒ atestación
  **byte-idéntica** (verificable en tests).
- `verify` estricta: schema exacto (keys desconocidas ⇒ exit 2), luego
  fingerprint de la clave, `reportSha256` y firma — en ese orden, con mensajes
  que digan **qué** falló.

### Exit codes

| Comando  | 0                    | 1                              | 2                                  |
| -------- | -------------------- | ------------------------------ | ---------------------------------- |
| certify  | atestación emitida   | —                              | flags/load/parse, licencia, `--out` existente sin `--force` |
| verify   | reporte verificado   | bytes cambiados / firma inválida / fingerprint no corresponde | archivos faltantes, attestation/key malformados |

## 4. Límites (invariantes)

- Sin red; sin KMS; sin claves en el repo (INV-1; docs muestran openssl/node).
- Escribe solo outputs explícitos: `--out`, `--private-out`, `--public-out` (INV-7).
- Sin `Date.now()` ni timestamps en la atestación: determinista (INV-2).
- La atestación no afirma calidad del análisis: firma bytes, no intenciones.
- No proteger la clave privada es responsabilidad del productor (documentado).

## 5. Criterios de aceptación

- [x] AC-CF.1 `--gen-keys` escribe par PEM (PKCS#8/SPKI) y rechaza existentes
      sin `--force`; no requiere licencia.
- [x] AC-CF.2 `certify` emite atestación v1 con `reportSha256` y firma
      correctos sobre los bytes crudos; salida stdout y `--out` + `wrote:`.
- [x] AC-CF.3 `verify` exit 0 sobre reporte y clave legítimos, con resumen
      legible (sha256 y fingerprint).
- [x] AC-CF.4 Un byte cambiado en el reporte ⇒ exit 1 con mensaje que dice qué
      falló (hash y firma), nunca un falso válido.
- [x] AC-CF.5 Clave pública de otro par ⇒ exit 1 (fingerprint difiere).
- [x] AC-CF.6 Attestation malformada (versión/keys/firma no base64) o key PEM
      inválida ⇒ exit 2 con mensaje claro.
- [x] AC-CF.7 `certify` sin licencia ⇒ exit 2 (mismo gate que analyze);
      `verify` funciona sin licencia.
- [x] AC-CF.8 Determinismo: dos `certify` con mismo reporte + clave ⇒
      atestaciones byte-idénticas (INV-2).
- [x] AC-CF.9 INV-1/INV-7: sin red; solo archivos explícitos escritos.
- [x] AC-CF.10 `pnpm check` e invariantes verdes.

## 6. Test plan

| Caso                                                       | Tipo |
| ---------------------------------------------------------- | ---- |
| AC-CF.1/2: gen-keys, firma, formatos stdout/`--out`         | e2e  |
| AC-CF.3/4/5: roundtrip, tamper, clave cruzada               | e2e  |
| AC-CF.6: attestation/key malformadas                        | unit |
| AC-CF.7: gating asimétrico                                  | e2e  |
| AC-CF.8: determinismo byte a byte                           | unit |
| AC-CF.9: INV-7 (readdir del tempdir) + sin fetch             | e2e  |

## 7. Dependencias

- `f1-reporters` (report JSON, ya determinista).
- `license.ts` (gate existente).
- `node:crypto` (ed25519 nativo) — cero dependencias nuevas.

## 8. Riesgos y decisiones abiertas

- Firma sobre bytes crudos (no JSON canónico re-serializado): si el consumidor
  reformatea el archivo, verify falla — correcto y documentado.
- Futuro (F7): KMS, atestaciones en cadena, incluir `packsVersion` echo
  legible sin verificación crypto (ya está dentro de los bytes firmados).
- Action input `attestation`/`public-key` para el flujo CI completo: candidate
  a f5-action follow-up, no bloquea este spec.

## Changelog

- 2026-09-30 · Draft inicial (backlog `f8-elite-100`).
- 2026-09-30 · Dueño aprueba consumidor CI/agente, ed25519 detached, custodia
  del consumidor (§2). Estado sigue `draft` hasta ACs.
- 2026-09-30 · ACs redactados (AC-CF.1…10) + contrato completo → `ready`.
- 2026-09-30 · M17.2 implementado: `packages/cli/src/certify.ts` (ed25519 vía
  `node:crypto`, cero deps nuevas) + comandos `ankaa certify`/`ankaa verify`
  en `index.ts` + 11 tests (unit + e2e, AC-CF.1…9) · `pnpm check` verde ·
  estado → `implementada`.
