# Tasks · f8-scan-org

Plan: [plans/f8-scan-org.md](../plans/f8-scan-org.md) · Spec: [specs/f8-scan-org.md](../specs/f8-scan-org.md)

## M8.4 — scan-org batch

- [ ] `scan.ts` aggregateScans + loadGroupMapping + unit (AC-SO.1–3 parcial)
- [ ] `github.ts` listOrgRepos (Link next, max-repos) + cloneRepo (git shallow)
- [ ] CLI `scan-org` (modos local/github, por-repo analyze en memoria, formatos, --out/--force, exit 0/2) (AC-SO.1, .4–8, .10)
- [ ] E2E local: paridad vs analyze, grupos, determinismo, INV-7
- [ ] E2E `--github`: stub 2 páginas + clones `file://` + roto → skipped
- [ ] Boundary (fetch solo llm+github; scan puro) (AC-SO.9)
- [ ] Help/README/índices
- [ ] `pnpm check` verde
- [ ] Spec `f8-scan-org` → `cerrada` + índices
