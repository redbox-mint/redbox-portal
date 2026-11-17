# AI-assisted drafting: admin screen mocks

These mocks cover the post-POC admin screens proposed in [design.md](../design.md) under "Post-POC: `admin-generation` embedded Angular app".
They manage the configuration that #5306 currently seeds from `support/resources/development/bootstrap-data/generation/`.

Unlike the `admin-ui-redesign/mocks/*.dc.html` canvas files, these are plain HTML you can open directly in a browser.
They reuse [`admin-ui-redesign/mocks/admin.css`](../../admin-ui-redesign/mocks/admin.css) unchanged. [`generation.css`](generation.css)
adds a few local patterns built only from its tokens, and [`shell.js`](shell.js) renders the shared header, sidebar and tab strip.
The dashed "Design notes" boxes explain decisions and aren't UI to ship.

Start at [`index.html`](index.html).

## Screen map

| Mock | Screen | Backing model / API (design.md §endpoints) |
|---|---|---|
| `index.html` | Overview: setup checklist, usage, read-only server settings | `generation.config.ts` (env), counts from all lists |
| `profiles.html` | Profiles list and templates | `GenerationProfile`, `GET /api/generation/profiles` |
| `profile-edit.html` | Profile draft editor, validation, test cases, publish | `GenerationProfileVersion.definition`, `…/validate`, `…/test`, `…/publish` |
| `actions.html` | Form actions list (empty state + populated reference) | `GenerationBinding`, `GET /api/generation/bindings` |
| `action-edit.html` | Form action editor with live button preview | `GenerationBinding`, `…/bindings/:id/validate` |
| `ai-sdk.html` | **Models tab.** Vercel AI SDK configuration: providers, model aliases, `generateText()` settings, structured output, OpenRouter routing, limits, fixed safety settings, prompt test, effective SDK code | `GenerationModelConnection`, `GenerationModelDeployment.parameters` / `routingPolicy`, `generation.config.ts` |
| `models.html` | Earlier entity-based alternative: connections (cards) and models (table) | `GenerationModelConnection`, `GenerationModelDeployment` |
| `connection-edit.html` | Add/edit connection, adapter-driven fields, test | `…/model-connections`, `…/model-connections/:id/test` |
| `deployment-edit.html` | Model draft: parameters, requirements, test, versions | `…/model-deployments`, `…/test`, `…/publish` |
| `knowledge.html` | Guidance collection draft, documents, retrieval test | `KnowledgeCollection(Version)`, `KnowledgeDocument`, `…/test-retrieval` |
| `activity.html` | Run audit list and non-content run details | `GenerationRun`, `GET /api/generation/runs` |

## Usability decisions

- **One sidebar entry, tabs inside.** "AI-assisted drafting" sits under Integrations and opens one app with
  Overview · Profiles · Form actions · Models · Guidance · Activity tabs. That matches the spec's single, router-less
  Angular app and the admin redesign's tab pattern.
- **Plain names for internal concepts.** Binding → *form action*, knowledge collection → *guidance*,
  deployment → *model*, connection → *provider connection*. The technical key stays visible as secondary text.
- **Setup checklist.** The entities depend on each other in a fixed order: connection → model → (guidance) →
  profile → form action. The overview shows how far setup has got and links to the next step, which answers
  "why isn't the button showing?".
- **Show the server limits.** Env-backed settings appear read-only with their variable names. Number fields that
  are capped by the server say so ("Server maximum 40").
- **No JSON Pointers or JSON Schema by default.** Source paths and target fields come from pickers over the effective
  forms. The output type follows from the chosen component, and grounding is a four-step labelled scale.
  Advanced JSON stays available for technical users (FR-CFG-008).
- **One versioning language.** Profiles, models and guidance all use "Draft vN / vN published". The header
  puts Publish first, editing a published version means "New version", and "Compare with vN" is always offered.
- **Validation in three places.** A page alert with links, rail badges and a highlight on the affected row.
  A disabled Publish button names its reason.
- **Privacy is visible.** Data handling is recorded as plain questions with a verifier and date. Secrets are
  references, never pasted. The activity log shows only non-content audit data, and admin test runs are labelled.

## Not covered yet

- The question editor dialog, the add-field flow and the template picker dialog.
- Version history and compare views. They're linked but not drawn.
- The diagnostics viewer. It depends on `allowAdminDiagnostics` and the unbuilt diagnostics API.
- Dark mode. The admin kit doesn't define it.
