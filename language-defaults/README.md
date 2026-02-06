This folder contains the default i18n namespace files that seed the database and serve as fallbacks.

Structure:
- language-defaults/<lng>/<namespace>.json (e.g., language-defaults/en/translation.json)

Other locales (non-English defaults) live under support/language-defaults to avoid slowing down default bootstrap.

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
