# Recorded native contracts

These fixtures record Fastify observations at
`d776f9581bec488b211454791794e79eeaee034d`, before first-party Express retirement.
The historical differentials still execute their original comparisons and
production assertions during capture. Expected values are never captured from
the implementation being qualified. Normal tests have no update mode.

`goldenContracts.ts` decodes each expectation and compares the complete value
with `node:assert/strict.deepEqual`. The fixtures preserve status, normalized
non-volatile headers, complete bodies and the state, audit, event, provider,
session, action and guard observations each historical suite recorded. Existing
explicit production assertions also remain. Per-family assertion controls corrupt
the recorded components and require the same equality assertion to reject them.

The format uses lossless references to keep repeated observations reviewable:

- `cases` maps explicit input keys to expectations. Metadata keys include the
  original case index because two distinct inputs share a title.
- `sourceTitles` records the historical title for renamed native host tests;
  renaming keys changes no expected value.
- `sequences` maps the original complete Mocha title to ordered observations.
- `shared` contains complete values addressed by `$ref`. The large route corpus
  stores these in `sharedFiles` shards and title sequences in `sequenceFiles`
  shards, named explicitly in its index. Shards contain ordinary full JSON
  observations; the helper loads them lazily and drops decoded values between
  tests.
- `$undefined` preserves JavaScript undefined, including absent headers.
- `$json` reconstructs a complete JSON response string. Its `$object` entry pairs
  preserve property ordering, so raw body comparisons remain exact.
- `$concat` joins array chunks; `$text` joins string chunks. Both reconstruct the
  complete value, including long malformed-input and route corpora.
- `$body` reads a complete base64 wire body from the named fixture file. The
  eleven large asset bodies were recovered from historical native responses;
  their lengths and hashes match the original differential's digest observations.
  Assertions compare all bytes, including compressed representations.

References and chunks are storage deduplication, not digests, projections or
partial matching. Provenance hashes in FM-043 evidence identify fixture bytes;
they do not replace response/state assertions.

Normalization remains suite-specific and follows the historical observation
helpers: connection/date headers, generated credentials/nonces, disposable
origins/identifiers and explicitly volatile timestamps are normalized where that
suite previously normalized them. Session wire captures additionally retain all
other headers and complete bodies while mapping random signed credentials to
continuity identities. Progress client captures retain complete compressed bytes
and still compare decompressed bytes with the pinned package.

The asset collision capture shared one OIDC issuer and portal port across the
three hosts. Across fresh processes those two injected origins are volatile.
Only their exact occurrences in response bodies and Location headers (including
encoded callback origins) map to distinct stable fixture origins; URL paths and
parameters, status, other headers and all other bytes remain checked. The
original captured bytes and the transformed bodies/locations are
accounted for in `asset-origin-normalization.json` in the evidence artifacts.

Scoped-hook dispatch and generated asset reservations also retain complete
native wire/state observations. Generated static fixtures use the same fixed
mtime during historical capture and current execution so their newly recorded
Last-Modified and ETag headers are stable. Their original parity checks remain
active during capture.

Exact capture commands, instrumentation provenance, failed capture attempts,
fixture receipts and qualification results are recorded in
`support/specs/fastify-migration/evidence/FM-043.md` and its linked artifact folder.
