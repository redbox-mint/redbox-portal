# Form Fields Request Focus Event - Task List

## Assumptions
- Existing event bus and focus event type remain the primary mechanism (`field.request.focus`).
- This work targets the Angular form app under `angular/projects/researchdatabox/form`.

## Implementation Tasks (with tests interleaved)

1. Confirm baseline behavior and snapshot current tests.
- Run focused spec:
  - `validation-summary.component.spec.ts`
- Capture current passing behavior for tab reveal + focus.

2. Extend focus event payload model.
- Update `FieldFocusRequestEvent` with navigation metadata (`targetElementId`, `lineagePath`, `requestId`, `source`).
- Keep `lineagePath` optionally typed for generic publishers, but enforce it as required for validation-summary-origin events.
- Update helper usage/types where needed.

3. Unit test: event type/helper coverage.
- Add/adjust tests in event bus/type specs to validate payload typing and helper output.
- Add tests that validation-origin event creation fails/guards when lineage is missing.

4. Refactor `ValidationSummaryFieldComponent` to publish focus intent.
- Replace direct `revealTabParents + DOM query + focus` execution with `eventBus.publish(createFieldFocusRequestEvent(...))`.
- Ensure emitted payload includes lineage metadata.

5. Unit test: validation summary emits focus request event.
- Spy on event bus publish path and assert payload correctness.
- Keep existing semantic HTML/link assertions intact.

6. Implement focus request coordinator (new consumer/service).
- Register coordinator service at `FormComponent` provider scope (not root).
- Subscribe to `FIELD_FOCUS_REQUEST`.
- Resolve/reveal parent tab containers from lineage path.
- Locate target component map entry.
- Delegate focus to component contract; fallback safely when absent.
- Add paint-aware bounded retry for async-rendered targets:
  - Attempt focus on `requestAnimationFrame` after tab reveal.
  - Fallback to `setTimeout(0)` and bounded additional retries.

7. Unit test: coordinator reveal/focus behavior.
- Coordinator reveals hidden tab and focuses intended target.
- Coordinator handles missing targets gracefully (no throw).
- Coordinator retry path works when target appears after paint/tick.
- Add scope test to ensure coordinator instances are isolated per `FormComponent`.

8. Introduce focus handling contract on field components/base.
- Add optional `requestFocus`-style contract in base and implement for common input components.
- Include `ScrollOptions` in request arguments and default to consistent parity behavior (`block: 'center'`).
- Keep fallback for components not yet migrated.

9. Unit test: component-level focus contract.
- Verify focus lands on correct interactive element for migrated components.
- Verify fallback path for non-migrated components.

10. Regression integration: preserve user-visible behavior.
- Update/add integration scenarios:
  - Validation summary click reveals hidden tab.
  - Focus is applied to target field.
  - Nested tab/repeatable case.

11. Cleanup and remove redundant validation summary focus code.
- Remove obsolete helper methods and selectors from `ValidationSummaryFieldComponent` once coordinator path is proven.

12. Full Angular suite gate.
- Run `npm run test:angular`.
- Resolve any regressions before merge.

## Deliverables
- Event-driven focus navigation path implemented.
- Validation summary decoupled from DOM target focusing.
- Tests covering emission, coordination, reveal, focus, and regressions.

## Definition of Done
- All acceptance criteria from the spec are met.
- Affected unit/integration tests pass locally and in CI.
- No user-visible regression in validation summary navigation.
