# Redbox Core Types Package

The `@researchdatabox/redbox-core-types` package provides shared TypeScript type definitions and core business logic used across the ReDBox Portal system.

## Overview

This package centralizes:
- **Type definitions** for models, services, and configuration
- **Waterline model definitions** for database entities
- **Policy functions** for authorization and request handling
- **Configuration defaults** for all Sails.js config keys
- **Core bootstrap logic** for application startup

## Package Structure

| Directory | Description |
|---|---|
| `src/config/` | Configuration defaults for all sails.config keys (65+ config modules) |
| `src/configmodels/` | Configuration models for menus, panels, sidebars, system messages |
| `src/policies/` | Authorization policies (isAuthenticated, checkAuth, etc.) |
| `src/waterline-models/` | Waterline ORM model definitions (User, Role, RecordType, etc.) |
| `src/model/` | TypeScript interfaces and business models |
| `src/decorators/` | TypeScript decorators for controllers and services |
| `src/responses/` | Custom Sails.js response handlers |
| `src/middleware/` | Express middleware functions |

## Key Exports

```typescript
import {
    // Base classes for controllers and services
    Controllers,
    Services,

    // Policy functions
    Policies,

    // Waterline model definitions
    WaterlineModels,

    // Configuration defaults
    Config,

    // Bootstrap functions
    coreBootstrap,
    preLiftSetup,
    BootstrapProvider,

    // Hooks
    defineWebpackHook,

    // Shims
    momentShim
} from '@researchdatabox/redbox-core-types';
```

## Configuration System

All ReDBox configuration defaults are defined in `src/config/` modules. Each module exports:
1. A **TypeScript interface** defining the config shape
2. A **default value** for that configuration

Example from `appmode.config.ts`:

```typescript
export interface AppModeConfig {
    bootstrapAlways: boolean;
    bootstrapOnce?: boolean;
}

export const appmode: AppModeConfig = {
    bootstrapAlways: true
};
```

The [Redbox Loader](Redbox-Loader) uses these defaults to generate config shim files.

## Waterline Models

Database models are defined in `src/waterline-models/`:

| Model | Description |
|---|---|
| `User` | User accounts and authentication data |
| `Role` | User roles and permissions |
| `RecordType` | Research data record type definitions |
| `WorkflowStep` | Workflow state transitions |
| `Form` | Dynamic form configurations |
| `BrandingConfig` | Portal branding settings |
| `Report` | Report definitions |
| `NamedQuery` | Saved query configurations |

## Policies

Authorization policies in `src/policies/`:

| Policy | Description |
|---|---|
| `isAuthenticated` | Verifies user is logged in |
| `checkAuth` | Validates authorization for actions |
| `checkBrandingValid` | Ensures branding context is valid |
| `contentSecurityPolicy` | Applies CSP headers |
| `menuResolver` | Resolves navigation menus |
| `i18nLanguages` | Sets up internationalization |

## Bootstrap Functions

The package exports bootstrap functions called during Sails.js startup:

```typescript
// Core bootstrap - initializes all ReDBox services
export async function coreBootstrap(): Promise<void>;

// Pre-lift setup - configuration adjustments before services bootstrap
export function preLiftSetup(): void;
```

The generated `config/bootstrap.js` shim calls these functions in order.

## Webpack Hook

The package provides a custom Sails.js hook for compiling assets using Webpack:

```typescript
// Define the hook in a Sails app
import { defineWebpackHook } from '@researchdatabox/redbox-core-types';

export default function(sails) {
    return defineWebpackHook(sails);
}
```

This hook:
- Compiles assets in `production` (Docker) environments.
- Supports `WEBPACK_SKIP=true` to bypass compilation.
- Supports `WEBPACK_CSS_MINI=true` for CSS minimization.

## Shims

Helper functions for backward compatibility are available in `src/shims/`:

- **momentShim**: A Luxon-based shim that replicates Moment.js formatting for templates.

```typescript
import { momentShim } from '@researchdatabox/redbox-core-types';
const formattedDate = momentShim(new Date()).format('YYYY-MM-DD');
```

## Usage in Hooks

Hooks extending ReDBox can depend on this package:

```json
{
    "dependencies": {
        "@researchdatabox/redbox-core-types": "^1.5.0"
    }
}
```

See also:
- [Redbox Loader](Redbox-Loader) - Pre-lift shim generation
- [Redbox Hook Kit](Redbox-Hook-Kit) - Hook development toolkit
- [Using a Sails Hook to customise ReDBox](Using-a-Sails-Hook-to-customise-ReDBox)
