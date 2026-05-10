# Translation Content Format Metadata

## Summary

Replace the translation editor’s HTML/plain-text guessing with explicit translation metadata. Each translation entry will carry `contentFormat: 'plain' | 'html'`, defaulting to `'plain'` when absent. The translation admin app will use that metadata to open the correct editor mode and save it with the value. Form rendering can then choose HTML-capable templates only for entries marked as HTML.

## Public API / Data Shape

Add a `contentFormat` field to translation entry metadata:

```ts
type TranslationContentFormat = 'plain' | 'html';

type TranslationEntry = {
  key: string;
  value: unknown;
  description?: string;
  category?: string;
  contentFormat?: TranslationContentFormat;
};
```

Update set-entry request bodies to accept:

```ts
{
  value: unknown;
  category?: string;
  description?: string;
  contentFormat?: 'plain' | 'html';
}
```

Default behavior:
- Missing `contentFormat` means `'plain'`.
- Existing translation records continue to load and render safely.
- Existing `category` and `description` behavior remains unchanged.

## Backend Changes

1. Update [I18nTranslation.ts](/Users/andrewbrazzatti/source/github/worktrees/redbox-portal/feature/translation-search-html-editor/packages/redbox-core/src/waterline-models/I18nTranslation.ts) to add:
   - `contentFormat?: 'plain' | 'html'`
   - Waterline string attr with `allowNull: true`
   - Type interface field.

2. Update [I18nEntriesService.ts](/Users/andrewbrazzatti/source/github/worktrees/redbox-portal/feature/translation-search-html-editor/packages/redbox-core/src/services/I18nEntriesService.ts):
   - Extend `setEntry` options with `contentFormat?: 'plain' | 'html'`.
   - Persist `contentFormat` only when supplied.
   - During `syncEntriesFromBundle`, read `meta?.[key]?.contentFormat`.
   - Validate or normalize invalid metadata values to `undefined` or `'plain'`; do not persist arbitrary strings.

3. Update both controllers:
   - [webservice/TranslationController.ts](/Users/andrewbrazzatti/source/github/worktrees/redbox-portal/feature/translation-search-html-editor/packages/redbox-core/src/controllers/webservice/TranslationController.ts)
   - [TranslationController.ts](/Users/andrewbrazzatti/source/github/worktrees/redbox-portal/feature/translation-search-html-editor/packages/redbox-core/src/controllers/TranslationController.ts)

   Each `setEntry` action should read `req.body?.contentFormat` and pass it through to `I18nEntriesService.setEntry`.

4. Keep locale bundle JSON values unchanged. `contentFormat` lives with translation metadata/entry rows, not inside user-facing translation strings.

## Angular Service Changes

Update [translation.service.ts](/Users/andrewbrazzatti/source/github/worktrees/redbox-portal/feature/translation-search-html-editor/angular/projects/researchdatabox/portal-ng-common/src/lib/translation.service.ts):

- Extend `listEntries` return type with `contentFormat?: 'plain' | 'html'`.
- Extend `setEntry` body type with `contentFormat?: 'plain' | 'html'`.

No URL or response wrapper changes.

## Translation App Changes

Update [translation.component.ts](/Users/andrewbrazzatti/source/github/worktrees/redbox-portal/feature/translation-search-html-editor/angular/projects/researchdatabox/translation/src/app/translation.component.ts):

1. Add:
   ```ts
   type TranslationContentFormat = 'plain' | 'html';
   ```

2. Extend `TranslationEntry` with `contentFormat?: TranslationContentFormat`.

3. Add modal state:
   ```ts
   editContentFormat: TranslationContentFormat = 'plain';
   ```

4. In `openEdit(entry)`:
   - Set `editContentFormat = normalizeContentFormat(entry.contentFormat)`.
   - Set editor mode from metadata:
     - `'html'` -> `rich`
     - `'plain'` -> `text`
   - Remove `looksLikeHtml(value)` as the default determiner.
   - Still create the rich editor with escaped plain text as needed, but do not choose rich mode because of detected tags.

5. In `setEditorMode(mode)`:
   - Switching to `rich` or `html` sets `editContentFormat = 'html'`.
   - Switching to `text` sets `editContentFormat = 'plain'`.

6. In `saveEdit()`:
   - Save `{ value, contentFormat: this.editContentFormat }`.
   - Update local entry state with both `value` and `contentFormat`.

7. Keep `looksLikeHtml` only if needed for a one-time fallback helper, but it should not decide editor mode for persisted entries.

## Template / UX Changes

