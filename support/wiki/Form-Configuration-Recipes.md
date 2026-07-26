# Form Configuration Recipes

## Introduction

This page is an index of **recipes** — reusable, copy-and-adapt patterns for the
ReDBox form configuration DSL. Each recipe documents a self-contained piece of
form behaviour that we have implemented in a real form and want to be able to
reproduce consistently across record types and institutions.

Recipes are deliberately task oriented ("how do I make X happen") and lean on the
underlying reference documentation rather than repeating it:

- **[Configuring Record Forms](Configuring-Record-Forms.md)** — the overall form,
  workflow and record-type configuration model.
- **[Configuring Form Expressions](Configuring-Form-Expressions.md)** — the
  event-driven `expressions` system used to react to field changes with JSONata.
- **[Form Event Bus Architecture](Form-Event-Bus-Architecture.md)** — the event
  types (`field.value.changed`, `form.definition.ready`, …) that conditions match
  against.
- **[Form Configuration Internals](Form-Configuration-Internals.md)** — the
  `Definition` / `Config` / `Frame` types behind the config.

## Key building blocks

Most recipes combine two mechanisms. It helps to keep the distinction clear:

| Mechanism | Where it lives | What it is for |
|-----------|----------------|----------------|
| **Behaviours** | Top-level `behaviours: []` on the form config | Multi-step *pipelines* — run `processors` (e.g. transform a value, fetch a record from the server) then run `actions` (e.g. set a field value, emit an event). Use when you need to *fetch data* or *coordinate* several fields. |
| **Expressions** | `expressions: []` on an individual component | Single-target reactions — when a condition matches, evaluate a JSONata `template` and write it to one `target` (usually `model.value`). Use when you need to *populate one field* from an event. |

Behaviours are documented per-recipe below (they are not yet covered by a
standalone reference page); expressions have their own reference page linked above.

## Available recipes

- **[Populating fields from a related record](Form-Configuration-Recipe-Populate-From-Related-Record.md)** —
  when a user selects a related record (or the record's OID is passed as a URL
  parameter), fetch that record's metadata and pre-fill fields on the current
  form. This is the pattern behind the *related RDMP* on a Data Record and the
  *related Data Record* on a Data Publication.
- **[Gating fields until a related record is selected](Form-Configuration-Recipe-Gate-Fields-Until-Related-Record-Selected.md)** —
  keep the related-record selector enabled while disabling every dependent input
  and repeatable until a selection exists, including initial-load, clear, and
  URL-parameter behaviour.
- **[Configuring option sets and vocabularies](Form-Configuration-Recipe-Option-Sets-And-Vocabularies.md)** —
  choose between field-local `options` and reusable `vocabRef`/`inlineVocab`
  vocabularies for dropdowns, radio buttons, and checkboxes.
- **[Migrating dynamic field expressions](Form-Configuration-Recipe-Expressions.md)** —
  convert legacy `visibilityCriteria`, `subscribe`, and template callbacks into
  v5 expressions for visibility, value population, disabled state, and
  conditional validation groups.
- **[Rendering fields in view mode](Form-Configuration-Recipe-View-Mode-Rendering.md)** —
  how the edit form becomes the read-only view: automatic input→content
  transforms, scoping components to `view`/`edit` with `allowModes`, authoring
  view-only content, rendering computed/cross-field values from `formData`, and
  the hidden value-carrier pattern.

## Adding a new recipe

1. Create a page named `Form-Configuration-Recipe-<Short-Name>.md`.
2. Follow the shape of the existing recipes: a short problem statement, a
   worked example drawn from real config, the moving parts explained, and a
   "gotchas" section.
3. Add a bullet to **Available recipes** above.
4. Add the recipe (or at least this index) to the **Developer Reference** list on
   the wiki [Home](Home.md) page.
