# Plan f8-certify · Attestations firmadas (certify/verify)

| Campo     | Valor                                          |
| --------- | ---------------------------------------------- |
| Estado    | cerrado (M17.2 completo)               |
| Fase      | 8 (backlog [f17](f17-diferenciales.md) T1 #1)  |
| Fecha     | 2026-09-30                                     |
| Deriva de | [spec f8-certify](../specs/f8-certify.md) (`ready`) |

## M17.2 — certify/verify (slice único)

1. `packages/cli/src/certify.ts`: keypair PEM (PKCS#8/SPKI), fingerprint sha256
   de la pública, `buildAttestation` (ed25519 detached sobre bytes crudos),
   `verifyAttestation` (fingerprint → hash → firma), loaders estrictos.
2. CLI: `certify` (gated, `--gen-keys` ungated) y `verify` (ungated) en
   `index.ts` + usage/help.
3. Tests: unit (determinismo, tamper, malformadas) + e2e (flujo completo
   analyze→certify→verify, gating asimétrico, INV-7).
4. Docs: README (sección Attestations) + índices.

## Definition of done

- AC-CF.1…10 verdes; `pnpm check` + invariantes verdes; spec → `implementada`.

## Changelog

- 2026-09-30 · Plan creado con las decisiones del dueño ya en la spec.
- 2026-09-30 · M17.2 completo: `certify.ts` + `certify`/`verify` + 11 tests ·
  `pnpm check` verde · spec → `implementada`.
