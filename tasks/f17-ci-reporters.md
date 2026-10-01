# Tasks · f17-ci-reporters

Plan: [plans/f17-ci-reporters.md](../plans/f17-ci-reporters.md) · Spec: [specs/f17-ci-reporters.md](../specs/f17-ci-reporters.md)

## M17.7a — reporters con fallback

- [x] `reporters`: xml escape + formatJunit/formatCheckstyle/formatCodequality + locationParts
- [x] CLI: `--format junit|checkstyle|codequality` (args, sink, help)
- [x] Tests unit: escapes, agrupación multi-input, severities, determinismo byte-estable, sin timestamps
- [x] Tests e2e: exit codes por formato, --output, snapshots idénticos
- [x] `examples/ci/`: gitlab-ci.yml, azure-pipelines.yml, Jenkinsfile
- [x] README + índices + changelog backlog f17
- [x] `pnpm check` verde
- [x] Spec `f17-ci-reporters` → `implementada`
