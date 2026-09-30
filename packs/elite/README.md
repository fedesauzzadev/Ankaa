# elite pack

Curated API design rule pack for ApiGovScan (placeholder for milestone M1.3).

- Versioning: CalVer (`YYYY.MM.PATCH`)
- Every rule must cite a public source (`strictSource: true`)
- See `specs/f1-elite-pack.md` for the committed rule inventory

## OWASP API Security Top 10 (2023) coverage

Methodology: static OpenAPI analysis can prove **hygiene** (auth declared, TLS, documented errors, versioning), not **behavior** (who may access which object, abuse of flows, SSRF fetch targets). Ratings are honest about that boundary: `full` = the static surface is covered; `partial` = building blocks checked, runtime verification still needed; `none` = not statically detectable.

| OWASP item                                                | Coverage | Elite rules                                                                                             | Note                                                                                                            |
| --------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| API1:2023 Broken Object Level Authorization               | partial  | AUTH-001, AUTH-003                                                                                      | Auth must be declared and schemes must exist; per-object decisions need runtime tests.                          |
| API2:2023 Broken Authentication                           | full     | AUTH-001, AUTH-002, AUTH-003, AUTH-004, AUTH-005, AUTH-006, SEC-004, ERR-008                            | Declaration, validity, transport, credential placement, scope definitions, 401 challenges.                      |
| API3:2023 Broken Object Property Level Authorization      | partial  | SEC-003                                                                                                 | Sensitive fields flagged in 2xx responses; no readOnly/writeOnly modeling.                                      |
| API4:2023 Unrestricted Resource Consumption               | partial  | PERF-002, PAG-002, ERR-007                                                                              | RateLimit/Retry-After headers and page bounds documented; quotas themselves are runtime.                        |
| API5:2023 Broken Function Level Authorization             | partial  | AUTH-001, AUTH-002                                                                                      | Auth presence checked; roles and admin paths are not modeled statically.                                        |
| API6:2023 Unrestricted Access to Sensitive Business Flows | partial  | PERF-002, ERR-007                                                                                       | Throttling signals documented; flow abuse (stuffing, scalping) needs behavioral analysis.                       |
| API7:2023 Server Side Request Forgery                     | none     | —                                                                                                       | Fetch targets of URL-valued fields are not validated; SEC-002 (https) is adjacent, not SSRF.                    |
| API8:2023 Security Misconfiguration                       | full     | SEC-001, SEC-002, SEC-003, AUTH-003, AUTH-005, AUTH-006, ERR-008                                        | TLS, scheme validity, credential placement, secret examples, auth challenges.                                   |
| API9:2023 Improper Inventory Management                   | partial  | STRUCT-001, STRUCT-002, STRUCT-003, STRUCT-004, VER-001, VER-002, VER-003, DEPR-001, DEPR-002, DEPR-003 | Versions, hosts, deprecation and sunset documented; staging/prod parity and zombie APIs need runtime inventory. |
| API10:2023 Unsafe Consumption of APIs                     | none     | —                                                                                                       | Outward third-party calls are not modeled in service specs.                                                     |

Table audited 2026-09-30 against elite@2026.09.1 (95 rules). Re-audit on every pack minor.
