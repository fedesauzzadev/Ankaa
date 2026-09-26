# Tasks · f8-scan-org

Plan: [plans/f8-scan-org.md](../plans/f8-scan-org.md) · Spec: [specs/f8-scan-org.md](../specs/f8-scan-org.md)

## M8.4 — scan-org batch

- [x] `scan.ts` aggregateScans + loadGroupMapping + unit (AC-SO.1–3 parcial)
- [x] `github.ts` listOrgRepos (Link next, max-repos) + cloneRepo (git shallow)
- [x] CLI `scan-org` (modos local/github, por-repo analyze en memoria, formatos, --out/--force, exit 0/2) (AC-SO.1, .4–8, .10)
- [x] E2E local: paridad vs analyze, grupos, determinismo, INV-7
- [x] E2E `--github`: stub 2 páginas + clones `file://` + roto → skipped
- [x] Boundary (fetch solo llm+github; scan puro) (AC-SO.9)
- [x] Help/README/índices
- [x] `pnpm check` verde
- [x] Spec `f8-scan-org` → `cerrada` + índices
