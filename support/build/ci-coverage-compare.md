# Standalone CI coverage comparison

`ci-coverage-compare.cjs` is a dependency-free Node.js helper for comparing two
LCOV artifacts. It reads reports and prints JSON to stdout. It does not change
CI, generate coverage, read source maps, access the network, invoke Git, or write
files. Run the focused tests with:

```bash
node --test support/build/ci-coverage-compare.test.cjs
```

For the planned Mocha/Playwright acceptance, compare each suite separately:
baseline Mocha against candidate Mocha, and baseline Playwright against candidate
Playwright. Preserve both original LCOV artifacts and this JSON. A combined
suite report could conceal a suite losing coverage that the other suite gains.
This helper and its synthetic tests do not establish that either suite, the
candidate image, or the CI coverage collection has passed acceptance.

## Usage and provenance

```bash
node support/build/ci-coverage-compare.cjs \
  --baseline coverage/baseline/mocha/lcov.info \
  --candidate coverage/candidate/mocha/lcov.info \
  --baseline-root /baseline/checkout \
  --candidate-root /candidate/checkout \
  --baseline-revision "$BASELINE_TESTED_REVISION" \
  --candidate-revision "$CANDIDATE_TESTED_REVISION" \
  --baseline-source-maps verified \
  --candidate-source-maps verified
```

Use the paths as recorded in each artifact's `SF` entries for the roots. For
example, a report produced in a container with `SF:/opt/redbox-portal/packages/...`
needs root `/opt/redbox-portal`, even when the artifact is read on another host.
Relative `SF` paths must already be repository-relative. Each root defaults to
the caller's current directory. Roots must be absolute; they need not exist on
the comparison machine. There are no environment-variable defaults for revisions
or source-map states, and unknown/duplicate CLI options are errors. `--help`
prints a short reference.

The revision options are **caller attestations**, not verified Git metadata.
Supply the full immutable source revision that actually produced each report,
not the comparison checkout's HEAD or the same invented label for both reports.
Missing, empty, or different revisions make an otherwise loss-free comparison
inconclusive. Line numbers and instrumentation identifiers can refer to different
code across revisions; displayed deltas then describe artifact differences only.
Comparing reports from different revisions is useful for diagnosis, but cannot
yield exit 0. Matching revision attestations also do not detect dirty worktrees
or different builds, dependencies, instrumentation, exclusions, or test inputs.

Both source-map options default to `unknown`. Their supported values are:

| State | Caller assertion | Effect |
| --- | --- | --- |
| `verified` | Coverage was correctly remapped upstream, and the maps and original sources belong to the attested tested revision. | Eligible for a loss-free result when both sides use this state. |
| `not-used` | Coverage measures the intended original sources directly and needs no remapping. | Eligible when both sides use this state. |
| `unknown` | Map availability, validity, or remapping correctness is unverified, including missing required maps. | Inconclusive. |
| `invalid` | Required maps are known to be missing, malformed, stale, or incorrectly applied. | Inconclusive. |

These flags cannot validate a map. LCOV alone cannot show that a map was present
or correctly applied. A producer must independently validate required maps and
source provenance before asserting `verified`; otherwise retain `unknown` or
use `invalid`. Differing states are inconclusive even if both would individually
be eligible. There is no fallback from missing TypeScript coverage to generated
JavaScript coverage, no `.js` to `.ts` substitution, and no `dist` to `src` alias.
Generated-code reports must be remapped and validated upstream before acceptance.

## Comparison and exit codes

Identities are compared within their normalized source file:

| Metric | Identity | Recorded count |
| --- | --- | --- |
| Line | Line number | `DA` execution count, plus optional checksum metadata. |
| Function | Start line, optional end line, and full name | Associated `FNDA` count. |
| Branch | Line number, block number, branch number | `BRDA` taken count; `-` is preserved as JSON `null`. |

Every file and identity is included, including unchanged entries. An entry has
`baseline` and `candidate` objects with exact counts, or a null object if that
identity is absent. Thus an absent branch (`candidate: null`) is distinct from
an existing branch with an unavailable taken count (`candidate: {"count": null}`).
`change` is `added`, `removed`, `changed`, or `unchanged`; flags expose lost
coverage, count decreases, new uncovered identities, and changed/missing checksums.
Each file has a presence state and metric totals; the summary aggregates totals,
covered identities, percentages, additions, removals, regressions, count changes,
count decreases, and added uncovered identities. Empty metric percentages are
null, never a fabricated 100%.

