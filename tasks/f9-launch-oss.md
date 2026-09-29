# Tasks · f9-launch-oss

Plan: [plans/f9-launch-oss.md](../plans/f9-launch-oss.md) · Spec: [specs/f9-launch-oss.md](../specs/f9-launch-oss.md)

## M9.1 — papeles de lanzamiento OSS (sin publicar)

- [x] `packages/cli/LICENSE.md` → Apache-2.0 + copyright; `license`/`author` en `package.json` (raíz + cli + resto de packages unificados)
- [x] Community key con secreto local (no commitear secreto) + roundtrip `license --key` + `analyze` mismo `reportHash`
- [x] README sección lanzamiento + split OSS/pago + key comunitaria
- [x] Grep de secreto + repo sigue privado + sin publish
- [x] `pnpm check` verde + `verify-pack` OK
- [x] Spec `f9-launch-oss` → `cerrada` + índices
