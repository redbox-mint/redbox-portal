# Publication FoR save synchronization investigation

Investigated on 2026-09-29 from `origin/develop` commit
`9d46a74bd9995755ee772f3388503ca96f745ab6`, on branch
`bugfix/investigate-publication-server-sync`.

## Finding

The reported demo warning has **not been reproduced**. No core runtime change is
justified by the available evidence. The missing translation and the reason for
incomplete synchronization are separate issues.

The sandbox publication `a278d68aa7ae479c9ddc09bd9df05385` was treated as
read-only evidence. No sandbox records were created, saved, republished, or
otherwise changed during this investigation.

## Browser evidence

Using the T3 collaborative browser, tab `tab_7`:

- The sandbox home page displayed a Login link.
- A read of
  `/default/rdmp/record/metadata/a278d68aa7ae479c9ddc09bd9df05385`
  followed a redirect to `/default/rdmp/user/login`. The final response was
  HTTP 200 with `text/html`, not record metadata.
- `/locales/en/translation.json` returned HTTP 200 JSON and did not contain
  `@form-server-sync-review-message`.

An authenticated session was unavailable. The exact disposable-publication
FoR edit/save flow and the applicable delivered demo form could not be inspected.
The deployed core revision is also unverified.

The supplied demo-hook translation fix is commit `4da9ff2` on
`feature/llm-generation` in `redbox-hook-demo`. Its deployment was not verified.
The public bundle observation does not prove which hook commit is loaded, and
adding a translation does not establish a synchronization fix.

## Core control flow

The owning core paths are:

- `angular/projects/researchdatabox/form/src/app/form.component.ts`
- `angular/projects/researchdatabox/form/src/app/form-server-sync.service.ts`
- `angular/projects/researchdatabox/form/src/app/form-state/custom-set-value.control.ts`

The component snapshots submitted values and marks controls pristine immediately
before dispatch. Subsequent edits become dirty. After confirmed persistence it
uses returned metadata to synchronize the existing form, unless configuration or
navigation behavior skips this step.

`FormServerSyncService` calls the actual control setter with `emitEvent: false`.
For custom asynchronous setters it observes emitted changes during replacement
and restores the latest observed local value before returning. Its field names
come from the submitted and authoritative metadata keys; the demo's affected
keys remain unknown.

| Result reason | Meaning in the current code | Triggers review |
| --- | --- | --- |
| `set-failed` | The control setter or concurrent-value restoration threw; the control remains dirty and a field-specific warning is logged. | Yes |
| `local-edit-during-sync` | The control emitted a value during asynchronous replacement; the latest emitted value is restored and retained as dirty. | Yes |
| `local-edit` | A control was already dirty when its server replacement was considered. | No; its edit remains dirty |
| `unchanged`, `not-in-server`, `no-control`, `excluded` | The corresponding field did not require or permit replacement. | No |

An emitted change during replacement could be a real edit or an incorrectly
emitting custom component. A throwing setter could reflect incompatible value
shapes or a component defect. The warning alone does not distinguish them.

For either review-triggering reason, the component keeps the persisted response,
marks the form dirty, emits `FORM_SAVE_FAILURE` with the review-message key, and
does not emit ordinary save success or advance the accepted form baseline. The
response's `wasPersisted()` still reports successful persistence. Existing
conflicts are parked for review. These safeguards were not changed.

## Focused verification

The existing synchronization service tests cover edits made during an in-flight
save, asynchronous replacement races, actual setter rejection, explicit adoption,
and disabled synchronization. Existing component tests cover successful baseline
adoption, failed synchronization retaining its old baseline, conflict retries,
and protection of local edits.

One representative test was added to `form.component.spec.ts`. It uses the real
CheckboxTree component under `dc:subject_anzsrc:for`, selects a replacement
classification through checkbox interaction, submits via `saveForm()`, and uses
the real synchronization service to apply a returned object-array value. The
HTTP update is stubbed; the fixture is local and is not the unknown demo form.
It asserts the submitted classification, exact `ServerSyncResult`, authoritative
value, persisted response, clean form, updated baseline, and absence of a review
event. This is a control experiment, not a reproduction of the reported demo
condition.

Validation completed:

- `npm run compile:sails-ng-common`: passed. The first Angular build had been
  blocked by stale copied shared-package declarations; rebuilding the current
  package resolved those compile errors without source/dependency changes.
- Focused `form-server-sync.service.spec.ts` and `form.component.spec.ts` run:
  **89 tests passed**, exit code 0, in Chrome Headless 153.0.0.0. This includes
  the added representative FoR test. Its exact synchronization result was
  `{ patched: ['dc:subject_anzsrc:for'], skipped: [] }`.
- `git diff --check`: passed.

Commands run from the worktree root and then `angular/`, respectively:

```sh
npm_config_userconfig=/dev/null \
  npm_config_cache=/mnt/docker-storage/t3/npm-cache-form-sync \
  npm run compile:sails-ng-common

CHROME_BIN=/home/andrew/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome \
  npm test -- @researchdatabox/form --browsers=ChromeHeadlessNoSandbox \
  --include=projects/researchdatabox/form/src/app/form-server-sync.service.spec.ts \
  --include=projects/researchdatabox/form/src/app/form.component.spec.ts
```

Karma emitted existing fixture diagnostics for mocked dynamic assets and the
deliberately invalid empty group, plus a missing loading-image request. They did
not produce failed tests. This was a focused suite, not the full Angular suite.

## Evidence still needed

On an authenticated disposable Data Publication using the applicable demo form,
capture one FoR correction/save with:

1. The delivered form configuration, including FoR model/component, expressions,
   linked repeatables, and `serverSyncOnSave`.
2. Submitted metadata and the authoritative response metadata, together with
   persistence outcome, request ID, revision, and form fingerprint.
3. `ServerSyncResult.patched` and every `skipped` field name/reason.
4. Any field-specific setter exception and the control values/dirty state before,
   during, and after replacement. For emitted edits, establish whether a person
   edited the form or a component emitted despite the silent setter option.
5. The loaded core and demo-hook revisions and effective English translation.

No exact affected demo field path, value-shape mismatch, setter failure, or
concurrent edit was established. The core versus hook ownership of the original
warning remains unresolved.

## Recovery and deployment

If persistence succeeded but client synchronization requires review, preserve any
remaining local edits and inspect the saved authoritative record. After retaining
those edits, reload current values and reconcile intended changes. A genuine
concurrent edit must remain protected; a genuine setter failure requires its
field/configuration to be diagnosed before a clean synchronization can be claimed.

No core runtime deployment or existing-record repair follows from this branch.
The separate demo-hook translation fix still needs its deployment verified.
Do not suppress warnings, force replacement, disable synchronization, or mark
controls clean to hide the unresolved condition.
