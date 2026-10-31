# Combined test-image build experiment

CircleCI pipeline 13604 tested revision `8a524ba154991e8655131482712a80ac431b0e78`
on native ARM64 `arm.medium` machines. Both variants built the `test` target
with BuildKit layer caching disabled and loaded it into Docker. The candidate
ran the root production installation in parallel with web assets, kept the
published development overlay, mounted npm's download cache and limited Angular
to two workers. It avoided making runtime depend on creating the test snapshot;
the test target still creates that snapshot. The second build reused each job's
builder and forced build steps to rerun. The candidate could reuse npm downloads;
the control had no npm cache mount.

| Build | Control | Candidate | Difference |
| --- | ---: | ---: | ---: |
| Cold | 17m 58s | 16m 05s | 1m 53s faster |
| Forced rebuild | 19m 19s | 17m 57s | 1m 22s faster |

Both jobs completed successfully. For both builds, the captured image contracts
had equal root dependencies, equal recursive dependency graph nodes and equal
inventoried application files. The two warm builds each reported three cached
BuildKit operations despite `--no-cache`; the timing therefore should not be
interpreted as proof of zero BuildKit cache hits. Full dependency implementation
bytes, otherwise unreachable packages, runtime and PDF targets, AMD64, live
integration behavior, coverage and CI cost were not compared. This one pair is
not evidence that the 12-minute complete-check target has been achieved. Normal
workflows also ran in the pipeline, so scheduling and shared capacity can affect
these timings.

Control and candidate contract and timing artifacts are retained by CircleCI.
Selected copies are in `/tmp/redbox-combined-pilot-results/`. The original pilot
uploaded its empty Docker configuration directory with the timing artifacts; a
Buildx-generated ephemeral token seed was present there. The job's dedicated
builder was removed, and the pilot script now keeps this directory outside the
uploaded artifact tree and removes it during cleanup. No project or registry
credentials were placed in that directory.
