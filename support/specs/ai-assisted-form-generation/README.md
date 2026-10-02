# AI-assisted form generation

Status: proposed

Primary delivery target: customer-facing proof of concept

Initial use case: Research Activity to institutional RDMP

Initial model gateway: OpenRouter through the Vercel AI SDK

This directory defines a generic ReDBox capability for generating validated form values from authorised records, uploaded project documents, researcher-reviewed context, and approved institutional guidance. Record data and uploaded documents must each work independently and together. The first vertical slice helps a researcher create a data management plan, but the platform concepts deliberately do not contain DMP-specific assumptions.

The confirmed source-input requirement concerns the generation engine's capabilities. All source combinations use the same configured target form and generation pipeline. A Research Activity is one supported source type; document-based generation must work without one. The record-based POC described below demonstrates only part of this requirement. See the [source-input requirements](requirements.md#631-source-input-capability) and [implementation work](implementation_plan.md#11-required-source-input-extension).

## Documents

- [Requirements and decisions](requirements.md) — agreed scope, workflows, constraints, acceptance criteria, and POC boundary.
- [Design](design.md) — data model, services, APIs, form-runtime integration, UI, security, and consistency analysis.
- [Implementation plan](implementation_plan.md) — phased, file-level delivery sequence from POC to the complete configurable feature.
- [Task list](task.md) — executable tasks with interleaved unit, integration, API, and browser-verification gates.

## Delivery boundary

