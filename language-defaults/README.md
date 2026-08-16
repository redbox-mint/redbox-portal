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
