This folder contains the default i18n namespace files that seed the database and serve as fallbacks.

Structure:
- language-defaults/<lng>/<namespace>.json (e.g., language-defaults/en/translation.json)

Notes:
- The app will read defaults from this directory for seeding and for runtime fallback when DB is empty.