Update [translation.component.html](/Users/andrewbrazzatti/source/github/worktrees/redbox-portal/feature/translation-search-html-editor/angular/projects/researchdatabox/translation/src/app/translation.component.html):

- Keep the existing editor mode buttons.
- Treat the buttons as explicit content-format controls:
  - Plain text button saves as `plain`.
  - Rich text and HTML source buttons save as `html`.
- Optionally add a compact badge in the table value column:
  - `HTML` when `contentFormat === 'html'`
  - no badge for plain text, to keep the table quiet.

## Form Rendering Changes

Update content/form config support so rendering can respect metadata instead of value guessing:

1. Extend `ContentFieldComponentConfig` in:
   - [content.outline.ts](/Users/andrewbrazzatti/source/github/worktrees/redbox-portal/feature/translation-search-html-editor/packages/sails-ng-common/src/config/component/content.outline.ts)
   - [content.model.ts](/Users/andrewbrazzatti/source/github/worktrees/redbox-portal/feature/translation-search-html-editor/packages/sails-ng-common/src/config/component/content.model.ts)

   Add:
   ```ts
   translationContentFormat?: 'plain' | 'html';
   ```

2. Update [construct.visitor.ts](/Users/andrewbrazzatti/source/github/worktrees/redbox-portal/feature/translation-search-html-editor/packages/redbox-core/src/visitor/construct.visitor.ts) to pass through `translationContentFormat`.

3. Update [content.component.ts](/Users/andrewbrazzatti/source/github/worktrees/redbox-portal/feature/translation-search-html-editor/angular/projects/researchdatabox/form/src/app/component/content.component.ts):
   - When `contentIsTranslationCode === true` and no explicit template is configured:
     - If `translationContentFormat === 'html'`, continue assigning translated content to `[innerHtml]`.
     - If `translationContentFormat !== 'html'`, escape translated text before assigning to `[innerHtml]`.
   - This preserves plain-text rendering in places that do not intend to support HTML.

4. For form configs that intentionally render HTML translations, set:
   ```json
   {
     "contentIsTranslationCode": true,
     "translationContentFormat": "html"
   }
   ```

## Migration / Default Metadata

1. Update centralized translation metadata loading so `_meta` entries may include:
   ```json
   {
     "some-key": {
       "category": "forms",
       "description": "Shown on the home form",
       "contentFormat": "html"
     }
   }
   ```

2. Existing translations with no metadata will be treated as plain text.

3. No database migration is required for Mongo/Waterline beyond the model attribute addition; new writes will include `contentFormat` where applicable.

## Tests

Add or update Angular translation app tests in [translation.component.spec.ts](/Users/andrewbrazzatti/source/github/worktrees/redbox-portal/feature/translation-search-html-editor/angular/projects/researchdatabox/translation/src/app/translation.component.spec.ts):

- Opens plain entry with `contentFormat: 'plain'` in plain-text mode even if value contains `<` or tag-like text.
- Opens HTML entry with `contentFormat: 'html'` in rich mode.
- Saving from rich mode sends `{ value: '<p>...</p>', contentFormat: 'html' }`.
- Saving from text mode sends `{ value: '...', contentFormat: 'plain' }`.
- Local `entries` state retains updated `contentFormat`.

Add or update backend tests for `I18nEntriesService`:

- `setEntry` persists valid `contentFormat`.
- Invalid `contentFormat` is ignored or normalized to the default.
- `syncEntriesFromBundle` copies `_meta[key].contentFormat` into entry rows.

Add or update form content component tests in [content.component.spec.ts](/Users/andrewbrazzatti/source/github/worktrees/redbox-portal/feature/translation-search-html-editor/angular/projects/researchdatabox/form/src/app/component/content.component.spec.ts):

- A translated plain-text value containing `<strong>x</strong>` renders visibly as text, not as markup.
- A translated HTML value with `translationContentFormat: 'html'` renders markup through `[innerHtml]`.
- Existing `contentIsTranslationCode: true` behavior still translates.

## Verification Commands

Run focused tests first:

```bash
npm run test:angular -- translation
npm run test:angular -- form
```

Run relevant package tests if backend service/controller tests are added:

```bash
npm run test:core
```

If time is constrained, at minimum run:
- translation app spec
- content component spec
- core I18nEntriesService test file

## Assumptions

- The chosen metadata shape is `contentFormat: 'plain' | 'html'`.
- Absence of `contentFormat` means plain text for safety.
- Translation bundle values remain plain key/value data; metadata remains in `_meta` and persisted entry columns.
- The admin editor may still let a user switch modes manually, and the selected mode becomes the saved source of truth.
