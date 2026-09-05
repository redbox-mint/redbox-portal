# Authorization Scope Catalog

Deployed code is authoritative for scope identity: this page is a
human-readable reference of the core catalog shipped by
`@researchdatabox/redbox-core` (`src/authorization/core-scopes.ts`). The live,
runtime-validated catalog — including hook-owned scopes, deprecation, and
orphan status — is available to administrators at
`GET /:branding/:portal/api/authorization/scopes` and in the **Scope Catalog**
tab of the Manage Roles application.

## Grammar and lifecycle

- Core keys use lowercase dot-separated business terms
  (`^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$`); hook keys must begin with the
  hook's approved package namespace.
- Status is `active`, `deprecated` (with a replacement key), or `orphaned`
  (no longer declared by any installed package; orphaned by an explicit
  post-deployment reconciliation, never automatically at startup).
- Orphaned and deprecated scopes grant nothing and cannot be newly selected in
  role editors.
- Risk is `read`, `write`, `admin`, or `system`.

## Core scope families

| Family        | Scopes                                                                                                                                              |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Portal        | `portal.home.read`, `portal.profile.read`                                                                                                            |
| Records       | `record.create`, `record.read`, `record.read.all`, `record.update`, `record.update.all`, `record.delete`, `record.restore`, `record.destroy`, `record.audit.read`, `record.permission.manage` |
| Attachments   | `attachment.read`, `attachment.manage`                                                                                                               |
| Search        | `search.execute`                                                                                                                                     |
| Dashboards    | `dashboard.read`, `dashboard.configure`                                                                                                              |
| Workspaces    | `workspace.read`, `workspace.manage`                                                                                                                 |
| Vocabulary    | `vocabulary.read`, `vocabulary.manage`                                                                                                               |
| Forms/types   | `form.read`, `form.manage`, `record-type.read`, `record-type.manage`                                                                                 |
| Reports/export| `report.run`, `report.manage`, `export.run`                                                                                                          |
| Harvesting    | `harvest.read`, `harvest.manage`                                                                                                                     |
| Integrations  | `integration.audit.read` plus hook-owned integration scopes                                                                                          |
| Configuration | `branding.manage`, `translation.manage`, `app-config.manage`, `navigation.manage`, `named-query.manage`                                               |
| Users         | `user.read`, `user.manage`, `user.account-link.manage`, `user.token.manage`                                                                          |
| Authorization | `authorization.self.read`, `authorization.scope.read`, `authorization.role.read`, `authorization.role.manage`, `authorization.assignment.read`, `authorization.assignment.manage`, `authorization.audit.read`, `authorization.explain` |
| System        | `system.authorization.manage`, `system.brand.read`                                                                                                    |

## Protected floors

- **Guest** must retain `authorization.self.read` (plus the reviewed safe
  baseline such as `portal.home.read`).
- **Brand administrator** must retain `authorization.scope.read`,
  `authorization.role.read`, `authorization.role.manage`,
  `authorization.assignment.read`, `authorization.assignment.manage`.
- **System administrator** must retain the brand-administration floor plus
  `system.authorization.manage`.

## Broad record scopes

`record.read.all` and `record.update.all` are explicit resource-gate bypasses
for record ACLs within an authorized brand only. They never substitute for the
base action scope (`record.read`/`record.update`) and never cross a brand
boundary.
