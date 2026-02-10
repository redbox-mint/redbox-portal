---
name: 'Redbox Test Verification'
description: 'Ensure every new service or controller gets Mocha or Bruno coverage by analyzing the implemented code and writing integration tests.'
---

# Skill: Redbox Test Verification

## Purpose

Use this skill whenever new business logic or routes are merged so the functionality can be verified by automated tests before release.

## Analyze first

- Inspect the new/updated code in `packages/redbox-core-types/src/services` (for services) or `packages/redbox-core-types/src/controllers` plus `config/routes` (for routes) to understand the happy path, dependencies, and any edge cases the feature must cover.
- Take notes on expected inputs, persisted entities, authorization requirements, and downstream effects; those points become the assertions in the new test.

## Mocha service integration coverage

- For every new/modified service in `packages/redbox-core-types/src/services`, add an integration test under `typescript/test/integration/services`. Prefer naming the file after the service (e.g., `MyService.test.ts`).
- These are integration tests (no mocking, full-stack). The test should orchestrate creating real data (often via helper seed utilities), let the service execute against the database, and assert on the persisted state or returned payloads.
- Import shared fixtures or helpers from `typescript/test/integration/services/helpers` as needed, but focus on exercising the whole service flow (setup data, call the method or endpoint, then read back the data it should have created/updated).
- Keep the tests in TypeScript, run via Mocha inside the Docker test harness, and update any shared fixtures or `typescript/test/unit/services/index.ts` helpers if required.

## Bruno route coverage

- When a new controller or route is introduced (or an existing route grows new behavior), add a Bruno scenario under `test/bruno` that hits the HTTP endpoint through the normal request pipeline.
- Reuse existing Bruno test patterns for authentication, parameter passing, and response validation; the new suite should cover the new route name/path plus potential role restrictions.
- Keep suites grouped under the relevant Bruno folder (e.g., `test/bruno/general`) and ensure the new file is wired into the `test/bruno/run` scripts if needed.
- Do not toggle CSRF headers/flags in route configs; the Bruno environments already disable CSRF globally in Sails config, so follow the default route definitions.

## Verify by running the suites

- After adding the tests, run the Mocha suite with `npm run test:mocha:mount` (local iteration) or `npm run test:mocha` (CI) to build confidence that the service behaves as expected.
- For the Bruno scenarios, run `npm run test:bruno:general:mount` (or the appropriate profile) and ensure the new route passes before finishing.

## Documentation

- If the new tests uncover side effects or contract changes, document them in the wiki page that best fits (see `support/wiki/Redbox-Core-Types.md` or `support/wiki/Redbox-Loader.md`).
