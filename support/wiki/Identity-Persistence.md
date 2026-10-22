# Identity and membership persistence

Prisma is the sole owner. Remove all backend selectors and model registrations. See [persistence migration](Persistence-Migration.md).

The six physical collections are user, role, userlink, useraudit, pathrule and
workspaceapp in logical mongodb. The User/Role relationship uses the fixed
`role_users__user_roles` collection with ObjectId `_id`, `user_roles` and
`role_users`. No arrays, timestamps on edges, pair uniqueness, cascade or new
login/email uniqueness are introduced. Existing indexes and collation remain
unchanged. Index preparation inspects seven built-in `_id` scopes without U DDL.
An empty collection is ready to be created by its first model insert.

Use the plain `getIdentityRepositories()` operations after awaiting
`initializeIdentityPersistence()`. Public account DTOs omit credential fields;
`hasApiKey` reports configured-key presence without exposing its value. Password
verification and hashed API-key lookup stay inside the boundary. Account creates
hash supplied passwords with bcrypt cost 10; updates preserve the existing
service-owned hashing rule. Missing optional fields read as null; patches write
only supplied fields. Real institution fields must be declared in the contract.
Port institution callbacks into services/repositories and declare extension fields in the Prisma contract; old registrations block startup.

Repeated membership adds append physical edges; population returns the target
set and hides dangling targets. Remove clears every matching edge; replace
deletes before adding distinct submitted IDs. `updateUserRoles` returns a fresh
safe account after replacement; invalid membership inputs reject before deletion. Account linking creates its link,
merges primary roles, replaces alias roles, clears the alias key/marks it linked,
rewrites records through RecordsService, then audits. Failures retain earlier
steps. User create/update pending-access callbacks run after identity and
membership writes. No transaction or automatic retry is added.

Record selection and authorization mutation use the storage repositories. Drain writers and retain a matching database, configuration, hook and binary checkpoint for recovery. No runtime rollback adapter remains.

The existing revoke-key endpoint acknowledges an empty/null-key request without
invalidating its stored key: Waterline rejected the original null-string patch
and its callback wrapper swallowed that error. Phase 6 preserves this auth
outcome (U-11). Account linking does clear an alias key using an accepted empty
string. Actual revocation behavior needs a separate authorized change.
