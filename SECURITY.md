# Security Policy · ApiGovScan

## Supported versions

Security fixes land on the latest release only. The `0.0.0-dev` tree receives fixes on `main`.

## Reporting a vulnerability

Open a private security advisory on GitHub (preferred) or contact the maintainer at
https://github.com/fedesauzzadev. Please include:

- affected version/commit and command (`analyze`, `mcp`, `dashboard`, …),
- a minimal spec or input that reproduces it,
- impact assessment if known.

We aim to acknowledge within 5 business days. Do not open public issues for
vulnerabilities (especially parser hardening: YAML aliases, `$ref` handling —
see INV-1/INV-4).

## Scope notes

- `analyze` performs zero network calls by design (INV-1); a finding that shows
  otherwise is treated as a security bug.
- The local dashboard binds `127.0.0.1` only; hosting it elsewhere is the
  operator's risk (see ADR-013).
- License keys are offline HMAC tokens; losing a key cannot leak specs
  (nothing ever leaves the machine).
