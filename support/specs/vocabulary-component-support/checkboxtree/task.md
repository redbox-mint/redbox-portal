# Checkbox Tree Component for Hierarchical Vocabulary

## Planning
- [x] Research existing form framework architecture
- [x] Study component registration pipeline (outline → model → Angular → dictionary)
- [x] Study visitor infrastructure and vocab-inline visitor
- [x] Study existing API endpoints and routes
- [x] Define `children` API contract (response shape + error mapping)
- [x] Decide lazy-loading behavior (unpaged immediate children)
- [x] Decide selection semantics (no parent/child cascade)
- [x] Define genealogy strategy and future extension trigger
- [x] Define accessibility requirements
- [x] Define migration edge-case handling
- [x] Expand non-happy-path test scope
- [x] Write implementation plan
- [x] Get user approval on plan

## Execution

### Package: `sails-ng-common` — Type Definitions
- [ ] Create `component/checkbox-tree.outline.ts` — Frame/Outline interfaces + Types union
- [ ] Create `component/checkbox-tree.model.ts` — Model classes + visitor accept + Map/Defaults
- [ ] Update `dictionary.outline.ts` — Add `CheckboxTreeTypes` to `AllTypes` union
- [ ] Update `dictionary.model.ts` — Add `CheckboxTreeMap` / `CheckboxTreeDefaults`
- [ ] Update `visitor/base.outline.ts` — Add visitor methods for checkbox-tree
- [ ] Update `visitor/base.model.ts` — Add default visitor implementations
- [ ] Update `visitor/vocab-inline.visitor.ts` — Handle checkbox-tree inline resolution
- [ ] Update all other visitors (`construct`, `client`, `data-value`, `template`, `validator`, `json-type-def`, `migrate-config-v4-v5`) with new visitor methods

### Package: `redbox-core-types` — Server API
- [ ] Add `getChildren` method to `VocabularyService` for lazy tree loading
- [ ] Add `children` endpoint to `FormVocabularyController`
- [ ] Update `FormVocabularyController._exportedMethods` to include `children`
- [ ] Validate and map `children` errors (`invalid-parent-id`, `vocabulary-children-failed`)
- [ ] Add `children` route to `routes.config.ts`

### Package: Angular `form` — UI Component + Services
- [ ] Create `service/vocab-tree.service.ts` — Shared service for vocabulary tree APIs
- [ ] Create `service/vocab-tree.service.spec.ts` — Service unit tests
- [ ] Create `component/checkbox-tree.component.ts` — Angular component
- [ ] Create `component/checkbox-tree.component.spec.ts` — Angular unit tests
- [ ] Implement keyboard navigation and ARIA semantics for tree accessibility
- [ ] Implement non-cascading parent/child selection with indeterminate UI state
- [ ] Compute `genealogy` from rendered ancestry path on selection
- [ ] Update `static-comp-field.dictionary.ts` — Register component + model
- [ ] Update `form.module.ts` — Declare component

### Package: `sails-ng-common` — Exports
- [ ] Update package index exports to include new types

### Package: `redbox-core-types` — Exports
- [ ] Update package index exports for controller changes

## Testing
- [ ] Write unit tests for `FormVocabularyController.children`
- [ ] Write unit tests for `vocab-tree.service`
- [ ] Write Angular component spec tests
- [ ] Add tests for migration edge cases (`ANDSVocab` malformed configs)
- [ ] Add non-happy-path tests (empty vocab, broken parents, duplicates, API failures)
- [ ] Add accessibility verification tests (keyboard + ARIA states)
- [ ] Manual verification with form config
