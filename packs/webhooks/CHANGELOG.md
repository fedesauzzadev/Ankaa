# Changelog · webhooks pack

Formato: CalVer `YYYY.MM.PATCH`. Breaking = quitar regla o cambiar severidad default de error↔otro.

## 2026.09.1 · unreleased

- M8.9 (`f8-webhooks`): pack inicial — **6 reglas** curadas solo con átomos DSL existentes (sin tocar `packages/core`).
- Naming (WH-001), docs (WH-002/003/004), security (WH-005), structure (WH-006).
- Fuera (backlog con átomos nuevos): verificación HMAC, retries/backoff, TLS en servers, thin-vs-full payloads, idempotencia.
