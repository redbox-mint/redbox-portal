# Vocabulary API Modernisation

## Planning
- [ ] Research existing codebase
- [ ] Read relevant skills (design-planner, controllers, services, form-config, testing)
- [ ] Write full design document (following redbox-feature-design-planner template)
- [ ] Get user approval on design

## Execution (pending design approval)
- [ ] Add `getByIdOrSlug()` and `getEntries()` to `VocabularyService`
- [ ] Write service unit tests
- [ ] Create `FormVocabularyController` with `get` and `entries` actions
- [ ] Create Sails.js shim + register in controller index
- [ ] Update `routes.config.ts` and `auth.config.ts`
- [ ] Write controller unit tests
- [ ] Code review (redbox-feature-implementation-review)
- [ ] Create Bruno integration tests
- [ ] Add `vocabRef`/`inlineVocab` to component configs
- [ ] Create `VocabInlineFormConfigVisitor`
- [ ] Make `FormsService.buildClientFormConfig()` async + integrate visitor
- [ ] Audit and update callers for async
- [ ] Write visitor unit tests
- [ ] Deprecate all `VocabService` and `VocabController` methods
- [ ] Final integration test run
