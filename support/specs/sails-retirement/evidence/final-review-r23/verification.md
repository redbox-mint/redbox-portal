# R23 documentation verification and limits

Incoming portal `f22474ec44b337fa6e75bc186ac0c09380990bfa`, final product
`9a2d72bd3433c807f0edece68be6d0f0e8ee7e55`, converted WSU
`80b2b80c036cbfd286d36ac9140beee2421d42d5`. Inheritance base:
`a49366803164429f9d8bdd249dadcdf856c9d13e`.

## Page and item accounting

`inventory.py` enumerates tracked wiki pages, the three specified root documents,
all five `*-v6.md` guides, every bundled skill including nested copies, every
AGENTS/CLAUDE file, active README files including the generated archetype template
and lowercase helper readme, and all five WSU Markdown files. There are no portal
`.claude/skills` or `.agents` trees. Historical specification/evidence READMEs and
legacy `support/docs` are outside the active-guide set; linked historical evidence
keeps its own original qualification. The protected GraphQL specification is
outside the requested surface.

The 133 pages comprise 77 wiki pages, three root documents, five v6 guides,
20 shipped skills, 23 other active READMEs and five WSU documents. Each complete
fenced/HTML sample is preserved. Every inline code reference and Markdown/HTML
link is retained; packages, class names, member expressions, object keys, paths
and commands within samples also receive addressable rows. A sample and its
constituent tokens are deliberately counted separately. Arbitrary English words
are not treated as API names. Full sample text remains the authority for dynamic
expressions, property names in unusual syntax and parameterized examples.

`incoming-ledger.json.gz` and `final-ledger.json.gz` contain the text, location,
page hash, classification, reason, verification sources and finding association
of every row. `page-settlement.md` is the per-page comparison. `classify.py`
reproduces the review's disposition rules; this is a review ledger, not an
algorithmic proof of every configuration or runtime claim. The rules distinguish
wrong instructions from v5 removal/before examples. The final wrong rows are
inherited B-17 entries, not hidden new-A waivers. Placeholder declarations,
object/DSL fragments, documented paths to create, package-relative paths and
prerequisite-dependent commands are classified by their stated use; existence
of an uncreated example filename is not required.

Names were checked against owned source, configuration schemas, package manifests
and command registries, with missing-path and symbol candidate lists retained in
the raw evidence. The source-symbol probe excludes standalone inspector source;
its `MetadataDiscoveryService` exists under `support/tools`. `FooService`,
`MyController`, `MyService` and `HistoricalRecordRepairService` name illustrative
classes, not claimed installed globals. Scoped package names containing `sails`
remain intentional neutral package identities. The npm script-name survey finds
only `test:*` (a documented wildcard) and the inspector's local `inspect` script
outside the root/package union; the latter exists in the inspector manifest.
The inherited nonmount-profile description is wrong even though its npm script
name exists.

## Actual executions

| Surface | Fresh verification | Limit |
| --- | --- | --- |
| Root author wiki | Full root tooling executes the exact shell block outside the portal: init, offline install, build, check, pack, actual compiled registration | Uses built qualified source packages, not historical registry packages; no publication |
| Initial migration and Services guides | Both exact shell blocks run in disposable directories, exit 0; migration flow installs offline, builds, checks and packs | This proves author commands, not a full institution deployment |
| README development | Actual documented block runs with npm replaced by a recorder that invokes real `docker compose config --quiet`; missing secret reproduces incoming failure | Configuration validation only; no daemon, image build or new startup claimed |
| Explicit AppConfig/provider configuration | Loads exact CommonJS examples with the current offline configuration loader | No AWS/provider credentials or service acquisition |
| Form registration | Compiles and invokes the guide's actual `registerRedboxExtension().forms` sample | The deliberately empty form has no user journey; production fields/workflows still require validation |
| Chronicle handler | Strict TypeScript compile and actual safe API-v2 error response | Fixture request/response, not an HTTP listener |
| Angular view helper | Real EJS render with actual PageArtifacts bundle hashing and page locals | Disposable bundle fixture, not an Angular rebuild |
| Dashboard preflight | Strict compile and actual pure converter with captured-input shape | Empty fixture, no database writes or claim of production dashboard decisions |
| Storage/PDF lifecycle | Loads actual storage neutral registration; checks current lifecycle guidance against owned source | R20/R22 runtime qualification remains historical; no new native PDF run |
| Figshare crosswalk | Strict compile, real binding implementation and supplied resolver execution | No remote Figshare effect |
| Configuration conversion helper | Node syntax check and actual CJS/ESM selected-file load, using the actual application example and private fixture environment values; asserts final-layer port precedence | Offline only; no Mongo connections |
| Generated docs | `npm run docs:test`: 4 pass; `npm run docs:audit`: exit 0, 43 surfaces/524 advisory findings; core `tsc --noEmit`: exit 0 | Advisory findings are recorded, not asserted all repaired |
| All shipped guidance regressions | 10 fail/0 pass against pinned incoming documents; final full tooling: 49 pass/0 fail/0 skip | Test counts are nested, not summed as extra root suites |
| Dev-tools | Complete build/test: 60 pass, including its 1,271 resolver comparisons | R20's separate 25,000-shape and migration differential settlements were not re-opened or claimed fresh |

