# R25 bounded Spec remediation review

**Accept all three scoped remediations. No unresolved Spec objection.** Reviewed
the working-tree diffs against the pinned incoming portal/WSU revisions. The
incoming `spec-review.md` remains unchanged.

1. **S3 credential chain:** WSU `src/config/storage.ts` now supplies empty
   strings for absent/empty/whitespace optional credentials. Both required schema
   fields validate, while StorageManager still omits `opts.credentials` unless
   both values are populated. Explicit credentials retain their values. The
   deployment guide accurately distinguishes the credential chain from local
   Seaweed credentials. This restores the meaningful deployment setting required
   by `design.md:43`.
2. **Exporter options:** WSU `src/deployment.ts` now preserves supplied
   `templatePath` and `rifGroupName`, with the existing bundled defaults when
   absent/empty. The selected publication directory and canonical URLs continue
   reaching the exporter. This resolves the violated hook-argument preservation
   requirement in `extensions-v6.md:123`.
3. **PDF source path:** changing `pdfgen.sourceUrlBase` to an optional string
   matches the existing provider's path-prefix contract and empty-value fallback.
   The real loader accepts omitted, empty, relative view and query-prefix values;
   the actual PDF provider selects those paths or its current-brand default.
   Numbers, null, booleans and objects remain rejected. This restores the
   meaningful setting required by `design.md:43` without changing PDF execution.

Fresh independent verification on Node **26.11.1**:

- WSU's four S3 and two exporter subprocess regressions: **6 passing**.
- Core `test/configuration/resolution.test.ts`: **8 passing**.
- [Supplemental loader/provider probe](spec-remediation-pdf.cjs): **4 accepted
  path cases and 4 rejected type cases**, all asserted; [results](spec-remediation-pdf-results.json).

These are offline checks with synthetic driver/portal ports; no application,
database, AWS, Chromium or installed-image qualification is claimed. The primary's
full core/root fixture reruns remain separately owned and are not counted here.
No runtime, test or task file was edited by this reviewer.

R25 has three incoming A/P2 findings across the combined review. Remediation does
not satisfy the zero-new-findings confirmation gate.
