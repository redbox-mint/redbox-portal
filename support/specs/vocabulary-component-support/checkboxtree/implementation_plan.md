# Checkbox Tree Component for Hierarchical Vocabulary

A new configurable form component that renders a hierarchical vocabulary as an expandable/collapsible tree with checkboxes. Replaces the legacy `ANDSVocabComponent`. Supports two data-loading strategies: **inline** (small vocabs baked into form config at build time) and **lazy** (large vocabs fetched on-demand as the user expands tree branches).

---

## Design Decisions

### Data Model

The model value is an **array of objects**, each containing the selected item's metadata. This maintains compatibility with the legacy `ANDSVocabComponent` format:

```typescript
// CheckboxTreeSelectedItem — stored in the form model value
interface CheckboxTreeSelectedItem {
  notation: string;    // The unique code identifier (e.g. "0101")
  label: string;       // Human-readable label
  name: string;        // Display string e.g. "0101 - Pure Mathematics"
  genealogy?: string[]; // Parent notation codes, ancestors-first
}

// Model value type
type CheckboxTreeValue = CheckboxTreeSelectedItem[];
```

### Selection Modes

Configurable via `leafOnly` (default: `true`):
- **`leafOnly: true`** — Only leaf nodes (e.g. 6-digit ANZSRC FoR codes) get checkboxes
- **`leafOnly: false`** — All nodes at any depth level are selectable

Selection behavior for hierarchical nodes:
- Selecting a parent node does **not** auto-select descendants.
- Deselecting a parent node does **not** auto-deselect descendants.
- Parent checkbox visual state may be `indeterminate` to reflect selected descendants, but model values remain explicit selected nodes only.

### Lazy Loading Contract

- The `children` API returns immediate children only (unpaged by design).
- `parentId` omitted means return root nodes.
- `parentId` provided means return only direct children of that node.

### API Response Contract (`children`)

Node shape returned by `GET /:branding/:portal/vocab/:vocabIdOrSlug/children`:

```typescript
interface CheckboxTreeApiNode {
  id: string;
  label: string;
  value: string;
  notation?: string;
  parent?: string | null;
  hasChildren: boolean;
}
```

Response shape:

```typescript
{
  data: CheckboxTreeApiNode[];
  meta: {
    vocabularyId: string;
    parentId: string | null;
    total: number;
  };
}
```

Error behavior:
- `400` + `invalid-vocabulary-id-or-slug` when `vocabIdOrSlug` is empty
- `404` + `vocabulary-not-found` when vocabulary does not exist for branding
- `400` + `invalid-parent-id` when `parentId` does not belong to vocabulary
- `500` + `vocabulary-children-failed` for unexpected errors

### Genealogy Strategy

For now, genealogy is computed in the Angular component from the rendered ancestry path:
- Selection is only possible on nodes already rendered in the tree.
- Rendered nodes have a known parent chain from expansion history.
- Build `genealogy` as ancestor notations from root to parent.

Future extension (if needed):
- If selection flows are added that can bypass rendered ancestry (for example search-first selection), add a server endpoint that returns ancestry by node id.

### Accessibility Requirements

