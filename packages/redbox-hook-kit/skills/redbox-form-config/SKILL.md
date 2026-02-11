---
name: "Redbox Form Config"
description: "ReDBox uses a JSON-based DSL for configuring record forms, workflows, and record types."
---

# Skill: Redbox Form Config

## Context
ReDBox uses a JSON-based DSL for configuring record forms, workflows, and record types.

## Locations
- Form configurations: `config/form.js`
- Workflow configurations: `config/workflow.js`
- Record type configurations: `config/recordtype.js`

## Key Concepts
- **Record Type**: Defines the entity (e.g., `rdmp`) and its search filters.
- **Workflow**: Defines stages (e.g., `draft`, `review`), transitions, roles, and which form to use at each stage.
- **Form**: Defines the layout and fields.
- **Field**: Each field has a `class` (usually `Container`), a `compClass` (the Angular component name, e.g., `TextBlockComponent`), and a `definition`.

## Generating Form Fields
Use the `redbox-hook-kit` CLI generator `generate_form_field`:
- `name`: Field name as an argument.
- `--type <type>`: Record type (e.g., `rdmp`).

## Form Expressions
Dynamic behavior is handled via `expressions`:
- Listen to events using JSON Pointer paths (e.g., `/form_tab/source_field::field.value.changed`).
- Apply conditions and templates (using JSONata).
- Target model or component properties.

## Language Files
Labels and messages should use keys (starting with `@`) that map to entries in `assets/locales/<language>/translation.json`.
