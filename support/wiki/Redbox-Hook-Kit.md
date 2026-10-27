# Redbox Dev Tools for v6 hooks

Use the built `@researchdatabox/redbox-dev-tools` and core artifacts from the
same qualified v6 portal checkout. Historical npm packages with the same version
numbers can still contain the Sails implementation. An unqualified registry
install does not establish v6 compatibility.

Complete the portal's `npm run compile:all` first, using Node 26.12.1 and npm
11.20.0. From that built portal checkout, this complete example creates a new
hook in an empty sibling directory:

```sh
export REDBOX_PORTAL_ROOT="$PWD"
mkdir ../redbox-hook-demo-client
cd ../redbox-hook-demo-client
node "$REDBOX_PORTAL_ROOT/packages/redbox-dev-tools/bin/cli.js" init demo-client --template v6
npm install --save-dev --save-exact --ignore-scripts --strict-peer-deps --legacy-peer-deps=false "$REDBOX_PORTAL_ROOT/packages/redbox-core"
npm run build
node "$REDBOX_PORTAL_ROOT/packages/redbox-dev-tools/bin/cli.js" check --v6
npm pack --ignore-scripts
```

`init` writes into the current directory. Its name argument sets the package
name. The scaffold has exact compiler/type pins, a neutral `redbox.extension`
manifest, a public runtime export, and package-relative views/assets. It declares
`registerRedboxExtension()` with `apiVersion: 1`; it does not generate Sails
controllers, service registrations, model shims or a standalone deployment.

The `file:` core reference is for local development. Before publication, replace
it with the deployment's exact qualified v6 core version or complete packed
dependency set, then repeat isolated installation, build and pack. Do not publish
a developer's local paths. Keep runtime-owned shared dependencies on the core
contract rather than adding them to the hook.

For a converted hook that uses the shared compiler, install the matching exact
qualified dev-tools artifact as well. Extend
`@researchdatabox/redbox-dev-tools/config/tsconfig.base.json` and retain its
`run-hook-tsc.js` and `run-hook-mocha.js` wrappers. They resolve shared runtime
packages through the core/toolchain contract. The generated minimal v6 scaffold
instead has explicit compiler settings and its own pinned TypeScript compiler.
The conservative Node 24 type base does not select the executing Node runtime.

Registration returns declarations and named factories. The application binds
each factory's concrete inputs, awaits initialization and migrations, activates
workers and HTTP, then owns drain and close. EJS receives `page`; configuration
and services are explicit inputs. Old `sails.hasControllers`,
`registerRedboxControllers()` and `Core.Controller` examples are unsupported.

Follow the [complete conversion guide](../specs/sails-retirement/hook-migration-v6.md)
for compiler conversion, factory/work bindings, policies, persisted expressions,
packaged pages and installed verification. The [extension contract](../specs/sails-retirement/extensions-v6.md)
and [loading guide](Redbox-Loader.md) define the supported runtime. CLI help and
completion are available through the same built CLI; form migration tools have
separate input-specific guidance.
