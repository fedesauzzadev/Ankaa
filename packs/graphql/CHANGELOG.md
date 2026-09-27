# Changelog · graphql pack

Formato: CalVer `YYYY.MM.PATCH`. Breaking = quitar regla o cambiar severidad default de error↔otro.

## 2026.09.1 · unreleased

- M8.6 (`f8-graphql`): pack inicial — **8 reglas** curadas solo con átomos DSL existentes (sin tocar `packages/core`).
- Naming (GQL-001/005/006/007), docs (GQL-002/003/009), deprecación con reason (GQL-004).
- Fuera (backlog con átomos nuevos): enums consistentes (`enumCasingInconsistent` no ve enums anidadas en properties), sensibles en payloads (`sensitiveFieldInResponse` solo inspecciona status 2xx), Relay pagination, cost/complexity, verbo-tense en subscriptions, input-único en mutations, introspection en prod.
