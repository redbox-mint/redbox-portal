# Migrate Rich Text Editor: CKEditor → Tiptap

## sails-ng-common — Config Contracts
- [ ] Remove `editorType`, `removePlugins` from `rich-text-editor.outline.ts`
- [ ] Remove `editorType`, `removePlugins` from `rich-text-editor.model.ts`; update default toolbar to Tiptap names

## Angular — Dependencies
- [ ] Remove `ckeditor5`, `@ckeditor/ckeditor5-angular` from `angular/package.json`
- [ ] Add `@tiptap/core`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/extension-link`, `@tiptap/extension-table*`, `@tiptap/markdown`, `ngx-tiptap`, `@floating-ui/dom`
- [ ] Run `npm install`

## Angular — Module & Component
- [ ] Replace `CKEditorModule` with `TiptapEditorDirective` in `form.module.ts`
- [ ] Rewrite `rich-text-editor.component.ts` to use Tiptap

## Angular — Tests
- [ ] Replace `CKEditorModule` with `TiptapEditorDirective` in `helpers.spec.ts`
- [ ] Update `rich-text-editor.component.spec.ts` (adapt existing + add editable-mode tests)

## Existing Config
- [ ] Remove `editorType: 'classic'` from `default-1.0-draft.ts`

## Spec Documents
- [x] Keep a single migration plan and link it from the [parent plan](../implementation_plan.md).

## Verification
- [ ] Build sails-ng-common and run tests
- [ ] Build Angular form project and run tests