- Use `role="tree"` on the tree container and `role="treeitem"` for each node.
- Use `aria-expanded` on expandable nodes and keep it synced to UI state.
- Use `aria-checked` (`true`/`false`/`mixed`) for checkbox state.
- Keyboard support: `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `Space`, `Enter`.
- Ensure visible focus indicators and deterministic tab order.
- Associate labels with checkboxes and include screen-reader-friendly node level context.

### Config Example (v5 format)

```json
{
  "name": "dc:subject_anzsrc:for",
  "model": {
    "class": "CheckboxTreeModel",
    "config": { "value": [] }
  },
  "component": {
    "class": "CheckboxTreeComponent",
    "config": {
      "vocabRef": "anzsrc-2020-for",
      "inlineVocab": false,
      "leafOnly": true
    }
  }
}
```

---

## Proposed Changes

### Component Type Definitions (`sails-ng-common`)

---

#### [NEW] `packages/sails-ng-common/src/config/component/checkbox-tree.outline.ts`

Frame/Outline interfaces following the same pattern as `packages/sails-ng-common/src/config/component/checkbox-input.outline.ts`:

- **`CheckboxTreeNode`** — Tree node shape: `{ id, label, value, notation, children?, hasChildren? }`
- **`CheckboxTreeSelectedItem`** — Selected item shape: `{ notation, label, name, genealogy? }`
- **`CheckboxTreeFieldComponentConfigFrame`** — `vocabRef`, `inlineVocab`, `treeData`, `leafOnly`, `maxDepth`
- **`CheckboxTreeTypes`** — Type union + name constants (`CheckboxTreeComponentName`, `CheckboxTreeModelName`)

---

#### [NEW] `packages/sails-ng-common/src/config/component/checkbox-tree.model.ts`

Model classes + visitor `accept` methods + `CheckboxTreeMap` / `CheckboxTreeDefaults` for dictionary registration.

---

#### [MODIFY] `packages/sails-ng-common/src/config/dictionary.outline.ts`

Add `CheckboxTreeTypes` to `AllTypes` union.

#### [MODIFY] `packages/sails-ng-common/src/config/dictionary.model.ts`

Add `CheckboxTreeMap` to `AllDefs` and `CheckboxTreeDefaults` to `RawDefaults`.

---

#### [MODIFY] Visitor infrastructure

Add 3 new visitor methods (`visitCheckboxTree{FieldComponent,FieldModel,FormComponent}Definition`) to:

| File | Change |
|------|--------|
| `packages/sails-ng-common/src/config/visitor/base.outline.ts` | Add to `FormConfigVisitorOutline` interface |
| `packages/sails-ng-common/src/config/visitor/base.model.ts` | Add default `notImplemented()` stubs |
| `packages/sails-ng-common/src/config/visitor/vocab-inline.visitor.ts` | Handle `CheckboxTreeComponentName`: call `getEntries(branding, vocabRef, ...)` and transform flat entries to nested `treeData` |
| `packages/sails-ng-common/src/config/visitor/construct.visitor.ts` | Pass-through stubs |
| `packages/sails-ng-common/src/config/visitor/client.visitor.ts` | Pass-through stubs |
| `packages/sails-ng-common/src/config/visitor/data-value.visitor.ts` | Pass-through stubs |
| `packages/sails-ng-common/src/config/visitor/template.visitor.ts` | Pass-through stubs |
| `packages/sails-ng-common/src/config/visitor/validator.visitor.ts` | Pass-through stubs |
| `packages/sails-ng-common/src/config/visitor/json-type-def.visitor.ts` | Pass-through stubs |

For inline resolution, reuse existing `VocabularyService.getEntries()` and construct the hierarchy in the visitor:
- Fetch all entries for `vocabRef` (iterate `limit`/`offset` pages until `meta.total` is reached)
- Build parent/child links from entry `parent` ids
- Compute `hasChildren` for each node while building the tree
- Set component `treeData` with the computed root nodes

---

#### [MODIFY] `packages/sails-ng-common/src/config/visitor/migrate-config-v4-v5.visitor.ts`

Add legacy `ANDSVocab` → `CheckboxTree` mapping:

```typescript
// In formConfigV4ToV5Mapping:
"ANDSVocab": {
    "": {
        componentClassName: CheckboxTreeComponentName,
        modelClassName: CheckboxTreeModelName
    },
    "ANDSVocabComponent": {
        componentClassName: CheckboxTreeComponentName,
        modelClassName: CheckboxTreeModelName
    },
},
```

Add `visitCheckboxTreeFieldComponentDefinition` that maps `definition.vocabId` → `vocabRef` and carries over `leafOnly`-related regex config.

Add migration edge-case handling:
- missing `vocabId` leaves `vocabRef` undefined and emits migration warning
- malformed regex/legacy flags fallback to safe defaults
- unknown legacy `compClass` falls back to generic mapping with warning
- invalid legacy default value shape coerced to empty selection array

---

### Server API (`redbox-core-types`)

---

#### [MODIFY] `packages/redbox-core-types/src/services/VocabularyService.ts`

Add `getChildren(branding: string, vocabIdOrSlug: string, parentId?: string)` — resolves vocabulary by id/slug + branding, then returns immediate children of a parent entry (or root entries if no `parentId`). Each result includes a `hasChildren` boolean.

#### [MODIFY] `packages/redbox-core-types/src/controllers/FormVocabularyController.ts`

Add `children` action accepting `vocabIdOrSlug` and optional `parentId`.
Also add `'children'` to `_exportedMethods`.
Implement contract-aligned validation and error mapping for `invalid-parent-id` and `vocabulary-children-failed`.

#### [MODIFY] `packages/redbox-core-types/src/config/routes.config.ts`

Add route: `'get /:branding/:portal/vocab/:vocabIdOrSlug/children'` → `FormVocabularyController.children`

#### [MODIFY] `packages/redbox-core-types/test/controllers/FormVocabularyController.test.ts`

Add tests for `children`:
- success for root fetch (`parentId` omitted)
- success for nested fetch (`parentId` provided)
- `400` invalid vocab id
- `404` vocabulary missing
- `400` invalid parent id
- `500` unexpected service failure

#### [MODIFY] `packages/redbox-core-types/test/services/VocabularyService.test.ts`

Add tests for `getChildren`:
- returns direct roots only when `parentId` absent
- returns direct children only when `parentId` present
- computes `hasChildren` correctly
- rejects parent ids not in vocabulary
- handles orphaned entries and cycle-protection behavior

---

### Angular Form Component + Shared API Service

---

#### [NEW] `angular/projects/researchdatabox/form/src/app/service/vocab-tree.service.ts`

Shared service for vocabulary tree APIs used by form components:
- Wraps `GET /:branding/:portal/vocab/:vocabRef/children?parentId=X`
- Centralizes request/response mapping and error handling
- Keeps component focused on rendering and selection state

#### [NEW] `angular/projects/researchdatabox/form/src/app/service/vocab-tree.service.spec.ts`

Unit tests for API URL construction, query params, and response mapping.

#### [NEW] `angular/projects/researchdatabox/form/src/app/component/checkbox-tree.component.ts`

Angular component (`redbox-checkbox-tree`) that:
- Recursively renders tree nodes with expand/collapse toggles and checkboxes
- Supports `leafOnly` mode (checkboxes only on leaves vs. all nodes)
- Tracks selected values as `CheckboxTreeSelectedItem[]` with genealogy
- **Inline mode**: renders pre-loaded `treeData` from config
- **Lazy mode**: fetches children via `vocab-tree.service`
- Shows loading indicators while fetching

#### [NEW] `angular/projects/researchdatabox/form/src/app/component/checkbox-tree.component.spec.ts`

Unit tests: creation, inline tree rendering, selection/deselection, leafOnly mode, model value updates.
Also include:
- no parent/child cascade selection behavior
- indeterminate state behavior
- keyboard interaction behavior
- accessibility attributes (`role`, `aria-expanded`, `aria-checked`)
- lazy-loading error state handling

#### [MODIFY] `angular/projects/researchdatabox/form/src/app/static-comp-field.dictionary.ts`

Register `CheckboxTreeComponent` + `CheckboxTreeModel` in the static class maps.

#### [MODIFY] `angular/projects/researchdatabox/form/src/app/form.module.ts`

Add `CheckboxTreeComponent` to `declarations`.

---

## Verification Plan

### Automated Tests

```bash
# Server-side (new children endpoint tests)
cd packages/redbox-core-types && npm test

# Shared types (compile + dictionary registration)
cd packages/sails-ng-common && npm run pretest && npm test

# Angular component and vocab-tree service specs
cd angular && npx ng test @researchdatabox/form --watch=false
```

Non-happy-path tests required:
- empty vocabulary
- duplicated entry ids in source data
- broken parent references
- service/network failures in lazy mode
- very large sibling list performance sanity check

### Manual Verification

Add a `CheckboxTreeComponent` definition to an existing form config file, boot the dev server, and confirm:
1. Tree renders with expand/collapse
2. Checkboxes appear on correct nodes (leaf-only vs all)
3. Selection updates the model value with `{notation, label, name, genealogy}`
4. Lazy loading fetches children on expand for non-inlined vocabs
5. Keyboard navigation and ARIA behavior work with a screen reader
