# Translation updates runbook

## Sources of truth

- `language-defaults/en/translation.json` is the English fallback namespace.
- `language-defaults/meta.json` stores the category, description, and content format used by translation tooling.
- Locale codes are the folder names and must match `language-names.json` and deployment configuration.
- `assets/locales` is generated output and must not be edited directly.

Production locale folders are direct children of `language-defaults/` and contain a
namespace file such as `translation.json`. Demo fixtures belong below
`language-defaults/demo/<locale>/`; bootstrap and `sync-translation` deliberately
ignore that subtree. Add a locale to the production root only when it is ready to
be enabled and seeded.

## Adding or changing a key

Use a stable key rather than English prose in Angular or server-side user-facing
code. Add the English value and a metadata entry with a meaningful feature
category and description. Use `contentFormat: "html"` only when the value really
contains trusted markup. Keep placeholders identical across translations.

For counts, call the base key with `{ count }` and provide i18next plural variants
such as `<key>_one` and `<key>_other`; do not use `(s)` in a count string.

## Local verification

Run the focused checks after translation or locale changes:

```bash
npm run test:translations
npm run compile:core
npm run build --prefix packages/redbox-dev-tools
./support/development/compileDevAngular.sh form
```

`test:translations` parses all portal language-default JSON files, rejects
duplicate object keys, checks that every metadata key exists in English, validates
metadata fields, checks plural placeholders, and confirms production locale
folders contain `translation.json`.

For API synchronisation, use the dev-tools command with the portal defaults path:

```bash
node packages/redbox-dev-tools/dist/bin/redbox-dev-tools.js sync-translation \
  --language-defaults language-defaults \
  --api-base https://<portal-host>
```

After starting the development stack with `npm run dev:run`, verify the language
selector and translation-dependent screens in the browser. A demo locale should
not appear merely because its files exist under `language-defaults/demo/`.
