# Authentication and CSRF migration

## SR-038 — Authentication and session migration

Source continuation: `0930aa8d2` (browser form reads); vocabulary creation typing
follow-up `96698fe1e` makes repository-allocated entry IDs optional in the input.
Authentication implementation SHA is recorded in the subsequent closeout. All
commands run on this Linux checkout, branch `stack/sails-retirement`, without a
Sails instance, public legacy-controller dispatch, or production host promotion.

### Contract and upgrade behavior

`authentication/Accounts.ts` owns the existing account/profile/hook operations;
`UsersService` delegates through `compat/sails/authentication.ts`. There is one
implementation. Named hook resolution is explicit in standalone construction;
legacy expression evaluation remains confined to the comparison adapter. Profile
writes and post hooks settle before authentication succeeds. Hooks cannot replace
the authenticated account ID/username. Existing account types/memberships remain
authoritative; external provisioning applies the existing email allowlist. Public
login/info responses retain credential-safe repository profiles and populated-role
shape; internal policy actors remain bounded immutable snapshots.

`identityProviders.ts` installs per-application local, signed AAF JWT and OIDC
strategies. OIDC uses awaited native `openid-client` imports/discovery and the
library's PKCE/session state; discovery failure prevents readiness. Its terminal
Passport callbacks retain asynchronous provider work after transport termination.
AAF explicitly supplies the issuer to Passport-JWT's top-level option: that library
overrides the nested `jsonWebTokenOptions.issuer`, which previously allowed the
configured issuer check to be ineffective. Signed wrong-issuer assertions are denied.
There is no bearer-header-derived CSRF exemption on provider callbacks.

`login.ts` preserves local login's JSON/redirect success and incorrect-credential
contract, browser info URLs and provider callback URLs. It validates scalar inputs,
brand/portal context and effective brand memberships. OIDC callback context comes
from the state-bearing session. Redirect destinations must stay under the configured
root; IdP logout origins must be configured, never taken from request authority.
Operational failures are sanitized; rejected providers receive a stable 403.

Use a new cookie name **`redbox.v6.sid`** (legacy default: `redbox.sid`) with a
fresh secret and preferably a distinct session collection. The middleware also
regenerates authenticated sessions missing `authenticationVersion: 6`, even if an
operator reuses the old cookie/store. Passport rotates session IDs at login; only
validated brand/portal and configured logout facts survive. No serialized user,
credentials, CSRF token or OAuth handshake credentials are copied. A mandatory
audit/final-save failure destroys a partly persisted login. Logout audits, removes
Passport authentication, destroys the session and expires the configured cookie.
Clients must obtain a fresh session/token after login or logout; sockets must
reauthenticate/reconnect under SR-043 rather than reuse v5 serialization.

**Intentional HTTP changes (design §1.3):** logout is now protected **POST** at the
same branded path; legacy GET returns **405** with `Allow: POST`. Existing templates
are coordinated in SR-039. Scripted callers must first obtain `/csrfToken` and
submit its token with their session. Provider denial/debug behavior no longer puts
raw provider errors/tokens into session data; clients receive a safe 403 instead of
an error-dependent home redirect/server-error rendering. Local malformed inputs
return 400. Login/info profiles never expose passwords/API-token material.

**Upload state policy:** no transfer/binary datastore is cleared by authentication
or forced login. The real-Mongo rotation test preserves a persisted transfer-state
sentinel, which proves only that authentication does not delete external state.
Companion's session `grant` is an OAuth handshake credential, not the durable tus/
byte-store offset. It is deliberately discarded on forced login/identity change;
restart an interrupted provider authorization after authenticating. Do not bulk
copy `grant` or another actor's upload credentials into a rotated session. SR-042
must qualify actual provider reconnect/resume/ownership before rollout; no existing
upload provider is claimed qualified by the sentinel test. Operators retain upload
stores and metadata during the maintenance window; unresolved in-flight provider
handshakes need reconciliation before promotion.

### Executed environment and tests

Node **26.11.1**, npm **11.20.0**, TypeScript **5.9.3**, Mocha **11.7.6**,
ts-node **10.9.2**, Express **5.2.1**, Passport **0.7.0**, openid-client **6.8.8**,
Passport-JWT **4.0.1**, express-session **1.19.0**, connect-mongo **6.0.0**,
Mongo driver **7.7.0**, Bruno **3.5.2**, Prisma ORM **8.0.0-rc.19** / CLI
**8.0.0-rc.24**. No authentication dependency versions changed.

Mongo **8.0.34**, owned disposable container `sr-p5-mongo8`, ID
`22087fb1ca2c22efb5f31077e462f3631120a66b4517b00c8393b552aa75f3e4`, loopback
34903. Each fixture creates/drops its own database. Keycloak uses the existing
`docker-compose.bruno.oidc.yml` service/realm/users with a task-owned ports override:

