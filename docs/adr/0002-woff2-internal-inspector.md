# ADR 0002 — Isolated WOFF2 decoding and structural inspection

Status: accepted; supersedes the container-only decision of 2026-09-04
Date: 2026-09-05

The original container-only inspector accepted empty compressed payloads and
synthetic filler fixtures which Chrome rejected. That decision did not satisfy
the design's structural decoding gate. Container validation alone is insufficient.

Use exactly pinned `wawoff2@2.0.1` (MIT), the WebAssembly build of Google's
WOFF2 decoder, following the internal header/directory checks. Decode the actual
Brotli stream and WOFF2 transforms, then check the reconstructed sfnt directory,
required tables, head magic, and presence of outlines. Reject errors closed before
storage. Keep original uploaded bytes; decoded output is validation-only.

Run each decoder in a disposable worker, with no inherited runtime preload hooks,
a two-second wall-clock deadline, a 32 MiB V8 old heap, an 8 MiB young heap and
a 64 MiB WebAssembly memory budget. The pinned Emscripten build grows its exported
linear memory via the JS `Memory.grow` method; cap that method within the worker
before loading the decoder. At most two decoders run per process; excess work
fails closed without accumulating a waiting queue. These are execution-resource
budgets, not a configurable decompressed-font-size policy. Revisit the memory
bound when changing the pinned decoder build. This avoids synchronous untrusted
decoding on the application event loop and bounds crafted-input resource use.

The decoder is not a browser's complete OpenType sanitizer. Required sfnt tables
and WOFF2 decoding are validated; browser load tests remain a distinct acceptance
gate. Variable fonts are genuinely decoded before `fvar` rejection. Within the same worker, extract weight from OS/2.usWeightClass and slope from
OS/2.fsSelection plus head.macStyle. Extract bounded Unicode name records,
preferring typographic family/subfamily IDs 16/17 over IDs 1/2. Scan at most
512 records and decode at most 512 bytes per name, retaining at most 256 characters.
Standard sfnt metadata takes precedence over advisory XML fallback. Compare both
weight and style with the selected slot; mismatches warn without changing the slot.
Metadata XML remains advisory with bounded Brotli output and bounded matching.
See the [OpenType name specification](https://learn.microsoft.com/en-us/typography/opentype/spec/name)
and [OS/2 specification](https://learn.microsoft.com/en-us/typography/opentype/spec/os2).

Replace synthetic successful-upload fixtures with Fontsource Roboto 5.3.0 static
and variable WOFF2 files, with SIL OFL licensing and provenance in
`test/resources/fonts/README.md`. Chrome tests must check successful `FontFace.load`
and rendered text metrics, not merely computed family names. Corrupt and empty
payloads remain rejection fixtures.

Sources: [decoder](https://github.com/fontello/wawoff2),
[decoder build settings](https://github.com/fontello/wawoff2/blob/master/src/Makefile),
[WOFF2 compressed-data requirements](https://www.w3.org/TR/WOFF2/#compressedDataFormat).
