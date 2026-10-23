# SR-003 — Released-v5 reference and sanitized upgrade fixtures

## Artifact, runtime and provenance

Reference: released **v5.0.4**, tag commit
`c1dda53999f3b026347008731f33dba834e06c27` (2026-10-13), not the intermediate
Sails-plus-Prisma retirement branch. The actual published image was downloaded
and run without mounting the current application source:

- `qcifengineering/redbox-portal:v5.0.4` registry index:
  `sha256:30471ce55d64db63fa90abad29496cb291ed750846164a3bcf1229760d8cba0f`.
- Tested Linux amd64 manifest:
  `sha256:9bf944d09e370e3fc65612f2df40286431095d216c8a22bd4c34a939a12485f9`.
- Actual portal **Node 24.16.0 / npm 11.13.0 / root Sails 1.5.17**, matching the
  released tag's `.nvmrc`/Dockerfile runtime. Its package strings remain root
  `2.1.0`, core `0.0.1-beta.9022`; use the image/tag SHA for provenance.
- Image `app.js` and `git show v5.0.4:app.js` both SHA-256
  `16074a6712652c14f6e48fe6b395c868e81920ec6fa9f21c7e56f27a59217938`.
- Disposable MongoDB **7.0.43 / FCV 7.0**, standalone; Solr **10.0.0**. These
  are the released comparison's dependencies, not the v6 Node/Mongo requirement.
- Existing Bruno CLI **3.5.2**, installed from the released collection's lockfile
  on Node 24.16.0/npm 11.13.0. Browser driver **Playwright 1.64.0** runs in the
  new Node 26 worker; the portal being tested still runs its released Node 24.

Only repository-shipped synthetic bootstrap data and selected public test inputs
were used. No real institution configuration, user data or secrets were loaded.

## Commands and comparison setup actually used

```sh
git rev-parse v5.0.4^{}
git show v5.0.4:.nvmrc
git show v5.0.4:Dockerfile
docker manifest inspect qcifengineering/redbox-portal:v5.0.4
docker buildx imagetools inspect qcifengineering/redbox-portal:v5.0.4
docker pull qcifengineering/redbox-portal@sha256:9bf944d09e370e3fc65612f2df40286431095d216c8a22bd4c34a939a12485f9
mkdir -p .tmp/sails-retirement/v5-fixtures
git archive v5.0.4 test/bruno test/playwright | tar -x -C .tmp/sails-retirement/v5-fixtures
git show v5.0.4:playwright.config.ts > .tmp/sails-retirement/v5-fixtures/playwright.config.ts
docker network create sr-p0-baseline
docker run -d --name sr-p0-mongo7 --network sr-p0-baseline --network-alias mongodb --memory=1024m mongo:7.0.43-jammy --bind_ip_all --wiredTigerCacheSizeGB 0.25
docker run -d --name sr-p0-solr --network sr-p0-baseline --network-alias solr --memory=1024m solr:10.0.0 solr-precreate redbox /opt/solr/server/solr/configsets/_default
```

`docker inspect sr-p0-solr --format '{{json .Config.Cmd}}'` confirmed the Solr
arguments above: `["solr-precreate","redbox","/opt/solr/server/solr/configsets/_default"]`.

An initial v5 start used environment inputs for local auth and warning-level
logging. It never reached public readiness during the observed roughly seven
minutes and logged a **30,000 ms RVA bootstrap timeout** plus Sails unexecuted
query warnings (`logs/v5-first-start.log`). It was stopped before retry. The
retry mounted the explicit synthetic `v5-local.cjs` as `config/local.js`, using a
real local-auth array, disabled RVA/Figshare bootstrap imports and cron, and info
logging. It reused only the disposable v5 data written by that same artifact;
this is not a claim of pristine fresh-start qualification.

```sh
docker run -d --name sr-p0-v5 --network sr-p0-baseline --network-alias redboxportal -p 127.0.0.1:18504:1500 --memory=1536m -v "$PWD/support/specs/sails-retirement/evidence/v5-local.cjs:/opt/redbox-portal/config/local.js:ro" -e NODE_ENV=integrationtest -e PORT=1500 -e LOAD_DEFAULT_FORMS=true -e sails_security__csrf=false -e sails_brandingConfigurationDefaults__auth__local__default__token=d077835a-696b-4728-85cf-3ffd57152b1e qcifengineering/redbox-portal@sha256:9bf944d09e370e3fc65612f2df40286431095d216c8a22bd4c34a939a12485f9
curl -fsS --max-time 5 -o /tmp/sails-retirement-v5-home.html -w '%{http_code}\n' http://127.0.0.1:18504/default/rdmp/home
```

The retry lifted at `2026-10-23T09:08:43Z`; home returned **200**. This runs
released Sails/Waterline behavior. Current Prisma and the future Express host
must be compared as separate artifacts/runs.

## Selected existing API/browser results

From the archived `test/bruno` directory, the following command ran unedited
released requests. The first CLI attempt used an incorrect path from that working
directory and exited 127 before making any requests; the corrected command below
completed with exit **0**:

