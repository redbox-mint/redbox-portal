# HTML/Markdown Editor Component (RichTextEditor)

## Planning
- [x] Research existing codebase and legacy MarkdownTextAreaComponent
- [x] Research CKEditor 5 Angular integration
- [x] Write implementation plan
- [ ] Get user approval on plan

## Implementation

### sails-ng-common (config contracts)
- [ ] Create `rich-text-editor.outline.ts` (types/interfaces)
- [ ] Create `rich-text-editor.model.ts` (config/definition classes)
- [ ] Register in `dictionary.outline.ts`
- [ ] Register in `dictionary.model.ts`
- [ ] Export from `index.ts`

### Visitor Infrastructure
- [ ] Add visitor methods to `base.outline.ts`
- [ ] Add default stubs to `base.model.ts`
- [ ] Wire `construct.visitor.ts`
- [ ] Wire `client.visitor.ts`
- [ ] Wire `data-value.visitor.ts`
- [ ] Wire `json-type-def.visitor.ts`
- [ ] Wire `validator.visitor.ts`
- [ ] Wire `template.visitor.ts`
- [ ] Update `migrate-config-v4-v5.visitor.ts` (MarkdownTextArea mapping + `outputFormat: 'markdown'`)

### Angular Component
- [ ] Install CKEditor 5 dependencies (`ckeditor5@~47.5.0`, `@ckeditor/ckeditor5-angular@~11.0.0`)
- [ ] Create `rich-text-editor.component.ts`
- [ ] Register in `form.module.ts`
- [ ] Register in `static-comp-field.dictionary.ts`

### Testing
- [ ] Create `rich-text-editor.component.spec.ts`
  - [ ] Component creation
  - [ ] HTML mode rendering
  - [ ] Markdown mode rendering
  - [ ] Form-control sync (programmatic setValue)
  - [ ] View-mode HTML output safety
  - [ ] View-mode Markdown output safety
  - [ ] Save/reload round-trip (HTML)
  - [ ] Save/reload round-trip (Markdown)
  - [ ] Parse-failure error state (warning banner, save disabled, raw data recovery)
- [ ] Extend `test/unit/migrate-config-v4-v5.visitor.test.ts` (mocha+chai)
  - [ ] MarkdownTextArea → RichTextEditor mapping
  - [ ] outputFormat: 'markdown' injected
  - [ ] Other v4 mappings unaffected
