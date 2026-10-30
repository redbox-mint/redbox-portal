# Matched Mocha baseline for the chore pilot

`test-mocha-baseline` runs alongside the existing candidate `test-mocha`, only
in the automatic `build_test_gendocs_and_deploy` workflow on the exact branch
`chore/circleci-performance`, without a tag and with both publication modes
`none`. It retains all seven host compilation commands in their original order.
Similar branch names, production/support/feature branches, Dependabot, tags,
npm beta and manual Docker publication cannot schedule this baseline.

This is a **non-gating pilot**: no job requires the baseline. The required
`test-mocha` status, validation dependencies, production/release/manual workflows
and publication filters remain in place. Baseline test, compilation, timeout,
normalization or evidence failures produce a failed baseline job; they are not
masked or converted to success. A baseline failure can make the chore workflow
red without becoming a dependency of validation or publication. Do not add this
pilot status to required branch-protection checks.

Both jobs require the same existing `build` invocation, check out the pipeline
revision, attach the same workspace and load
`/tmp/docker-images/test/redbox-portal-test.tar` as `redbox-portal:test`. There is
no second build, moving image pull or alternate Compose configuration. Machine,
resource class, Node setup, host npm installation/cache, Codecov installation,
test-directory preparation, suite command, timeouts, cleanup/exit handling and
JUnit test-result storage match the original Mocha job. The candidate omits the
seven host compiles; the baseline retains them.

The baseline runs the identical existing `prepare-report.cjs` normalization with
`when: always`. Its normalized report is retained without a second Codecov
upload, so it cannot overwrite or combine with the candidate's `backend-mocha`
coverage publication. Candidate normalization, upload and upload-failure behavior
stay unchanged. The baseline has no publishing command.

| Evidence | Candidate artifact destination | Baseline artifact destination |
| --- | --- | --- |
| Normalized LCOV | `ci-mocha-pilot/mocha/lcov.info` (existing) | `ci-mocha-baseline/baseline/lcov.info` |
| JUnit XML directory | `ci-mocha-baseline/candidate/junit` | `ci-mocha-baseline/baseline/junit` |
| `identity.json` | `ci-mocha-baseline/candidate/identity` | `ci-mocha-baseline/baseline/identity` |

The XML file is `backend-mocha.xml`. Both jobs also keep their normal CircleCI
test-results storage. Candidate evidence uses guarded workflow `post-steps`,
leaving the existing pilot's pinned job definition and contracts intact. All
three existing Mocha invocations reference the same guarded post-steps so
CircleCI preserves the reused `test-mocha` name rather than creating suffixed
job/status names. The branch/tag/mode guard prevents evidence collection outside
the exact chore cohort; Dependabot and release scheduling remain unchanged.
Artifact storage and the evidence commands run after earlier failures; evidence
commands use `when: always`. Missing or empty LCOV/JUnit, a checkout differing
from `CIRCLE_SHA1`, an unexpected image tag or failed image inspection causes an
evidence-step failure. A retained LCOV file is valid normalized evidence only if
the corresponding normalization step succeeded. Reports from failed test runs
are diagnostic evidence, not acceptance evidence.

Before comparing results, require matching `workflow_id`, `revision`,
`source_tree`, `image_archive_sha256`, `image_id`, `rbportal_image`, Node/npm and
Compose versions, and every configuration/source-input checksum in `files`.
Role and job number differ intentionally; LCOV/JUnit checksums identify the
reports and may differ. Archive hashing streams the shared archive rather than
loading it into memory. No environment dump or secrets are retained.

Then compare full JUnit test identities, totals, failures/errors and skips, and
LCOV source identities, line/function/branch scopes and covered identities. A
green job or equal test counts alone do not establish coverage equivalence.
Missing artifacts or mismatched identities invalidate the matched comparison.
This change supplies new evidence; it does not claim a completed runtime
comparison or recover reports from older workflows.

Run the focused checks from the repository root with installed dependencies,
Docker Compose v2 and the CircleCI CLI:

```bash
node --test support/build/ci-mocha-baseline.test.cjs support/build/ci-mocha-pilot.test.cjs support/build/circleci-config.test.cjs support/build/ci-performance.test.cjs support/build/ci-arm64-pilot.test.cjs
node support/build/ci-mocha-baseline.validate.cjs
node support/build/ci-mocha-pilot.validate.cjs
```

The baseline validator compiles 17 pairs of complete configs covering exact and
lookalike branches, other branches, release/RC tags, chore-plus-tag and every
publication-mode combination. It verifies the exact scheduling filters,
candidate evidence guard and absence of any other processed graph change.
Generated fixtures/expansions are retained in its printed `/tmp` directory.
To prove source-config scope against a saved pre-baseline config, pass that file
as its optional argument. CircleCI compilation resolves public orbs read-only;
these commands neither run the integration suite nor publish anything.

Rollback removes `test-mocha-baseline`, its sole workflow invocation and the
shared guarded Mocha workflow `post-steps`. The original host-compilation removal
pilot and its existing LCOV artifacts remain intact.