The POC implements the end-to-end researcher experience and persists bootstrap-seeded configuration. Model calls use the provider-neutral [Vercel AI SDK](https://ai-sdk.dev/docs) behind ReDBox's domain adapter contract. Full admin management screens and non-OpenRouter providers are designed now but delivered after the POC. The generation capability itself is a core feature; only representative demo record types, forms, records, and policy content belong in `redbox-hook-dev` or development bootstrap resources.

## Relationship to DMPChef

DMPChef is a useful reference for the pattern of combining project context, guidance, and a language model. It is not proposed as a runtime dependency. ReDBox should own the form-aware schema generation, permissions, provider abstraction, validation, lifecycle integration, provenance, and multi-brand isolation described here.

## Source input implementation

Generation Profiles can opt into project documents with this definition property:

```json
"documentSources": {
  "formats": ["pdf", "docx", "txt"],
  "maxFiles": 5,
  "maxFileBytes": 5242880,
  "maxTextBytes": 64000
}
```

Set `required: false` on each optional record `sourceSlot` to allow documents without a record. Omitting `required` preserves existing record requirements. A profile can also use `sourceSlots: []`; its document-only binding omits `sourceRecordType`, `sourceRelationship`, and `sourceValueMappings`. Profiles may define their own questionnaire length; the five-question POC remains a fixture choice. Publish a new profile version to change accepted sources; existing published profiles retain their behaviour.

Use a configured model deployment when enabling documents. The existing deterministic RDMP demo remains record-only: its fixed response and evidence IDs describe its seeded Research Activity. The integration suite supplies separate deterministic fixtures for document-only and combined generation.

The shared drafting panel offers document upload alongside record context and a document-only launch on eligible create forms. Researchers inspect extracted passages, confirm review, and can add corrections or unresolved conflicts. Generated values citing documents require review and carry filename/page or paragraph references through normal save and provenance reload.

Uploads use the authenticated, CSRF-protected `POST /:branding/:portal/generation/runs/:id/documents` endpoint; `DELETE /:branding/:portal/generation/runs/:id/documents/:documentId` removes a draft input. Execute submits the selected server-issued `documentIds`, `documentsReviewed: true`, and optional `documentNotes`. References from another run or actor are rejected. Concurrent document changes cannot overwrite each other's encrypted context.

Execute can also supply `sourceOid` to select a record after upload, or `null` to clear an optional record. The selected source is authorised again and completion mappings are recalculated before the run is queued.

Initial formats are text-based PDF, DOCX, and UTF-8 plain text. PDF extraction preserves page numbers; DOCX/TXT extraction preserves paragraph positions. Scanned PDFs need OCR before upload, and password-protected or unreadable documents are rejected. Extraction runs in a worker with time, page, and memory bounds; operator limits under `generation.documents` cap profile limits. Combined evidence and guidance share the existing total context budget.

Original files are removed after extraction. Extracted text is stored in the run's encrypted transient artifact and expires with it; successful provenance commit removes that text even when compact candidate diagnostics are retained. Files are not attached to the saved record or published as shared guidance. Durable provenance keeps source identities/hashes and locations, without retaining the extracted passages.

The exactly pinned dependencies `pdfjs-dist` and `mammoth` provide PDF and DOCX text extraction using their documented [PDF.js text API](https://mozilla.github.io/pdf.js/api/draft/api.js.html) and [Mammoth raw-text API](https://github.com/mwilliamson/mammoth.js#extractrawtext). Synthetic PDF, DOCX, and TXT fixtures cover extraction independently of model providers.

### Verification (2026-10-02)

- Backend generation unit/controller suites: 45 passing, covering real extraction, limits, optional record contracts, untrusted instructions/conflicting evidence, review requirements, authorization before upload, temporary-file cleanup, and provider credential/access failures without automatic retries or response leakage.
- Angular generation suites: 25 passing, covering document-only and combined launch, source selection after upload, review gating, retry/cancel behaviour, preserved form edits, and multipart CSRF headers. Shared contracts, core TypeScript, and the form application compile successfully.
- [Generation integration suite](../../../test/integration/services/GenerationService.test.ts): six passing against Sails, Mongo, and Agenda. The suite exercises record-only generation, real multipart upload/removal, document-only and combined generation on the same RDMP form, a second target form, actor/brand isolation, rejection of forged document IDs, normal save, and provenance reload after raw artifacts are removed.
- API route validation: 49 passing. Translation validation and focused backend lint pass.

The Docker mount suite ran in an isolated Compose project. Local setup required writable temporary storage, bypassing the already-built webpack step and coverage instrumentation, temporarily hiding the Redoc/Should packages from Sails module discovery, disabling live RVA bootstrap imports, and overriding the unrelated `concurrencyTest` fixture because the installed storage adapter lacks its strict-mode capability. These overrides were confined to the test runner; application configuration and the development containers were not changed.

Authenticated browser verification uses the same Tailscale origin as `sails_appUrl`: `http://nam-oci-agent-2.tail4a7c3.ts.net:1500`. Restarting the development portal loaded the current core, and administrator login was confirmed by “Welcome Local Admin”. The separate `redbox-hook-demo` profile now opts into PDF/DOCX/TXT uploads and an optional Activity, with the new upload labels added to its local translation bundle.

Browser checks passed for record-only launch with source defaults, document-only launch, real TXT/PDF/DOCX upload and extraction, page/paragraph previews, correction notes, review gating, document removal, unsupported-format errors, and selecting an Activity after uploads without losing them. Passage styling was moved into the form stylesheet to comply with the portal's Content Security Policy; the rebuilt form and computed browser styles were verified.

The reported failure for `Proposal-Example-2.pdf` was traced to the expired Bedrock bearer token. The PDF itself extracted successfully: 21 pages and 28,271 UTF-8 text bytes. After installing refreshed credentials privately and matching the demo connection to their `us-east-1` region, the original document-only run completed and populated all twelve configured RDMP fields. The draft remains unsaved for researcher review, with document-derived fields flagged for review. The previously generic failure metadata on this specific run was corrected to permit one normal, authorised retry with its retained inputs.

Bedrock and OpenRouter HTTP 401/403 responses now produce `GENERATION_PROVIDER_AUTH_FAILED` with an actionable credential/model-access message. They do not trigger automatic retries; a manual retry can reuse uploaded context and corrections within the existing expiry and retry limits. The Angular suite verifies this retention.

Live generation is verified with the supplied PDF. Full browser generation/review/save/reload across every source combination remains a separate verification gate. The automated integration suite already covers those lifecycle operations for all source combinations and a second target form; it does not establish the factual accuracy of a live model's response.
