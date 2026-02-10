---
name: "Redbox Feature Implementation Review"
description: "Review completed ReDBox feature implementations against a growing ruleset and emit structured issues for agent remediation."
---

# Skill: Redbox Feature Implementation Review

## Purpose
Use this skill after a feature implementation lands (services, controllers, models, Angular app) to verify adherence to platform rules and report actionable issues that can be looped back into an agent for fixes.

## Inputs
- `implementation_plan.md` for expected schema, flows, and required components.
- The feature’s code changes in core-types, app, and angular directories.

## Review Workflow
1. Read `implementation_plan.md` and list expected services, models, controllers, routes, and UI surfaces.
2. Locate the implemented code and tests.
3. Evaluate each rule below and record any violations as structured issues.
4. Emit only violations; do not propose unrelated refactors.

## Rule Checks

### Type-safety / Any-casts
1. Search the implementation for usages of `as any`, `(object as any)`, `as unknown as`, or other patterns that cast to `any` to bypass TypeScript types.
   - Rationale: model and service code must adhere to declared Waterline model interfaces; casting to `any` hides mismatches and leads to runtime failures.
   - Expected behavior: replace casts with proper interfaces, refine types, or add clear TODOs referencing a follow-up task (do not permanently use `as any`).
   - Severity: treat `as any` casts in model/service code as `major` (blocker for model accuracy); in controllers or angular code treat as `major` or `minor` depending on context but always report.
   - Evidence: include the exact file, line range, and code snippet where the cast occurs.


### Services
1. Services extend `CoreService`.
   - Expected location: `packages/redbox-core-types/src/services`.
2. Each service has a unit test in `packages/redbox-core-types/test`.
3. Each service has at least one integration test in `typescript/test/unit` (prefer `typescript/test/unit/services`).

### Waterline Models
1. The schema matches `implementation_plan.md`.
2. Models are defined in `packages/redbox-core-types/src/waterline-models`.

### Controllers
1. Controllers extend `CoreController`.
2. All controller actions use `this.sendResp` for responses.
   - Never use `res.json`, `res.send`, `this.apiRespond`, or `this.ajaxRespond`.
3. Routing includes both:
   - CSRF-secured routes on `/:branding/:portal/<path>`.
   - Non-CSRF routes on `/:branding/:portal/api/<path>`.
4. Navigation configuration is set for any new pages or menus.
   - Check core-types config models (for example `packages/redbox-core-types/src/configmodels/MenuConfig.ts`) and any branding defaults touched by the feature.
5. Controllers include unit tests.
   - Expected location: `packages/redbox-core-types/test`.
6. Controllers include integration tests for Bruno.
   - Expected location: `test/bruno`.

### Angular App
1. Angular services use `HttpClientService`.
2. The app does not define Angular routing (not an SPA).
3. Angular apps include tests.
   - Expected: unit tests for the app runnable via `ng test <app-name>` (located under `angular/projects/<app-name>/`), and any e2e or integration suites as appropriate.

## Output Format
If any issues are found: return a JSON payload with an `issues` array. Each issue must include:
- `id`: short unique identifier (e.g., `svc-extends-core`).
- `area`: `services`, `models`, `controllers`, or `angular`.
- `rule`: the rule text that failed.
- `severity`: `blocker`, `major`, or `minor`.
- `message`: clear, actionable description.
- `file`: path to the violating file.
- `lines`: line range string (e.g., `L12-L40`) or `null` if unknown.
- `evidence`: snippet or description pointing to the violation.
- `suggested_fix`: concise change that resolves the issue.

If no issues are found: output the exact ASCII string (without quotes):

NO ISSUES FOUND

Example payload when issues exist:
{
   "issues": [
      {
         "id": "controller-sendresp",
         "area": "controllers",
         "rule": "All controller actions use this.sendResp for responses.",
         "severity": "major",
         "message": "Controller action uses res.json instead of this.sendResp.",
         "file": "packages/redbox-core-types/src/controllers/MyController.ts",
         "lines": "L88-L96",
         "evidence": "res.json({ ok: true })",
         "suggested_fix": "Replace res.json with this.sendResp(res, 200, payload)."
      }
   ]
}
