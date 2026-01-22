# Controllers Architecture

ReDBox controllers now live in `@researchdatabox/redbox-core-types` and are surfaced to Sails.js through generated shims. This keeps request handling logic centralized with services and models while preserving the existing route naming.

## Locations and Naming

Controllers are organized into two groups:

| Location | Purpose | Shim Directory |
|---|---|---|
| `packages/redbox-core-types/src/controllers/` | API controllers | `api/controllers/` |
| `packages/redbox-core-types/src/controllers/webservice/` | Webservice controllers | `api/controllers/webservice/` |

Route configuration uses controller names exactly as defined in the shims:
- API controllers: `RecordController.getMeta`
- Webservice controllers: `webservice/RecordController.getMeta`

## Controller Exports and Shims

The core package provides two lazy export objects plus name lists:

- `ControllerExports`: API controllers (lazy instantiated)
- `WebserviceControllerExports`: webservice controllers (lazy instantiated)
- `ControllerNames`: API controller names without instantiation
- `WebserviceControllerNames`: webservice controller names without instantiation

`redbox-loader.js` uses the name lists to generate controller shims without triggering controller instantiation. The shims expose the exported methods for Sails routes.

## Controller Lifecycle and `init()`

Controllers extend `Controllers.Core.Controller` and can implement `init()` for setup that depends on `sails` globals. The base class ensures `init()` is called once before any exported action runs.

Key rules:
- Avoid using `sails` in constructors or field initializers.
- Put sails-dependent setup in `init()`.
- `init()` is invoked once before any exported action runs.
- Add `init` to `_exportedMethods` only if you need to call it explicitly (bootstrap/tests).
- Do not map routes to `init` (it is only for initialization).

Example:

```typescript
import { Controllers as controllers } from '@researchdatabox/redbox-core-types';

export module Controllers {
  export class Example extends controllers.Core.Controller {
    protected _exportedMethods: any = ['init', 'index'];
    private recordsService: any;

    public init(): void {
      this.recordsService = sails.services.recordsservice;
    }

    public async index(req: any, res: any): Promise<void> {
      const record = await this.recordsService.getMeta(req.param('oid'));
      res.json(record);
    }
  }
}
```

## Current Controllers

### API Controllers

| Controller |
|---|
| `ActionController` |
| `AdminController` |
| `AppConfigController` |
| `AsynchController` |
| `BrandingAppController` |
| `BrandingController` |
| `DynamicAssetController` |
| `EmailController` |
| `ExportController` |
| `RecordAuditController` |
| `RecordController` |
| `RenderViewController` |
| `ReportController` |
| `ReportsController` |
| `TranslationController` |
| `UserController` |
| `VocabController` |
| `WorkspaceAsyncController` |
| `WorkspaceTypesController` |

### Webservice Controllers

| Controller |
|---|
| `AdminController` |
| `AppConfigController` |
| `BrandingController` |
| `ExportController` |
| `FormManagementController` |
| `RecordController` |
| `RecordTypeController` |
| `ReportController` |
| `SearchController` |
| `TranslationController` |
| `UserManagementController` |

## Hook Overrides

Hooks can provide or override controllers by declaring `hasControllers` in `package.json` and exporting registration functions:

```json
{
  "name": "redbox-hook-myproject",
  "sails": {
    "hasControllers": true
  }
}
```

```typescript
import { Controllers as controllers } from '@researchdatabox/redbox-core-types';

export module Controllers {
  export class MyController extends controllers.Core.Controller {
    protected _exportedMethods: any = ['index'];
    public index(req: any, res: any) {
      return res.json({ ok: true });
    }
  }
}

module.exports.registerRedboxControllers = function() {
  return {
    MyController: new Controllers.MyController().exports()
  };
};
```

Webservice controllers are registered separately:

```typescript
module.exports.registerRedboxWebserviceControllers = function() {
  return {
    MyWebserviceController: new Controllers.MyWebserviceController().exports()
  };
};
```

Hook controllers take precedence over core controllers during shim generation.

## Testing

Controller unit tests live in:
- `packages/redbox-core-types/test/controllers/`
- `packages/redbox-core-types/test/controllers/webservice/`

Run them with:

```bash
cd packages/redbox-core-types
npm test
```
