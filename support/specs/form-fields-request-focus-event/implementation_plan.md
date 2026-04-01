# Form Fields Request Focus Event - Implementation Plan

## Goal
Refactor validation summary navigation to emit a focus intent event and move focus execution responsibility to form/container/field layers, reducing DOM coupling in `ValidationSummaryFieldComponent`.

## Current State
- `ValidationSummaryFieldComponent` directly:
  - Reveals parent tabs.
  - Queries DOM elements.
  - Applies scroll/focus.
- Typed event infrastructure already exists:
  - `FormComponentEventType.FIELD_FOCUS_REQUEST` (`field.request.focus`).
  - `createFieldFocusRequestEvent(...)` helper.
- There is no production consumer path that performs reveal + delegated focus from this event.

## Architectural Direction
Use intent-driven focus orchestration:
1. Validation summary emits a focus request event.
2. A form-level coordinator resolves reveal requirements (tabs/containers).
3. Target component (or nearest field wrapper) applies focus using component-owned logic.
4. Keep user behavior unchanged (reveal + scroll + focus) with stronger layering.

## Coordinator Scope
- The focus coordinator must be a service provided at the `FormComponent` level, not `providedIn: 'root'`.
- Rationale:
  - It needs direct access to the specific `FormComponent` instance, `componentDefArr`, and lineage map for lookup.
  - It prevents cross-form event bleed when multiple forms exist on a page.
  - It allows lifecycle alignment with form creation/destruction.
- Provider location:
  - Register in `FormComponent` providers (or an equivalent form-feature provider scoped to the component instance).

## Scope
- In scope:
  - Validation summary emission refactor.
  - Focus event payload enrichment.
  - Focus coordinator service/effect in form app.
  - Tab reveal integration.
  - Field-level focus handling contract + fallback.
  - Unit/integration regression coverage.
- Out of scope:
  - Full event-system redesign.
  - UX changes unrelated to reveal/focus responsibility.
  - New animation/smooth-scroll behavior beyond current baseline.

## Event Contract
Use existing `FieldFocusRequestEvent` and extend payload for navigation context.

### Required fields
- `type`: `field.request.focus`
- `fieldId`: canonical target field pointer/id
- `lineagePath`: `Array<string | number>` for reveal traversal

### Validation-origin strictness
- For events emitted by `ValidationSummaryFieldComponent`, `lineagePath` is mandatory.
- Type definition may keep `lineagePath?` optional for other publishers, but validation-origin publisher logic must enforce/populate it.

### Proposed optional fields
- `targetElementId?`: legacy DOM id fallback (e.g., `form-item-id-...`)
- `requestId?`: dedupe and traceability
- `source?`: event origin (`validation-summary`, etc.)

## Component Responsibilities

### 1) ValidationSummaryFieldComponent
- Replace direct focus logic with event publish only.
- Keep link semantics and click handling.
- No direct DOM querying for target focus.

### 2) Focus Coordinator (new)
- Subscribe to `FIELD_FOCUS_REQUEST` on event bus.
- Reveal parent containers from lineage path (tabs first).
- Resolve target component entry.
- Invoke component-level focus handler when available.
- Fallback to safe DOM lookup when handler is unavailable.
- Guard for async instantiation with bounded retry.

### 3) Field Components / Base Contract
- Introduce a lightweight focus interface/utility:
  - `requestFocus(options)` or equivalent.
- `requestFocus` options include scroll behavior:
  - `scroll?: boolean`
  - `scrollOptions?: ScrollIntoViewOptions`
- Default behavior should preserve existing UX parity:
  - `scroll: true`
  - `scrollOptions: { behavior: 'smooth', block: 'center' }`
- Implement for core input-like components first.
- Provide a standard fallback in wrapper/base when component-specific handler is absent.

## Migration Strategy

### Phase 1: Event emission parity
- Validation summary emits `FIELD_FOCUS_REQUEST`.
- Keep old direct focus path behind a temporary feature switch (or internal fallback branch).
- Verify no behavior regression.

### Phase 2: Coordinator activation
- Add focus coordinator and wire subscription lifecycle.
- Handle tab reveal from lineage path.
- Execute focus via component contract, then fallback.
- After `selectTab`, wait for paint/layout before focus attempt:
  - first attempt on `requestAnimationFrame`
  - fallback wait via `setTimeout(0)` when needed
- Keep bounded retry loop for delayed instantiation.

### Phase 3: Component contract rollout
- Implement focus handler in common field components.
- Reduce fallback usage; log fallback path for visibility.

### Phase 4: Cleanup
- Remove legacy direct-focus logic from validation summary.
- Keep minimal fallback in coordinator for edge components.

## File-Level Change Plan

### Event types
- `angular/projects/researchdatabox/form/src/app/form-state/events/form-component-event.types.ts`
  - Extend `FieldFocusRequestEvent` payload.
  - Update helper/factory and type map tests.

### Validation summary
- `angular/projects/researchdatabox/form/src/app/component/validation-summary.component.ts`
  - Replace `revealAndFocusValidationTarget` direct DOM behavior with event publish.

### New focus coordinator
- `angular/projects/researchdatabox/form/src/app/form-state/events/` (or `effects/` depending on placement)
  - Add `form-component-focus-request-consumer.ts` (or similarly named service).
  - Register lifecycle from `FormComponent` providers (instance-scoped, not root).

### Optional base/field updates
- `angular/projects/researchdatabox/portal-ng-common/src/lib/form/form-field-base.component.ts`
  - Add optional focus contract.
- Input components under:
  - `angular/projects/researchdatabox/form/src/app/component/*.component.ts`

### Tests
- `angular/projects/researchdatabox/form/src/app/component/validation-summary.component.spec.ts`
- `angular/projects/researchdatabox/form/src/app/form-state/events/*.spec.ts`
- Additional integration specs for nested tab/repeatable scenarios.

## Accessibility and UX Guarantees
- Preserve keyboard-friendly jump-to-error behavior.
- Preserve reveal-before-focus semantics.
- Ensure focus lands on interactive control when possible.
- Avoid double-scroll/double-focus side effects.

## Risks and Mitigations
- Risk: target component not yet instantiated.
  - Mitigation: paint-aware bounded retry after reveal (`requestAnimationFrame` + `setTimeout(0)`), then fallback.
- Risk: inconsistent field component focus behavior.
  - Mitigation: base contract with `ScrollOptions` + default fallback.
- Risk: repeatable/nested lineage resolution mismatch.
  - Mitigation: lineage-based resolver tests with nested fixtures.

## Acceptance Criteria Mapping
- Validation summary emits focus intent event only.
- Focus requests are consumed and executed reliably.
- Tab reveal remains functional.
- Nested/repeatable dynamic layouts continue working.
- Accessibility behavior preserved.
- Angular test suite for affected specs passes.

## Verification Strategy
- Fast local verification:
  - `npm run test:angular -- --include="**/validation-summary.component.spec.ts"`
  - `npm run test:angular -- --include="**/form-component-event-bus.service.spec.ts"`
- Broader confidence:
  - `npm run test:angular`