| Exit | Meaning |
| --- | --- |
| `0` | No observed loss under the policy below, with matching supplied revision and eligible source-map attestations. Status is `no-observed-loss` or `changed-no-observed-loss`. |
| `1` | At least one identity was removed, one newly added identity is uncovered, a covered identity became uncovered, or a numeric hit count decreased. Status is `coverage-loss`. |
| `2` | A report/argument is invalid, or there is provenance/checksum uncertainty without an observed loss. Status is `invalid-input` or `inconclusive`. CLI argument errors print usage to stderr instead of JSON. |

The loss policy is deliberately strict. Removing even an uncovered identity
fails because a reduced instrumentation inventory could hide missing coverage.
A drop from 5 hits to 2 fails despite both counts being covered. A new covered
identity or increased count is visible and does not alone fail. A branch `-`
has no numeric execution count and is uncovered for hit/percentage purposes;
transitions between `-` and numeric zero are displayed as count changes, without
inventing a numeric decrease. A positive branch count becoming `-` is a coverage
regression. Randomized/retried tests can change hit counts; investigate rather
than treating this exit policy as a statistical test.

Observed losses take precedence over provenance uncertainty (exit 1), and the
uncertainty remains in `reasons`. Invalid reports always return exit 2, with
`comparisonPerformed: false`, errors, no compared files, and no summary. A
syntactically incomplete source record is rejected. Truncation between complete
records can look valid; detecting it requires an independently supplied expected
source inventory or manifest. Missing, unreadable, empty, invalid UTF-8, or
source-free reports are errors, never zero coverage.

The JSON always sets `equivalenceClaim: false` and states its limited scope.
It records report SHA-256 hashes, original/normalized source paths, roots,
revision attestations, and map states so that different inputs remain visible.
Even identical reports cannot prove source, suite, build, image, behavior, or
runtime equivalence. Checksums are optional LCOV metadata, not full-file hashes;
a changed checksum or one-sided absence is inconclusive, while checksums missing
on both sides do not independently verify the source revision.

## Supported LCOV and path limitations

- Supports common named-function LCOV records: `TN`, `SF`, `FN`, `FNDA`, `DA`,
  `BRDA`, optional `LF/LH/FNF/FNH/BRF/BRH`, and `end_of_record`; LF and CRLF input
  and an initial UTF-8 BOM are accepted. `FN` may specify an end line. Names can contain commas, with a
  numeric second field in `FN` interpreted as an end line per that syntax.
  Numeric fields must be nonnegative safe integers; source line numbers start
  at 1. Optional summary records must agree with the identity records.
- Rejects unsupported records, including indexed function extensions such as
  `FNL/FNA`, rather than silently dropping data. Duplicate lines, branch
  identities, function names/counts, summaries, or normalized source records are
  errors. Every `FN` needs an `FNDA`, and every `FNDA` needs an `FN`; missing
  counts are never inferred as zero. A source record needs at least one identity.
  Missing metric categories are shown as empty, not assumed to be instrumented.
- Multiple `TN` records outside source records are accepted, but test labels are
  not compared. Repeated source records across tests/shards are rejected. Merge
  shards upstream using the coverage producer, preserving identities and
  regenerating summaries. This helper does not guess how to combine counts.
- Normalization is lexical: it handles `/` and `\`, `.` segments, and internal
  `..` segments, and confines absolute paths to the declared root with a path
  boundary check. Escaping relative paths, URLs, UNC paths, drive-relative paths,
  query/fragment syntax, control characters, and paths equal to the root are
  rejected. Windows drive letters are normalized; other path case is preserved.
  There is no basename matching, guessed prefix stripping, URL decoding,
  dependency filtering, or filename rename/move detection. Normalization
  collisions are errors rather than count merges.
- The helper never opens source files, dereferences source symlinks, follows map
  references, or verifies repository membership. The roots and source labels
  must accurately describe the artifacts. It compares only files present in
  either report and cannot discover code omitted from both; supply an independent
  expected-source inventory and verify coverage exclusions during acceptance.
- Both reports and the full JSON result are held in memory. This is an artifact
  comparison tool, not an untrusted large-file streaming service. No source line
  alignment, statement coverage, statistical tolerance, or configurable waiver
  policy is provided.

The module also exports `normalizeSourcePath(source, root)`,
`parseLcov(text, root)`, and `compareReports(baseline, candidate)` for local use.
Each comparison input is `{ text, root, revision, sourceMaps }`; missing roots
default to the current directory. `parseLcov` throws on invalid content;
`compareReports` returns the JSON-compatible report with its `exitCode`.
