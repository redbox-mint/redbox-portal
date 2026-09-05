# Custom Brand Typeface review remediation

Date: 2026-09-05. Worktree: `t3code-fc129924`, branch
`feature/branding-management-custom-fonts`; starting HEAD `a531713e5`.
Runtime used here: Node 24.18.0; Chrome Headless 149 on Linux.

## Changes and regression evidence

| Finding | Change and coverage |
|---|---|
| Draft colours entering migration snapshots | Compare published CSS/hash, recover colours from matching published history or editable declarations in published CSS, leave draft colours independent. Migration regressions cover dirty drafts, legacy rollback, exact CSS regeneration and stopping before pruning when recovery is impossible. |
| Fractional retention deleting history | Require a positive safe integer and log fallback to three. Regressions cover 0.5, 1.5, NaN, infinity, zero and negative values. |
| Identical reupload allocating versions | Compare publication CSS and ordered face slot/hash identity. Conditionally align equivalent draft metadata/colours to active, without creating or pruning a version. Regressions cover renamed identical uploads and explicit default colour values. |
| Removed faces resurrecting | Single-slot uploads copy only the durable draft. Regression removes Regular/Bold/Italic, uploads Regular and verifies that optional slots remain absent. |
| Shadow DOM fonts not loading | Register preview FontFace objects in the document with unique per-preview aliases; clear obsolete faces and inherited active-family variables. Chrome checks successful load, selected-file text widths, distinct preview aliases, Default reset and one initial attachment of single-use CSS. |
| Visible colour edits discarded | Save colour inputs before Preview/Publish and use the returned revision. Preserve local colours through typography mutations and pending publication; serialize mutations and stop on save conflict. Angular regressions cover these sequences. |
| Container-only validation accepting invalid bytes | Pin wawoff2 2.0.1; genuinely decode in bounded disposable workers and check reconstructed sfnt structure. Replace successful synthetic fixtures with licensed static/variable Roboto files. Backend rejects empty/filler/truncated data; Chrome loads every genuine fixture. ADR 0002 supersedes the invalid container-only decision. |
| Duplicated transition / rejected update cleanup | Share publication persistence for publish/restore. Clean attempted history after certified non-application errors; preserve history after a possible commit with lost response. Both operations have regression coverage. |

The first migration regression run was red: eight failures, including the empty
history result for retention 0.5 and blue draft colours copied into published
history. Those cases now pass.

## Results

- Backend branding suite: 153 passing.
- Chrome Angular suite: 26 passing, including real font loading and text metrics.
- Core TypeScript compilation: passed.
- Targeted lint: zero warnings/errors.
- Edited-file formatting and `git diff --check`: passed.

## Commands

Backend branding suite, from `packages/redbox-core`:

```sh
TS_NODE_PROJECT=test/tsconfig.json node --no-experimental-strip-types \
  -r ts-node/register/transpile-only -r chai node_modules/mocha/bin/mocha.js \
  --no-config --require test/setup.ts --timeout 10000 \
  'test/services/Branding*.test.ts' 'test/controllers/Branding*.test.ts' \
  'test/model/BrandingTypeface.test.ts' 'test/migrations/BrandingTypefaceBackfill.test.ts' \
  --reporter dot
```

Angular browser suite, from `angular` (set `CHROME_BIN` to the installed Chrome):

```sh
CI=true node node_modules/@angular/cli/bin/ng.js test @researchdatabox/branding \
  --watch=false --browsers=ChromeHeadlessNoSandbox
```

Core compilation: `cd packages/redbox-core && node node_modules/typescript/bin/tsc`.
Targeted oxlint, formatting checks and `git diff --check` cover the edited files.

## Scope and limitations

This evidence is from real service/controller unit paths and Chrome component
tests. The mounted portal, database integration, REST/AJAX Bruno lifecycle and
Node 26 runtime were not rerun. Previous synthetic-fixture success must not be
used as browser-rendering evidence.

Generic datastore transport errors have uncertain commit outcomes. Their history
is deliberately retained, since deleting it could destroy the only snapshot of
a committed publication. This change does not claim to resolve distributed
crash recovery or uncertain non-applied history remnants.

The decoder performs genuine WOFF2 reconstruction and structural checks; it is
not a replacement for every browser OpenType sanitizer. Worker resource budgets
must be reviewed when upgrading its pinned WebAssembly build. Fonts and decoder
licensing/provenance are recorded in the fixture README and ADR 0002.
