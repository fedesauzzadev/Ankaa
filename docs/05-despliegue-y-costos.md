# 05 · Despliegue y costos

ApiGovScan · SDD · v1.0

---

## 1. Superficie de despliegue

| Superficie | Para qué | Requisito del usuario | Costo usuario |
|---|---|---|---|
| **CLI npm (npx)** | Análisis, learn, baseline, MCP stdio | Node ≥ 20 | $0 |
| **GitHub Action** | Gate en PR | repo GitHub | $0 (minutes del repo) |
| **Docker image + Compose** | Self-host de servicios de borde / CI containers / dev | Docker | $0 |
| **Cloudflare Workers** | Distribución de packs, MCP remoto de consulta, cron de fuentes | cuenta CF free | $0 (free tier) |

**Principio:** el camino core (analizar un spec) **no depende de ninguna de las superficies 3–4**.

## 2. CLI (canal primario)

### Distribución

```jsonc
// packages/cli/package.json
{
  "name": "@apigovscan/cli",
  "type": "module",
  "bin": { "apigovscan": "./dist/bin.js" },
  "engines": { "node": ">=20" },
  "files": ["dist", "packs/elite"]  // pack embebido para 0 red
}
```

```bash
# uso sin instalación
npx @apigovscan/cli analyze ./openapi.yaml

# instalación global opcional
npm i -g @apigovscan/cli && apigovscan analyze .
```

### Comandos v1

| Comando | Descripción |
|---|---|
| `analyze <path>` | Analiza spec(s); options: `--format`, `--rules`, `--rule`, `--baseline`, `--write-baseline`, `--fail-on`, `--output` |
| `init` | Crea `.apigovscan/` + `apigovscan.yaml` de ejemplo |
| `rules list` / `explain <id>` / `validate <file>` | Gestión de reglas |
| `learn --report --feedback` | Aplica feedback (INV-5) |
| `skills list` / `promote <id>` | Drafts y suppressions |
| `standards list` / `info` / `pin` / `update` | Packs (update es opt-in explícito) |
| `mcp` | Server MCP stdio |

### Empaquetado

- Bundle con `tsup` (o equivalente) a ESM + dependencias mínimas externas.
- Pack `elite` **dentro** del tarball → `analyze` 100% offline (INV-1).
- Opcional `standards update` descarga packs *adicionales* del registry (nunca implicit durante analyze).
- Source maps publicados; tipos `d.ts` para consumo programático de `core`.

### Release

- **changesets** en monorepo; tags `cli@x.y.z`, `core@x.y.z`, etc.
- GitHub Release + changelog automático.
- npm provenance/`--provenance` cuando el repo esté público (supply chain, ver 06).

## 3. GitHub Action (fase 5)

```yaml
# .github/workflows/apigovscan.yml (usuario)
jobs:
  apigovscan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./action            # hoy in-repo; <owner>/<repo>@v1 al publicarse
        id: apigovscan
        with:
          path: specs/
          format: sarif
          fail-on: error
      # Opcional: SARIF upload; el gate funciona sin codeql
      - uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: ${{ steps.apigovscan.outputs.sarif-path }}
```

- El action corre el **mismo CLI** (no lógica duplicada): 3 corridas — artefacto
  (`--format sarif --fail-on never`), annotations (`::error/::warning/::notice`) y
  summary+gate (`--format markdown` → `$GITHUB_STEP_SUMMARY`).
- Outputs: annotations en PR, job summary Markdown, `sarif-path` + `exit-code`.
- `standards-version` (pin de packs) queda pendiente hasta el registry (fase 6).
- Inputs/outputs completos en [`action/README.md`](../action/README.md); dogfood en
  `.github/workflows/apigovscan.yml` (`uses: ./action`).

### 3.1 Instalación privada del producto (f6-distribution)

ApiGovScan se distribuye **privado** (licencia comercial por cliente; ver
`packages/cli/LICENSE.md`). Dos canales, ambos offline-first:

**a) Tarball self-contained (air-gap):**

```bash
# vendor (este repo): pack + verificación de instalación offline
pnpm pack:cli          # -> dist-release/apigovscan-cli-<version>.tgz
pnpm verify:pack       # npm i --offline en temp + analyze e2e

# cliente (sin red):
npm install -g ./apigovscan-cli-<version>.tgz
APIGOVSCAN_LICENSE_KEY=AGS-<...> apigovscan analyze ./specs/
```

El tarball lleva el CLI **bundled** (esbuild, cero dependencies) + pack `elite`
embebido — no requiere registry ni red para nada.

**b) Registry privado (updates):** workflow `release` (manual) publica a
GitHub Packages (`npm.pkg.github.com`) si hay `NPM_TOKEN`; el cliente configura
ese registry con su token de org.

