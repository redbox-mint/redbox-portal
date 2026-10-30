# Production asset artifact verification

On a native ARM64 shared host, the producer and consumer were exercised at
revision `dd0aecdc0c1c8272421774a351191273dfb69f31`, with Node 24.22.1 and
npm 11.19.1. The checkout's tracked and untracked status was initially clean;
no pre-build inventory of ignored files was retained. Logs show dependency
installation and output clearing. An existing npm download cache and installed
Node were retained, so this was not an empty-cache experiment.

Production generation completed in 1,751.788 seconds under reduced scheduling
priority on a shared host. It included both Angular libraries, all 19
applications, and webpack. Consumer verification took 23.755 seconds and
restoration took 24.999 seconds. These local measurements do not establish CI
performance or a representative speedup.

The artifact contained 581 asset files and two metadata files. All 583 restored
entries matched their respective producer bytes, sizes and hashes. The restored
payload repacked to the identical 22,248,047-byte archive. The production
validator passed on both payloads. The archive SHA-256 was
`d29a6ebebf37e8aae7b2fa2e580fc2bd9597291496df91fe567ea8f2a3baf2f4`.
The final contract test runs passed 122 asset tests and 94 integration contract
tests. An initial asset test run failed because it inherited a worker setting
assumed to differ by a test. The successful rerun used `NG_BUILD_MAX_WORKERS=2`
on the unchanged tested revision; the separately verified test fix landed in
`8c8672b95`. An initial consumer
attempt with an empty checksum failed closed, followed by successful verification
and restoration with the trusted receipt checksum.

An independent audit checked source files against the commit, artifact and
restoration hashes, inventories, timings, and the documented failures. This
evidence covers same-host artifact production and restoration. It does not
establish independent-build reproducibility, AMD64 consumption, image startup,
browser or integration-suite acceptance, CircleCI transfer costs, or API
documentation completeness. Full logs and raw artifacts were retained locally
under `/tmp/redbox-web-assets-dd0aecdc0-zsw601el` and may be ephemeral.
