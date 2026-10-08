This folder contains the production default i18n namespace files that seed the database and serve as fallbacks.

Production structure:
- language-defaults/<lng>/<namespace>.json (e.g., language-defaults/en/translation.json)

Only direct child folders containing a namespace JSON file are loaded as production
locale defaults. Demo or sample locales belong under `language-defaults/demo/<lng>/`
and are intentionally ignored by bootstrap and translation synchronisation. This
keeps demo content available for development without making it an enabled locale.

Locale folder names should use the configured locale code (for example `en`, `mri`,
or `zh-cn`), and the same code should be used in `language-names.json` and any
deployment configuration.

Notes:
- Do not edit files under assets/locales; those are build artifacts or served static assets.

Metadata support:
- You can optionally include a root-level object named "_meta" that maps flat key paths to metadata:
	{
		"dashboard-heading": "My {{stage}} {{recordTypeName}}",
		"_meta": {
			"dashboard-heading": { "category": "dashboard", "description": "Heading on dashboard" }
		}
	}
- On import/seed, category and description will be stored per entry in the DB, but the _meta object will not be served to clients via the i18next http-backend endpoints.
- The app will read defaults from this directory for seeding and for runtime fallback when DB is empty.

# HTML translation presentation

For entries marked `contentFormat: "html"`, the translation editor preserves
permitted CSS classes through rich text edits and HTML source edits. Core permits
Bootstrap table and alert classes on their corresponding elements. Table section
classes and header `scope` attributes survive the rich text conversion too.

Developers can extend the policy in site/hook configuration. For JCU's existing
classification table, the additions would be:

```js
i18n: {
  editor: {
    allowedClasses: {
      th: [
        'sensitivity-table-official-public',
        'sensitivity-table-official-internal',
        'sensitivity-table-official-sensitive',
        'sensitivity-table-official-protected'
      ]
    }
  }
}
```

Use the exact class names already defined by the site's reviewed stylesheet.
This configuration permits names on specified elements; it does not supply CSS.
Editors can then change wording without removing those classes. Existing entries
whose classes have already been lost need those classes restored once.

The same policy is sent to the editor and enforced by the entry/bundle save
service for HTML entries. Unknown classes, inline `style` attributes,
`<style>` blocks, scripts, event handlers and unsafe links are removed.
Angular's HTML sanitisation remains enabled; no trusted-HTML bypass is used.
Plain text entries remain unchanged. Bundle imports use entry or `_meta`
content-format metadata to identify HTML values.

Check existing HTML translations before rollout: classes outside the core defaults
must be added to the site policy before editors save those entries. Unsupported
HTML elements and attributes are also removed from HTML saves.

Adding a permitted class is a developer configuration change and requires the
normal configuration deployment. Changes to translation wording use the existing
save API and cache refresh, without rebuilding or restarting the container.
Review the stylesheet behind every permitted class: allowlists do not make CSS
that hides controls, overlays the page, or loads remote resources safe.
