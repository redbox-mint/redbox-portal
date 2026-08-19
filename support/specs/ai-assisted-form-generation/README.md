# AI-assisted form generation

Status: proposed

Primary delivery target: customer-facing proof of concept

Initial use case: Research Activity to institutional RDMP

Initial model gateway: OpenRouter

This directory defines a generic ReDBox capability for generating validated form values from existing records, researcher-reviewed context, and approved institutional guidance. The first vertical slice helps a researcher create a data management plan, but the platform concepts deliberately do not contain DMP-specific assumptions.

## Documents

- [Requirements and decisions](requirements.md) — agreed scope, workflows, constraints, acceptance criteria, and POC boundary.
- [Design](design.md) — data model, services, APIs, form-runtime integration, UI, security, and consistency analysis.
- [Implementation plan](implementation_plan.md) — phased, file-level delivery sequence from POC to the complete configurable feature.
- [Task list](task.md) — executable tasks with interleaved unit, integration, API, and browser-verification gates.

## Delivery boundary

The POC implements the end-to-end researcher experience and persists bootstrap-seeded configuration. Full admin management screens and non-OpenRouter provider adapters are designed now but delivered after the POC. The generation capability itself is a core feature; only representative demo record types, forms, records, and policy content belong in `redbox-hook-dev` or development bootstrap resources.

## Relationship to DMPChef

DMPChef is a useful reference for the pattern of combining project context, guidance, and a language model. It is not proposed as a runtime dependency. ReDBox should own the form-aware schema generation, permissions, provider abstraction, validation, lifecycle integration, provenance, and multi-brand isolation described here.
