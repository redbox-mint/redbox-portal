# ADR 0002 — WOFF2 inspection via internal structural parser

Status: accepted
Date: 2026-09-04
Decides: tasklist.md T00 (design.md sections 2, 3.2, 8.1, 8.2, 14)

## Context

The Brand Typeface feature (design.md, ADR 0001) needs server-side WOFF2
validation that parses untrusted bytes from a `Buffer`, rejects
malformed/truncated input fail-closed, distinguishes static from variable
fonts via the table directory (including `fvar`), and extracts best-effort
family metadata — on the repo's Node 24 CI and Node 26 runtime images.

The only maintained Node candidate, `fontkit@2.0.4` (MIT, last publish Aug
2024), was evaluated and rejected:

- Open crafted-font denial-of-service report (foliojs/fontkit#368, Apr 2026):
  a small crafted TrueType font crashes the Node process via composite
  glyph path access. No fixed release exists, so the design gate ("no known
  unmitigated crafted-font DoS") fails.
- Full glyph outline/layout parsing is unnecessary attack surface for this
  feature, which only needs container validation + `fvar` detection.
- Transitive dependencies (`brotli`, `restructure`, `dfa`, …) use semver
  ranges, conflicting with the repo's exact-pinning supply-chain policy.

Alternatives (`opentype.js`, `wawoff2`, `fonteditor-core`) either share the
same glyph-path exposure, lack maintained WOFF2/variable support, or add
native/wasm loading complexity. A minimal internal inspector satisfies the
same structural-validation requirements with zero new dependencies.

## Decision

Implement `packages/redbox-core/src/services/BrandingWoff2Inspector.ts`: a
dependency-free parser for the WOFF2 header + table directory (W3C WOFF2 REC
2024, sections 3–4) with strict UIntBase128, known-tag resolution
(`fvar` = flag 47), collection rejection, and offset/overlap checks. It never
decompresses the font data block and never touches glyph outlines.
Best-effort family/subfamily metadata comes only from the optional Extended
Metadata XML block via Node built-in `zlib` (capped at 1 MiB `metaOrigLength`);
absent/corrupt metadata yields empty inspection, not rejection.

Test fixtures are synthesised in-test
(`test/services/BrandingWoff2Inspector.test.ts`): valid static, valid
variable (`fvar`), malformed signature, truncated prefixes, 50 crafted
buffers, metadata mismatch extraction, and collection/flavor rejection. No
third-party font bytes, so no licence record is required.

## Consequences

- No `package.json`/lockfile change; exact-pinning policy untouched.
- Crafted-input failures are controlled `Woff2InspectError`s; the glyph-path
  DoS class cannot trigger (no outline parsing).
- Node 24/26 compatible (only `Buffer` + built-in `zlib`).
- `BrandingTypefaceService` (T03) must import this inspector and treat
  `isVariable === true` as rejection; metadata stays advisory (warnings, not
  validity).
