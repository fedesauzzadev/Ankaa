# Changelog · grpc pack

Formato: CalVer `YYYY.MM.PATCH`. Breaking = quitar regla o cambiar severidad default de error↔otro.

## 2026.09.1 · unreleased

- M8.7 (`f8-grpc`): pack inicial — **7 reglas** curadas solo con átomos DSL existentes (sin tocar `packages/core`).
- Naming (GRPC-001/002/006), docs (GRPC-003/004/005), package (GRPC-007).
- Fuera (backlog con átomos nuevos): `{Method}Request/Response` (AIP-121), field numbers nunca reutilizados (diff cross-versión), paginación `page_token` (AIP-158), `google.api.http` transcoding, buf-breaking.
