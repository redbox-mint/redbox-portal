# Vocabulary Management Wireframes

## Vocabulary List (Admin > Vocabularies)

```
+────────────────────────────────────────────────────────+
| Admin Nav > Vocabularies > [Import from RVA] [New Vocab] |
+────────────────────────────────────────────────────────+
| Filters: [Type: flat ○ | tree ▲] [Source dropdown] [Search ⌕] [Apply] |
+────────────────────────────────────────────────────────+
| Table                                                |
| +----+-----------+--------+--------+-----------+------+
| | ID | Name      | Type   | Source | Last Sync | ⚙️   |
| +----+-----------+--------+--------+-----------+------+
| | v1 | Subjects  | Tree   | Local  | —         | Edit |
| | v2 | Languages | Flat   | RVA    | 2026-01-26| Sync |
| +----+-----------+--------+--------+-----------+------+
| Pagination controls (↤ 1 2 3 ↦)                       |
+────────────────────────────────────────────────────────+
| Notes/Audit strip: “Admin-only. Entries show status.”  |
```

Actions: row icons for edit/delete/sync; Import button opens RVA search modal/rail; filters for type, source, search.

## Vocabulary Detail + Entry Editor

```
+──────────────────────────────────────────────┐
| Breadcrumbs/Admin > Vocabularies > "Subjects" │
+──────────────────────────────────────────────┘
| [Save] [Cancel] [Delete]                      |
+──────────────────────────────────────────────+
| Metadata panel (form):
| Name: [Subjects               ]
| Slug: [subjects] (auto-gen)
| Type: (● Tree  ○ Flat)
| Source: (● Local  ○ RVA) – After import, read-only fields: Name, Type, Source, Description, Tags, Created/Modified metadata. Editable only by admin via explicit unlock action.
| Description: [multiline]
+─────────────────┬───────────────────────────+
| Entry tree       | Entry editor/detail       |
| +--------------+| +-----------------------+ |
| | Root nodes   ||  Label: [Physics]        |
| | • Science    ||  Value: [physics]        |
| |   └ Physics  ||  Identifier: [uri]       |
| | • Arts       ||  Parent: [Science ▼]     |
| |              ||  Order: [2]              |
| |              ||  [Save entry] [Remove]   |
| +--------------+| +-----------------------+ |
+─────────────────┴───────────────────────────+
| Controls: [Add child] [Add sibling] [Reorder ↑↓] [Drag handle ⋮⋮] |
| Notes: Flat type hides parent controls and shows simple list rows. |
```

Selecting a node populates the editor. Desktop shows drag handles plus `Reorder ↑↓` buttons; mobile/touch defaults to `Reorder ↑↓` when drag is unavailable. Parent picker enforces same vocabulary.

## RVA Import / Sync Panel

```
┌────────────────────────────┐
| Import Vocabulary from RVA |
└────────────────────────────┘
| Search: [Text field] [Search]             |
| Results:                                  |
| +----------+---------+------------------+-----------+
| | Status   | ID      | Title            | Versions  |
| +----------+---------+------------------+-----------+
| | ☆        | rva-123 | Animals          | Latest v2 |
| | ★        | rva-456 | Languages        | Current   |
| +----------+---------+------------------+-----------+
| Legend: Status (☆ = normal, ★ = featured/favorite). |
| [Import selected] [Cancel]                |
| Toast: “Imported Languages with 24 entries. Last synced just now.” |
```

Sync action reuses this panel to select a version (default latest/current). Success state echoes counts (`created`, `updated`, `skipped`) and updates `lastSyncedAt`.

## Notes
- List shows pagination and filters.
- Detail view splits metadata and entry tree; tree/list toggles based on type.
- RVA panel doubles as import and sync helper.

## Severity Notes (Admin Only)
- Severity notes appear as a dedicated expandable panel above the list table.
- Only admins can create/edit severity notes.
- Severity notes are filter-aware but not paginated with vocabulary rows (single note stream for the current filter set).
