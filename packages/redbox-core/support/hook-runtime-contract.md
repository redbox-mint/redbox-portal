# ReDBox Hook Runtime Contract

`@researchdatabox/redbox-core` is the runtime compatibility anchor for ReDBox hooks.

Hook authors may rely on the shared runtime dependency surface supplied by ReDBox core instead of declaring those packages directly in each hook. The initial approved shared imports are:

- `axios`
- `rxjs`
- `lodash`

Hooks should only declare direct runtime dependencies for libraries they uniquely own, such as `xmlbuilder`.

`@researchdatabox/redbox-dev-tools` complements this by supplying the shared hook authoring toolchain, including TypeScript and the default Mocha test stack.
