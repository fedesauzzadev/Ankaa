# Tasks · f8-certify

Plan: [plans/f8-certify.md](../plans/f8-certify.md) · Spec: [specs/f8-certify.md](../specs/f8-certify.md)

## M17.2 — certify/verify

- [x] `certify.ts`: gen-keys PEM, fingerprint, buildAttestation/verifyAttestation (ed25519 detached, determinista), loaders estrictos
- [x] CLI `ankaa certify` (gate licencia; `--gen-keys` sin gate) + `ankaa verify` (sin gate) + usage
- [x] Tests unit AC-CF.6/8 (malformadas, determinismo)
- [x] Tests e2e AC-CF.1…5/7/9 (roundtrip, tamper, clave cruzada, gating, INV-7)
- [x] README sección Attestations + índices (`plans/README.md`)
- [x] `pnpm check` verde
- [x] Spec `f8-certify` → `implementada`
