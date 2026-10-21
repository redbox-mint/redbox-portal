# Shared publication vocabulary release (stage 2)

Stage 2 has its own acceptance and activation, after stage 1 processing acceptance.
The existing `/admin/integrations/figshare/vocabularies` navigation and embedded
Angular application remain the entry point. `vocab.publicationAdministrationEnabled`
defaults to false. Deploy the matching core, Mongo hook, local hooks, shared Angular
library, vocabulary application, AppConfig application and translations together.
Stage 1 retains the original Figshare catalogue, crosswalk IDs and editor until
this separate gate is accepted. Turning administration off after conversion does
not restore legacy write authority.

## Identities, approvals and outputs

Targets use a namespace plus a string value: a URI, opaque identifier or verified
Figshare category string. Generic outputs are `targetId`, `value`, `sourceId` and
`label`. Local codes retain case with `exact-v1`; converted Figshare crosswalks
retain `figshare-code-v1`. Only the Figshare payload/legacy adapter converts
verified category values to numeric API IDs. Do not insert numbers into generic
imports or coerce URI targets into Figshare categories.

Working and approved pointers differ. Approval seals entries/code aliases, edges,
target labels/history, approver/time and audit references. A later import, edit,
approval, retirement or archival cannot change an explicit revision pin. Existing
sealed stage-1 Figshare responses are replayed directly. Keep legacy service,
route, category aliases and persisted configuration references indefinitely while
anything refers to them. A new draft does not hide the last approved mapping.

The generated reference publishes the shared source, target, edge, revision,
crosswalk and resolution contracts. Its typed
[`publication-vocabulary.ts` example](https://github.com/redbox-mint/redbox-portal/blob/master/support/documentation/examples/publication-vocabulary.ts)
shows a reviewed URI catalogue and an explicitly pinned request. Generation and
documentation tests validate its import against the real API schema. Replace
illustrative IDs with brand-local approved IDs. Figshare imports resolve configured
credentials on the server; clients supply a catalogue scope/ID rather than a token
or URL. Public/account catalogues retain distinct identities.

## Rehearse on a disposable copy

Stop every legacy vocabulary writer, including older/disabled portal processes.
Confirm this operationally; an empty admission list cannot prove older writers
stopped. Keep a copy of the original datastore and restrict evidence output to
operators. Run from the matching deployed checkout. The reusable runner uses the
normal queue-disabled CLI loader and never enables processing or administration:

```bash
node support/publication/admin.js convert-vocabularies --brand BRAND --username ADMIN > vocabulary-before.json
node support/publication/rehearse.js --disposable-copy --stage 2 --brand BRAND --username ADMIN --evidence /restricted/rehearsal-vocabulary-1 --apply --reason 'CHG-123 copied vocabulary rehearsal'
```

The runner compares whole-copy legacy/source/audit counts and SHA-256 inventories,
checks original source/crosswalk provenance, mapping IDs and attribution, import
digests, approval/audit references and frozen resolution, and asserts that a
committed replay changes no shared or legacy evidence. It writes only hashes,
counts and safe CLI reports. Use an isolated copy: unrelated live writes correctly
fail the comparison. Repeat after an interrupted converter using
`--baseline /restricted/first-attempt/before.json` and a **new** evidence directory.
Never rewrite a baseline to hide drift. Keep the failed report and investigate.

## Forward-only activation

1. Record source commit, package versions and asset hashes, copied-data inventory,
   rehearsal outputs, prior/current approval digests, legacy aliases and original
   import/audit identities. Confirm the deployed writer set is stopped/drained.
2. Enable the administration setting consistently for the stopped/matching process
   set used by the CLI. Preview conversion with the command above. Conversion
   requires a current administrator for that explicit brand; keep researchers and
   foreign-brand identities out of the administration flow.
3. Apply the reviewed production conversion separately from rehearsal:

```bash
node support/publication/admin.js convert-vocabularies --brand BRAND --username ADMIN --apply --reason 'CHG-123 accepted stage-2 conversion' > vocabulary-applied.json
node support/publication/admin.js convert-vocabularies --brand BRAND --username ADMIN --apply --reason 'CHG-123 verify committed replay' > vocabulary-replayed.json
```

4. Confirm committed authority and stable inventory fingerprint. Compare history,
   original approver/time, retired targets and explicit frozen references through
   the existing URL and legacy aliases. Exercise a nonnumeric import, draft/save,
   approval, stale-editor conflict, brand denial and CSRF checks on staging. Verify
   configured credentials stay masked in AppConfig and absent from browser/history
   responses. Record request IDs, revision digests and screenshots/test reports.
5. Accept and start the matching application processes. Verify stage-1 processing
   and existing approvals remain unchanged. Record operator sign-off and monitoring
   ownership. Conversion does not republish historical records or enable destinations.

On interruption, retain control/legacy/shared collections and rerun the same
converter. Source drift or unknown evidence requires investigation and a compatible
forward fix. Do not drop control rows, edit sealed approvals, run a down migration
or start legacy writers. For a positively stopped crashed writer, use exact IDs
reported in dry-run and parameters `settledWriterIds`, `settlementEvidence` and
`confirmLegacyWritersStopped: true`, with apply/reason. Retain settlement evidence;
age alone grants nothing. An interrupted import preview requires explicit review
in shared administration; it is not automatically replayed.

## External acceptance record (operator-owned)

- [ ] Customer copied-data rehearsal: copy/backup identity, source versions,
  before/after inventories, interruption/replay reports and explanations of every
  quarantine or history mismatch.
- [ ] Institution staging UI/API acceptance: actors/brands, credential rotation and
  masked reload, numeric Figshare versus URI/opaque outputs, frozen references,
  historical approvals/audits, CSRF/permissions, original URL and route aliases.
- [ ] Compatible deployed packages/UI and all writer processes inventoried, drained,
  converted and explicitly activated; release ID, asset hashes and timestamps kept.
- [ ] Named operator accepts stage 2, verifies stage-1 processing remains healthy
  and retains monitoring/incident/forward-repair references.

Local fixtures and generated references support these checks; they do not certify
institutional accounts, copied customer data or deployed release acceptance.
See [processing cutover and forward repair](Shared-Publication-Operations).
