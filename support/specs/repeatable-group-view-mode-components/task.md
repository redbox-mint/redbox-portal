# Form View Mode Transforms for Repeatable and Group Components

## Analysis and Design

- [ ] Confirm transform scope includes both `RepeatableComponent` and top-level `GroupComponent` in `view` mode.
- [ ] Confirm transform timing: flattening happens after constraint/authorization pruning (client visitor phase), not before.
- [ ] Define and document table eligibility rules for repeatable-group rendering.
- [ ] Define and document fallback rendering rules for nested/complex/unknown components.
- [ ] Define component support matrix, including explicit handling for `CheckboxTreeComponent`.
- [ ] Define `FileUploadComponent` as non-table-compatible (always list/card fallback).
- [ ] Define empty/missing/invalid data behavior (`""` output).
- [ ] Define translated label behavior (`{{t ...}}` + fallback).
- [ ] Define duplicate/empty child-name handling and fallback behavior.
- [ ] Define explicit template rebinding limits (no arbitrary template rewriting).

## Implementation

- [ ] Update `form-override.model.ts` with repeatable/group transform entries and helper methods.
- [ ] Implement repeatable -> content transform helper.
- [ ] Implement group -> content transform helper.
- [ ] Implement table renderer helper.
- [ ] Implement list/card fallback renderer helper.
- [ ] Add safe value-expression builder and label-resolution helpers.
- [ ] Add post-pruning view-mode transform phase in `client.visitor.ts`.
- [ ] Ensure transform recursion order is child-first before parent template generation.
- [ ] Prevent/dodge conflicting construct-time flattening in `construct.visitor.ts`.
- [ ] Update `content.component.ts` to pass `translationService` into handlebars template context.
- [ ] Add transform decision debug logging (table vs fallback, skipped invalid fields).

## Tests

- [ ] Add/extend unit tests for repeatable/group transform behavior in `view` vs `edit` modes.
- [ ] Add table-layout tests for flat repeatable-group cases.
- [ ] Add fallback-layout tests for nested groups/repeatables and unknown classes.
- [ ] Add test coverage for `CheckboxTreeComponent` inside repeatable group.
- [ ] Add test coverage proving `FileUploadComponent` in a repeatable/group row forces fallback layout (no table).
- [ ] Add test coverage for duplicate and empty child-name handling.
- [ ] Add test coverage for translated label output (`{{t ...}}`).
- [ ] Add test coverage for empty/missing/invalid values rendering as empty string.
- [ ] Add test coverage proving disallowed-by-mode descendants are excluded from template output.
- [ ] Add test coverage proving disallowed-by-role descendants are excluded from template output.
- [ ] Replace existing repeatable TODO assertion block with explicit final behavior assertions.
- [ ] Add/extend `ContentComponent` unit tests verifying translation service context in template evaluation.

## Verification

- [ ] Run targeted unit tests for `sails-ng-common` visitor/transform suites.
- [ ] Run targeted Angular `ContentComponent` tests.
- [ ] Perform manual `view`-mode verification on representative forms (simple list, table group, nested group/repeatable, checkbox tree).
- [ ] Verify labels are translated in rendered output.
- [ ] Verify unauthorized/out-of-mode fields are not rendered.