```yaml
services:
  keycloak:
    ports: ['127.0.0.1:18080:8080']
    environment:
      KC_HOSTNAME: http://127.0.0.1:18080
      JAVA_OPTS_KC_HEAP: '-Xms128m -Xmx512m'
```

Actual image: Keycloak **26.5.6**,
`quay.io/keycloak/keycloak:26.5.6@sha256:8d44614c74798322c4e07fbe0ecb15cfbb5879d69b484628555f58ade06f0d8c`.
Only that service was started, project `sr-p6-auth`; no full Sails portal was used.
The repository's synthetic client/user fixtures were used without copying secrets
into evidence. Standalone OIDC binds loopback 1500, using the registered localhost
callback. The local/AAF fixture uses an ephemeral port and `/portal` root.

```sh
export PATH="$PWD/.tmp/sails-retirement/toolchain/node-v26.11.1-linux-x64/bin:$PATH"
docker compose -p sr-p6-auth \
  -f support/integration-testing/docker-compose.bruno.oidc.yml \
  -f .tmp/sails-retirement/keycloak-ports.yml up -d keycloak
npm --prefix packages/redbox-core run build
# Source-only follow-up after preserving the public profile shape:
./packages/redbox-core/node_modules/.bin/tsc -p packages/redbox-core/tsconfig.json
npm --prefix packages/redbox-core run typecheck:application
HTTP_PILOT_TEST_MONGO_URL=mongodb://127.0.0.1:34903/sr_p4_http \
OIDC_TEST_ISSUER=http://127.0.0.1:18080/realms/redbox \
  npm --prefix packages/redbox-core run test:http-auth:mongo
npm --prefix packages/redbox-core test -- --no-config \
  --node-option no-experimental-strip-types \
  --require ts-node/register/transpile-only --require chai --require test/setup.ts \
  --timeout 10000 test/services/UsersService.test.ts test/controllers/UserController.test.ts
npm run lint
```

Intermediate executed results: local/AAF **11 passing**; OIDC **3 passing**,
including **four existing Bruno requests, 4/4 tests**, zero skips/failures.
Existing UsersService/UserController regression **92 passing**, zero pending/failures.
Final-source qualification is recorded below. The authentication-only local fixture
supplies an explicit no-op CSRF policy; it does not qualify CSRF or P5 mutations.
The replacement policy is tested separately under SR-039.

Meaningful negatives include wrong credentials/provider/state/session/signature/
issuer/expiry/email/brand; malformed credentials; disabled/linked/orphan/cyclic
accounts; old signed session invalidation; login fixation rotation; role refresh;
logout invalidation; required audit failure; hook identity mutation; root redirects;
secure cookie under an explicitly trusted HTTPS proxy; and accepted login work
retained across client abort and failed stop/retry.

Initial auth fixture runs failed because the fixture wrote undeclared audit fields
and created an alias without required profile fields. Those fixture errors were
corrected to the existing repository contract. The wrong-issuer test exposed the
real Passport-JWT configuration defect fixed above. Initial compilation found a
legacy config boundary needing explicit optional/default normalization; lint found
an obsolete Buffer declaration, removed. No assertions were weakened.

**Provider coverage limits:** AAF is exercised with real HMAC-signed JWT assertions
through Passport-JWT and persisted provisioning, not a live AAF federation. OIDC uses
real Keycloak discovery/authorization/token endpoints, PKCE/state, local accounts,
audit and the existing Bruno protocol flow; other institutional IdPs, multi-provider
UI selection, institution reverse-proxy TLS termination and RP logout confirmation
are not qualified. Bearer negative/current-role/brand behavior remains covered by
the Mongo pilot suite. General login/page rendering is SR-040; inventory assignment
of `UserController.login` is corrected to that task. No SR-040 page is implemented.

### SR-038 final qualification

Current-source production TypeScript emission **exit 0** after the complete Prisma
build; strict application source/tests typecheck **exit 0**. Final standalone
Mongo/provider suite **14 passing, zero pending/failures**, including the existing
Bruno **4 requests / 4 tests**, zero skips. Final existing auth regression **92
passing, zero pending/failures**. Lint **951 files, zero errors/warnings**.
Logs: `p6-auth-qualification-{build,http,regression,lint}.log` and
`p6-auth-typecheck8.log`. The final profile-shape assertions and delegated legacy
bearer implementation are included. Early strict fixture typing problems were
fixed with real branded RoleModel fixtures and narrower Passport method inputs;
no assertions/casts mask a provider failure. Offline inventory generation/check
pass: 332 legacy declarations, **51 standalone / 281 remaining**, plus the new
POST logout successor in `additions`. All eight non-rendering SR-038 declarations
are accounted for. The login page is deliberately reassigned to SR-040.
