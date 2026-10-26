---
name: 'Redbox Controllers'
description: 'Implement ReDBox HTTP routes with explicit transport inputs, policies and owned domains.'
---

# ReDBox HTTP routes

Read `support/wiki/Controllers-Architecture.md` for route/policy composition and
`support/wiki/V6-Client-Compatibility.md` for public behavior changes.
Core transports live in `packages/redbox-core/src/http/express`; API contracts
live in `src/api-routes`. Call domains through explicit inputs. Keep actor, brand,
CSRF and object authorization at their declared admission boundaries. Return the
versioned owned response contract and record safe operation failures.

For extension routes, export a `RedboxExtension` declaration with named routes,
actions and access, and bind the selected factory explicitly. Use the v6 CLI
scaffold and validate the emitted declaration and actual HTTP behavior.
