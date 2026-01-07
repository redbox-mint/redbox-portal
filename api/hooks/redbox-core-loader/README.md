# Redbox Core Loader

**redbox-core-loader** is a local Sails hook responsible for integrating TypeScript-defined models and services from `@researchdatabox/redbox-core-types` and other Redbox hooks into the Sails application.

## Purpose

1.  **Core Types Integration**: It generates shim files in `api/models` and `api/policies` that point to the actual implementations in `@researchdatabox/redbox-core-types`. This allows Sails (which expects JS files in specific directories) to load and use the shared TypeScript Core components.
2.  **Hook Auto-Discovery**: It dynamically scans the application's dependencies (using `package.json`) to find other Redbox hooks that provide models or policies.
    *   Hooks with `sails.hasModels: true` and an exported `registerRedboxModels()` function are registered.
    *   Hooks with `sails.hasPolicies: true` and an exported `registerRedboxPolicies()` function are registered.
    *   This ensures that models/policies from installable hooks are loaded even if the hook load order is not ideal.

## How it Works

On `configure` (before Sails loads the ORM or Policies):
1.  It checks `package.json` dependencies for compatible hooks.
2.  It calls `registerRedboxModels` / `registerRedboxPolicies` on those hooks.
3.  It combines these with the core models/policies from `@researchdatabox/redbox-core-types`.
4.  It generates shim files:
    *   Models -> `api/models/<ModelName>.js`
    *   Policies -> `api/policies/<PolicyName>.js`

## Configuration

The hook is enabled by default. It uses `sails.config.redboxHookModels` and `sails.config.redboxHookPolicies` to store the registered items during the bootstrap process.
