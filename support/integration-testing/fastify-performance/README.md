# Performance qualification

The FM-007 baseline image and reports are immutable historical evidence. FM-043 retires the source freezer and first-party Express owner; do not regenerate that baseline from this checkout.

`sample.cjs` accepts an immutable image ID through `FM007_IMAGE`, disposable state through `FM007_STATE`, a protocol cell ID and an output directory. It starts the supplied image using its own entrypoint. Source mounts and runtime host selection are retired. Use the candidate image produced by the release qualification workflow for new measurements.

The protocol, clients, state controls and statistical comparisons remain available alongside the recorded FM-007 evidence.