**c) Docker (air-gap):** `docker/Dockerfile` sobre el tarball —
`docker build --build-arg TARBALL=apigovscan-cli-<version>.tgz .`.

**Licencias (offline, INV-1):** el vendor genera keys con
`pnpm gen:license -- --customer acme --expiry 20270926` (HMAC embebido, sin
phone-home). Se usan vía `--license-key`, `APIGOVSCAN_LICENSE_KEY` o
`license.key` en `apigovscan.yaml`; `analyze` y `mcp` las exigen (exit 2).
`apigovscan license` valida y muestra customer/expiry. Rotación de secret =
nueva versión del CLI (ver riesgos en `specs/f6-distribution.md`).

## 4. Docker y Docker Compose

### 4.1 Imágenes

| Imagen | Uso |
|---|---|
| `ghcr.io/apigovscan/cli:<tag>` | CLI en CI sin Node del host; `docker run --rm -v $PWD:/work ghcr.io/apigovscan/cli analyze /work/specs` |
| `ghcr.io/apigovscan/standards-sync:<tag>` | Job que replica fuentes → packs (self-host) |
| `ghcr.io/apigovscan/registry:<tag>` (o nginx+caddy) | Sirve packs versionados estáticos |

### 4.2 `docker-compose.yml` (self-host / dev)

```yaml
# docker/docker-compose.yml — servicios de borde locales (sin CF)
services:
  registry:
    image: nginx:alpine
    volumes:
      - ./packs-mirror:/usr/share/nginx/html:ro
    ports: ["8080:80"]
  standards-sync:
    image: ghcr.io/apigovscan/standards-sync:latest
    environment:
      MODE: draft-local        # genera draft en volumen; no publish solo
      SOURCES_FILE: /app/sources.yaml
    volumes:
      - ./packs-mirror:/out
    # schedule via cron del host o `restart` + interval en tooling
  miniflare:                   # dev del worker CF, no producción
    image: node:20
    working_dir: /app
    command: sh -c "pnpm i && pnpm dev:worker"
    volumes:
      - ..:/app
    ports: ["8787:8787"]
```

**Uso:**

- **Dev:** `miniflare` para iterar el worker sin deploy.
- **Self-host team:** `registry` + `standards-sync` reemplazan a Cloudflare (ADR-010); el CLI apunta con `standards.registryUrl: http://localhost:8080`.
- **CI determinista:** imagen `cli` con specs montadas.

### 4.3 Dockerfile CLI (multi-stage, referencia)

```
FROM node:20-alpine AS build   # pnpm, compile, bundle
FROM node:20-alpine AS runtime # solo dist + pack, USER nonroot
ENTRYPOINT ["apigovscan"]
```

- Base alpine, usuario non-root, sin shell en runtime si es viable.
- `docker compose` **no** es requisito para usar el producto (solo superficie opcional).

## 5. Cloudflare (servicios de borde)

### 5.1 Qué corre ahí

| Worker | Trigger | Función |
|---|---|---|
| `apigovscan-standards` | Cron semanal + HTTP | Sync de fuentes, servir `GET /packs*`, MCP remoto de consulta |
| (futuro) `apigovscan-api` | HTTP | Solo si aparece necesidad real (no en v1) |

Storage:

- **R2:** bundles de packs por versión (objetos inmutables, cache largo, sin egress a internet de CF→usuario en la práctica de objetos pequeños; R2 zero egress).
- **KV:** manifiestos `stable.json` / `canary.json` (lectura frecuente, TTL corto).

### 5.2 Límites verificados (free tier, sept 2026)

| Limite | Free | Implicación para ApiGovScan |
|---|---|---|
| Requests | 100.000/día | Sobrado para distribución de packs + MCP consulta |
| CPU / request | **10 ms** | Sirve JSON/YAML pre-armados; **no** parsea specs de usuarios (correcto por diseño) |
| Memory | 128 MB | Packs pequeños OK |
| Subrequests | 50/req | Sync con caching/ETag OK en cron (cron CPU: 10 ms free — el sync real puede necesitar paid o aprtarse a Actions) |
| Cron triggers | 5/cuenta | 1 basta |
| KV reads | 100.000/día | Manifiestos OK |
| R2 | 10 GB-mes storage free | Packs de texto:_MB total → mesas en free por años |

**Nota de diseño:** el cron de sync puede exceder 10 ms CPU en free. Estrategia: hacer el diff barato en worker y el parseo/pesado en **GitHub Actions** del repo de estándares (gratis para repos públicos), publicando artifacts a R2 via OIDC/token. El worker solo publica manifiestos y sirve lecturas. Esto mantiene **$0**.

