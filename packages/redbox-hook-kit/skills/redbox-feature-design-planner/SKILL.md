---
name: redbox-feature-design-planner
description: Create detailed feature designs, implementation plans, and task lists for ReDBox/Redbox features that use Waterline models, services, webservice (REST) controllers, ajax controllers, embedded Angular apps, views, and navigation config. Use when asked to design/plan a feature or produce a task list for this stack, especially when explicit sections, non-SPA Angular patterns, and interleaved tests are required.
---

# Redbox Feature Design Planner

## Overview

Produce a detailed design, implementation plan, and task list for ReDBox features, organized by the required architecture sections and validated for internal consistency.

## Required Nuances (Must Apply)

- **Angular apps are embedded, not SPAs.** Do not design Angular routing. Pages are routed by Sails + EJS views, and Angular apps mount inside those views.
- **Controllers/services/models live in `@researchdatabox/redbox-core-types` and are surfaced via shims.** Respect loader/shim behavior and registration conventions.
- **Controllers use `init()` + `_exportedMethods` and respond via `sendResp`.** Avoid `sails` usage in constructors.
- **Auth and routes are explicit config.** Route entries live in `packages/redbox-core-types/src/config/routes.config.ts` and auth rules in `packages/redbox-core-types/src/config/auth.config.ts`.
- **Hook overrides are first-class.** If the feature is delivered via a hook, ensure `package.json` `sails` capabilities match exports and that overrides use the same names as core components.
- **Use Hook Kit CLI generators when possible.** Prefer `redbox-hook-kit` generators for scaffolding controllers, services, models, Angular apps/services, and form fields.

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

## 1. Data Model (Waterline Models)
- Purpose and scope
- New/changed models and attributes
- Relationships and indexes
- Validation, lifecycle hooks, and defaults
- Access control considerations
- File locations and naming (core-types vs hook, and shim implications)
- Hook delivery requirements (capabilities + `registerRedboxModels()` if applicable)

## 2. Services Layer (Business Logic)
- Service responsibilities
- Public methods, inputs/outputs, and errors
- Transaction boundaries and side effects
- Dependencies on models, configs, or external services
- File locations and naming
- Service conventions (extend `Services.Core.Service`, `_exportedMethods`, `bootstrap()`, RxJS, model globals)
- Export/update requirements (ServiceExports index and hook overrides)

## 3. Webservice Controllers (REST API)
- Endpoint list (method + path)
- Request/response shapes and status codes
- Authn/authz and policy usage
- Error handling and validation (use `sendResp`)
- File locations and naming
- Controller conventions (extend `Controllers.Core.Controller`, `init()`, `_exportedMethods`)
- Export/update requirements (ControllerExports index, routes, auth config)

## 4. Ajax Controllers (Controllers)
- Endpoint list (method + path or action)
- Request/response shapes
- Authn/authz and policy usage
- Error handling and validation (use `sendResp`)
- File locations and naming
- Controller conventions (extend `Controllers.Core.Controller`, `init()`, `_exportedMethods`)
- Export/update requirements (ControllerExports index, routes, auth config)

## 5. Angular App(s)
- Apps/modules to add or modify (embedded apps only)
- Routes: **Do not use Angular Router**; specify Sails/EJS view routing instead
- Components and services
- Data flow to/from APIs
- State management and error handling
- File locations and naming (Angular workspace + EJS view + assets output)
- EJS view wiring (component tag + hashed asset includes using `CacheService.getNgAppFileHash`)
- Render path (typically `RenderViewController.render` with `locals.view`)

## 6. Additional Views
- View templates to add/modify
- Server-side data needed to render
- Where view is wired in (e.g., RenderViewController.render)
- Hook asset/view copy behavior if applicable

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
- Use Hook Kit CLI generators when they match the task (controllers, services, models, Angular apps/services, form fields).
- If a task does not map cleanly to an existing skill, call it out under "Skill Gaps" and suggest a new skill name and scope.

## Repo Context Reminders

- Prefer wiki documentation under `support/wiki/` when referencing ReDBox architecture or conventions.
- Key docs: `Controllers-Architecture`, `Services-Architecture`, `Redbox-Loader`, `Redbox-Hook-Kit`, `ReDBox-Automated-Tests`, `Using-a-Sails-Hook-to-customise-ReDBox`.
- Use the Coding Standards wiki for naming conventions and TypeScript rules.
- Use Redbox Testing skill guidance for Mocha and Bruno testing workflows.

## Notes on Specificity

- Be explicit enough that a smaller model can execute the plan without inference.
- Include concrete file path examples when possible.
- Avoid vague statements like "update the service"; name the service, method, and expected behavior.