```sh
PATH="/home/andrew/.nvm/versions/node/v24.16.0/bin:$PATH" ./node_modules/.bin/bru run '1 - REST API/1 - Record Management/Create RDMP.bru' '1 - REST API/1 - Record Management/Get RDMP-s Metadata.bru' '1 - REST API/1 - Record Management/Create Temporary Datapub.bru' '1 - REST API/1 - Record Management/Transition Workflow of Data publication.bru' '1 - REST API/4 - Form Management/List Forms.bru' '1 - REST API/4 - Form Management/Get Form.bru' '1 - REST API/5 - Record Type Management/List Record Types.bru' '1 - REST API/5 - Record Type Management/Get Record Type.bru' '2 - AJAX calls/1 - Admin User Tests/Login via Internal authentication.bru' '2 - AJAX calls/1 - Admin User Tests/Get all Record Types Info.bru' '2 - AJAX calls/1 - Admin User Tests/Get DataRecord Type info.bru' '2 - AJAX calls/1 - Admin User Tests/Get DataPublication Workflow Steps.bru' --env int-test --env-var host=http://127.0.0.1:18504 --reporter-skip-all-headers --reporter-json /tmp/sails-retirement-v5-bruno-results.json
```

**12 requests passed, 24/24 tests, 0 failed/error/skipped requests.** The sanitized
`released-v5-api-results.json` records each source filename/hash, URL, method,
actual status and existing assertion results. `logs/v5-bruno.log` retains the
console summary with the synthetic session cookie redacted. Public behavior
observed includes record create **201**, metadata read **200**, workflow transition
**200** with `success: true`, form list/get **200**, local admin login **200**,
record-type AJAX list/get **200** with `dataRecord` package type, and five
data-publication workflow steps. Default/demo-hook definitions were actually
loaded (nine persisted forms, five record types).

**Released fixture defect:** the two requests under `5 - Record Type Management`
actually call `/api/forms` and `/api/forms/get`, not `/api/recordtypes`. Their
passing results are counted as forms coverage. The real AJAX record-type cases
are separate. SR-030 must exercise both exact API pilot URLs and must not inherit
this mislabeled-coverage assumption.

Browser command from the repository root:

```sh
docker run --name sr-p0-v5-browser --network host --ipc host --user "$(id -u):$(id -g)" -e CI=true -e PLAYWRIGHT_BASE_URL=http://127.0.0.1:18504 -e PLAYWRIGHT_BROWSERS_PATH=/ms-playwright -v "$PWD:$PWD" -w "$PWD/.tmp/sails-retirement/v5-fixtures" --entrypoint node redbox-portal:playwright-node26 "$PWD/node_modules/@playwright/test/cli.js" test --config playwright.config.ts --workers=1 --retries=0 --grep 'renders /default/rdmp/(home|user/login|admin)$' --reporter=json
```

Exit **0**; **3 expected/passed, 0 skipped, 0 unexpected, 0 flaky**, one worker,
zero retries (`released-v5-browser-results.json`). This reuses the released home,
local-auth page and authenticated admin smoke cases and its login/global setup.
The temporary browser storage state was removed after the run; cookies, headers
and credentials are absent from the committed result summary.

## Sanitized upgrade-data reference

After requests/browser work finished, `docker stop --timeout 60 sr-p0-v5` returned
success, and the portal process exited **0**. Only then was the fixture captured:

```sh
docker exec -i sr-p0-mongo7 mongosh --quiet --file /dev/stdin < support/specs/sails-retirement/evidence/capture-v5-fixture.js > support/specs/sails-retirement/evidence/released-v5-upgrade-fixture.json
python3 support/specs/sails-retirement/evidence/verify-v5-fixture.py
```

The first capture omitted `--file /dev/stdin` and produced interactive prompts,
which JSON validation rejected; it was replaced by the successful script-mode
capture above. The committed file is valid JSON, not placeholder proof.

Actual capture: **123 documents across 13 allow-listed collections**: branding,
four roles/one user/four membership links, five record types, nine workflow steps,
nine forms, 78 path rules, three dashboard types, one workspace type, two records,
four record audits and two integration audits. BSON IDs/dates retain extended-JSON
representation. Two credential fields were removed and 52 email values replaced
with `synthetic@example.invalid`. Validation passes membership, brand, record-type
and workflow/form reference checks; **zero credential keys remain**. See
`released-v5-fixture-validation.json` for exact counts.

This is a logical upgrade fixture. Consumers must explicitly seed test-only
credentials; it is **not a complete restorable checkpoint**. Sessions, queue/job
state, vocabulary/search data, binaries and unrelated collections are excluded.
The full consistent institution backup/recovery rehearsal belongs to SR-049.

## Limits and follow-up ownership

- Browser CSRF was explicitly disabled, matching the selected released collection.
  These results do not prove CSRF rejection/session binding (SR-039).
- OIDC, AAF, disabled/linked-account scenarios, remote publishers and upload/socket
  behavior were not run in this selection; broader supported-flow parity remains
  SR-038/SR-041–SR-046. There were **zero conditional skips inside the selected
  cases**; unselected coverage is stated here instead of counted as passing.
- The data-publication create triggered the released publisher's
  **`DOI connection password must not be empty`** error, preserved in
  `logs/v5-start-stop.log` and the synthetic integration audits. HTTP cases passed;
  remote publishing did not succeed and is not claimed. No real DOI credential
  was requested or used.
- No real institution hook/configuration/topology or supported institution upgrade
  source was designated. SR-005 remains open for that cohort decision. Selecting
  this released reference does not designate it as every institution's production
  upgrade artifact or qualify a v6 upgrade.

SR-003 conclusion: the requested representative released behavior and sanitized
fixtures have been captured and identified, with actual results and limitations.