### 5.3 Deploy

- `wrangler deploy` en CI del monorepo (tag `worker@x.y.z`).
- Environments: `dev` (workers.dev), `staging` (canary channel), `prod` (stable).
- Secrets: token de publicación R2, token para abrir PRs de draft (o el worker solo abre issues y el PR lo hace Actions).

### 5.4 MCP remoto en CF

- Transport **Streamable HTTP** en `/mcp` (guía actual CF: usar patrón `mcp-worker` moderno, no `McpAgent` deprecated en templates nuevos).
- Tools: solo consulta de estándares (ADR-009, FR-52).
- Auth v1: **opcional** workers.dev público de solo lectura (datos públicos de todas formas); si se añade rate limit → Cloudflare Access o API key en header.

## 6. MCP local (stdio) — despliegue "en el cliente"

```bash
apigovscan mcp
# o
npx @apigovscan/cli mcp
```

Registro ejemplo (Claude/Cursor/opencode):

```json
{
  "mcpServers": {
    "apigovscan": {
      "command": "npx",
      "args": ["-y", "@apigovscan/cli", "mcp"]
    }
  }
}
```

- Corre en la misma máquina que el cliente LLM → acceso a paths locales → **cero** subida de specs.
- Sin dependencia de CF.

## 7. Entornos

| Entorno | Qué | Dónde |
|---|---|---|
| `local` | CLI + fixtures + miniflare | laptop dev |
| `ci` | tests, INV-1..5, matriz OS | GitHub Actions |
| `staging` | worker + canal canary | CF workers.dev / namespace separado |
| `prod` | worker stable + R2/KV | CF dominio propio (después) o workers.dev |

No hay entorno "analysis-hosted" — no existe por diseño (ADR-003).

## 8. Presupuesto ($0)

### Usuario final (caso típico)

| Ítem | Costo |
|---|---|
| CLI + pack elite embebido | $0 |
| Specs locales / CI | $0 (minutos del repo) |
| MCP stdio | $0 |
| **Total** | **$0** |

### Operador del proyecto (ApiGovScan OSS / internamente)

| Ítem | Plan | Costo |
|---|---|---|
| Cloudflare Workers + KV + R2 (packs) | Free | $0 |
| GitHub (repo + Actions para sync/publish) | Free / Free | $0 |
| Dominio (si se sale de workers.dev) | opcional | ~$10/año (aceptable; no bloquea) |
| npm registry | public | $0 |
| Telemetría de uso | **no existe** (by design) | $0 |
| **Total operador** | | **$0** (+ dominio opcional) |

### Si crece (señales de upgrade, no inevitables)

| Señal | Upgrade | Costo aprox. |
|---|---|---|
| Sync pesado + PRs automation | CF Workers Paid o más Actions minutes | $5/mo |
| MCP remoto con auth + volumen | CF Access / Workers Paid | $0–5/mo |
| Registry multi-tenant (orgs) | R2 más operación | ~$0 hasta GBs |
| Soporte comercial / SaaS dashboard | producto aparte (fuera de alcance v1) | pricing futuro |

## 9. CI del propio monorepo

```yaml
# .github/workflows/ci.yml (referencia)
jobs:
  test:
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint && pnpm typecheck && pnpm test
      - run: pnpm test:invariants   # INV-1..INV-5
  pack-validate:
    steps: [...valida packs/elite contra schema + fixtures de ruido...]
  release:
    if: startsWith(github.ref, 'refs/tags/')
    steps: [changesets, npm publish --provenance, wrangler deploy]
```

## 10. Observabilidad del producto

- CLI: `--debug` imprime etapas y timings (sin contenido del spec).
- Worker: `wrangler tail` + logs estructurados (pack version, etag hit/miss).
- Sin analytics de telemetría central (NFR-01); si algún día se necesita, opt-in explícito y sin payloads de specs — cambio de política que requiere bump major + ADR.

## 11. Matriz de criticidad vs superficie

| Capa | Si cae… | El usuario… |
|---|---|---|
| CLI local | n/a | no aplica |
| Registry de packs | | sigue con packs embebidos + pin local |
| MCP remoto CF | | sigue con MCP stdio + CLI |
| Cron de fuentes | | packs se desactualizan (changelog quieto), análisis sigue |
| GitHub Action repo | | puede correr CLI en su propio CI |

**Ningún outage de infraestructura de ApiGovScan detiene `analyze` local** — salvo que el usuario dependiera de `standards update` ese día (y aun así tiene el último pack cacheado).

---

*Continuar: [06-seguridad.md](06-seguridad.md).*
