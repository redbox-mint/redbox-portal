**Confirmed: introduced A/P2 CI failure**, separate from the missing build argument.

- At `14ab99e`, core/core-types/dev-tools use exact registry versions; their lock entries resolve to npm tarballs.
- Converted [package.json:36](/home/andrew/src/bitbucket/redbox-hook-wsu-v6/package.json:36) and lockfile instead require `../../github/redbox-portal/...`.
- [CircleCI:9](/home/andrew/src/bitbucket/redbox-hook-wsu-v6/.circleci/config.yml:9) checks out only WSU, installs on the host, then compiles. Without that sibling checkout, the dev-tools executable is unavailable. Whether `npm ci` rejects the missing links or creates dangling links, compilation cannot run.
- Docker’s dependency-path rewrite happens later and cannot repair this preceding host step.

This violates SR-053’s “aligned build/Docker/Compose/CI and maintenance scripts” ([tasks.md:895](/home/andrew/src/github/redbox-portal/support/specs/sails-retirement/tasks.md:895)).

Moving unit work into the qualified builder and removing redundant host install/compile steps from deployment jobs addresses this mechanism.

Evidence: read-only `git show` comparisons and parsed baseline/current lock entries. I did not run an isolated install, suites, Docker, or modify files.
