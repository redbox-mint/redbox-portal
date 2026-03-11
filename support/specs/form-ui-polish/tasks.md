# Form UI Polish Fixes

## Planning

- [x] Explore codebase and locate all relevant component files
- [x] Read and understand existing source + test coverage
- [x] Write implementation plan
- [ ] Get user approval on plan

## Execution

- [ ] Fix repeatable add/remove button behavior and size
  - [ ] Add item-count guard to hide remove when only one row exists
  - [ ] Reduce button sizing tokens in [form.component.scss](../../../angular/projects/researchdatabox/form/src/app/form.component.scss)
  - [ ] Add unit tests in [repeatable.component.spec.ts](../../../angular/projects/researchdatabox/form/src/app/component/repeatable.component.spec.ts)
- [ ] Fix dropdown translation + visual size
  - [ ] Pipe option labels and placeholder through `i18next` in template
  - [ ] Normalize dropdown sizing in [form.component.scss](../../../angular/projects/researchdatabox/form/src/app/form.component.scss)
  - [ ] Add translation-focused spec in [dropdown-input.component.spec.ts](../../../angular/projects/researchdatabox/form/src/app/component/dropdown-input.component.spec.ts)
- [ ] Keep loading SVG visible until form is ready
  - [ ] Add loading section to [form.component.html](../../../angular/projects/researchdatabox/form/src/app/form.component.html) gated by `componentsLoaded`
  - [ ] Add styles in [form.component.scss](../../../angular/projects/researchdatabox/form/src/app/form.component.scss)
  - [ ] Add spec coverage in [form.component.spec.ts](../../../angular/projects/researchdatabox/form/src/app/form.component.spec.ts)

## Verification

- [ ] Run targeted unit tests
- [ ] Browser smoke-test on edit page
