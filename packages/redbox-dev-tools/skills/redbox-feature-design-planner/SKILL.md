---
name: redbox-feature-design-planner
description: Create detailed feature designs, implementation plans, and task lists for ReDBox/Redbox features that use Prisma contracts and repositories, services, webservice (REST) controllers, ajax controllers, embedded Angular apps, views, and navigation config. Use when asked to design/plan a feature or produce a task list for this stack, especially when explicit sections, non-SPA Angular patterns, and interleaved tests are required.
---

# Redbox Feature Design Planner

## Overview

Produce a detailed design, implementation plan, and task list for ReDBox features, organized by the required architecture sections and validated for internal consistency.

## Required Nuances (Must Apply)

- **Angular apps are embedded, not SPAs.** Do not design Angular routing. Pages are routed by the owned Express host and EJS views, and Angular apps mount inside those views.
- **Domains, repositories and HTTP adapters live in `@researchdatabox/redbox-core`.** Use explicit factory inputs and neutral extension declarations.
- **Handlers receive concrete inputs and use owned response functions.** Constructors and registration remain offline; the application owns initialization and shutdown.
- **Auth and routes are explicit config.** Route groups live in `packages/redbox-core/src/http/express` and auth rules in `packages/redbox-core/src/config/auth.config.ts`.
- **Hook overrides are first-class.** If the feature is delivered via a hook, declare `redbox.extension`, export `registerRedboxExtension()` and mark selected named overrides with `replaces: true`.
- **Use Hook Kit CLI generators when possible.** Check the built v6 CLI's `generate --help` for handler/service, Angular and form generators. Declare persistence fields/repositories explicitly; the model generator is retired.

## Workflow

1. Gather scope and assumptions
   - Extract: feature goal, primary users, key workflows, data entities, and required UI surfaces.
   - Ask up to 3 clarifying questions only if required to avoid blocking.
   - If information is missing, state explicit assumptions before the design.

2. Consult authoritative references (lightweight)
   - Prefer wiki docs under `support/wiki/` (Architecture, Controllers, Services, Loader, Hook Kit, Testing, Hook customization).
   - Use relevant skills: Redbox Services, Redbox Controllers, Redbox Angular Apps, Redbox Angular Services, Redbox Hook Development, Redbox Testing.

3. Produce the design in required sections
   - Use the exact section order in the Output Template below.
   - For each section, specify: purpose, new/changed files, new/changed APIs, validation rules, permissions, and edge cases.
   - Keep names consistent across sections (models, services, controllers, Angular modules, routes).

4. Run consistency analysis
   - Validate the design end-to-end: models -> services -> controllers -> UI -> navigation.
   - Call out mismatches, missing artifacts, or unclear ownership.
   - List open questions and risks separately from assumptions.

5. Produce the implementation plan
   - Provide ordered steps with file-level granularity and rationale.
   - Reference relevant skills explicitly for each step.

6. Produce the task list with tests interleaved
   - Match the same section order as the design.
   - Interleave unit tests after each task, not at the end.
   - Add integration test gates exactly at the required points.
   - Explicitly mention which skills to use for each task.
   - Identify missing skills required to complete tasks.

## Output Template

Use this structure and headings verbatim. Keep content concise but explicit.

# Design

## 1. Data Contract (Prisma)

- Purpose and scope
- New/changed models and attributes
- Relationships and indexes
- Validation, lifecycle hooks, and defaults
- Access control considerations
- File locations and naming (core versus extension, and owned persistence contracts)
- Repository/service delivery requirements; no model registration or globals

## 2. Services Layer (Business Logic)

- Service responsibilities
- Public methods, inputs/outputs, and errors
- Transaction boundaries and side effects
- Dependencies on models, configs, or external services
- File locations and naming
- Domain conventions (concrete collaborators, optional `Services.Core.Service` utilities, awaited lifecycle and owned repositories)
- Export/update requirements (public entrypoints, named extension factories and selected bindings)

## 3. Webservice Controllers (REST API)

- Endpoint list (method + path)
- Request/response shapes and status codes
- Authn/authz and policy usage
- Error handling and validation (owned `sendApiData`/`sendApiErrors` contracts)
- File locations and naming
- Handler conventions (explicit typed inputs, declared policies and admitted work ownership)
- Export/update requirements (route groups, handler factories and policy bindings)

## 4. Ajax Controllers (Controllers)

- Endpoint list (method + path or action)
- Request/response shapes
- Authn/authz and policy usage
- Error handling and validation (owned `sendApiData`/`sendApiErrors` contracts)
- File locations and naming
- Handler conventions (explicit typed inputs, declared policies and admitted work ownership)
- Export/update requirements (route groups, handler factories and policy bindings)

## 5. Angular App(s)

- Apps/modules to add or modify (embedded apps only)
- Routes: **Do not use Angular Router**; specify Express/EJS page routing instead
- Components and services
- Data flow to/from APIs
- State management and error handling
- File locations and naming (Angular workspace + EJS view + assets output)
- EJS view wiring (component tag + hashed asset includes using `page.bundleHash`)
- Render path (selected Express page handler and explicit page locals)

## 6. Additional Views

- View templates to add/modify
- Server-side data needed to render
- Where the selected page handler is bound
- Package-relative view/asset declaration and installed artifact behavior

## 7. Navigation Configuration

- Menu/route entries to add/modify
- Role/permission gating
- File locations and naming

# Consistency Analysis

- Cross-checks across all layers
- Missing pieces or conflicts
- Assumptions
- Open questions
- Risks

# Implementation Plan

- Step-by-step plan with file-level detail and skill references

# Task List (With Tests and Skill Usage)

- Sectioned tasks following the same order as the design
- Each task includes a matching unit test task
- Before any integration test run task, add a code review task using the redbox-feature-implementation-review skill with instructions:
  - If issues are found: write the result to issues.json in the project root
  - If issues are found: add two tasks immediately after the current task:
    - Fix all issues listed in issues.json and delete issues.json when done
    - Re-run the code review using redbox-feature-implementation-review
- Integration test gates:
  - After Data Model + Services: create Mocha integration tests and run them; do not continue until passing
  - After Controllers: create Bruno tests and run them; do not continue until passing
  - Final: run both integration suites again
- Each task explicitly names required skills
- End with a "Skill Gaps" subsection if any skills are missing

## Skill Guidance

- Reference existing skills by name when writing tasks.
- Prefer these skills when relevant: Redbox Services, Redbox Controllers, Redbox Angular Apps, Redbox Angular Services, Redbox Hook Development, Redbox Form Config, Redbox Testing, Web Interface Verification.
- Use the built v6 Hook Kit CLI generators when they match the task; check `generate --help`.
- If a task does not map cleanly to an existing skill, call it out under "Skill Gaps" and suggest a new skill name and scope.

## Repo Context Reminders

- Prefer wiki documentation under `support/wiki/` when referencing ReDBox architecture or conventions.
- Key docs: `Controllers-Architecture`, `Services-Architecture`, `Redbox-Loader`, `redbox-dev-tools`, `ReDBox-Automated-Tests`, `Using-a-Sails-Hook-to-customise-ReDBox`.
- Use the Coding Standards wiki for naming conventions and TypeScript rules.
- Use Redbox Testing skill guidance for Mocha and Bruno testing workflows.

## Notes on Specificity

- Be explicit enough that a smaller model can execute the plan without inference.
- Include concrete file path examples when possible.
- Avoid vague statements like "update the service"; name the service, method, and expected behavior.