`verify-examples.py` separately checks all 85 shell blocks and 20 apparently
complete CommonJS blocks: 105 checks, 102 syntax successes. The three diagnostics
are literal `<shell>`, literal `https://<portal-host>` and the inherited combined
server-validation module/object fragment. The first two require the documented
parameter substitution. The third is B-17 and also fails at the feature base.
Other JavaScript/TypeScript/EJS/JSON/HTTP samples are preserved in the ledger;
partial object fragments, Angular class fragments, request transcripts and
pseudo-config are not represented as standalone compilable programs. Main
complete author/handler/config samples have the additional executions above.

Commands that require credentials, production paths, external services, an image
build, Git publication or destructive migration/recovery were inspected against
the actual implementation and retained R20-R22 tables. They were not blindly
executed. No production provider, CircleCI machine, registry, arm64 or full
upgrade/recovery acceptance is added by this documentation round.

## Failed setup attempts retained

The first tooling run has 48 passes/one failure because the new loader test
supplied only a secret and omitted its required session fields. The accepted
test now loads the actual application example and passes. An accidental
`npm run test:tooling` invocation refuses because that alias does not exist;
the actual full command is `node --test test/tooling/*.test.cjs`.

The first generated-doc audit and core typecheck encounter incompatible root
Express-4 and core Express-5 type trees because core-local developer dependencies
were absent. The documented `npm install --include=dev --no-save --ignore-scripts
--strict-peer-deps --prefix packages/redbox-core` supplies those local dependencies
without changing tracked manifests/locks. Both final checks pass. These setup
failures are retained, not counted as product findings or successful executions.

## Remaining delta and cleanup

The fresh source inventory at the product commit has 1,198 candidate files and
zero unclassified. AST/dependency closure checks 1,227 files and reports zero
executable violations/forbidden entries. Reconciliation accounts for all 1,261
baseline files and every added candidate. These structural results complement
manual inspection of extension binding, configuration ownership, request/auth/
CSRF/page adapters, upload ownership, persistence/queue lifecycle, installed
entrypoints and WSU composition; they do not prove arbitrary application behavior.

Core runtime, host executable and dependency contracts have no non-Markdown
changes since fully tested R20 `5786b7e77`. WSU is unchanged since its incoming
R22-qualified `80b2b80`. No additional concrete failing runtime case was found.
R20's full suites and R21/R22 export/migration/HTTP/clean-clone/entrypoint tables
remain explicitly historical results for their qualified scope. No core runtime
was modified, so the requested condition for repeating full suites is not met.

All author/compiler/config/syntax replay directories are removed in finally/
context-manager cleanup. The two early `/tmp/r23-*.txt` candidate files and
Python bytecode scratch directory are removed. No Docker resource was created;
Compose was used only for offline configuration validation. Raw review artifacts
under `.tmp/sails-retirement/final-review-r23/` remain as hashed evidence.
All 13 checkout safeguards, including the 12 protected originals/siblings and
the clean converted WSU worktree, exactly match their initial status, tracked
binary-diff hash and every untracked-file hash. The original WSU checkout and
GraphQL specification were not written. No push, publish or tag occurred.
