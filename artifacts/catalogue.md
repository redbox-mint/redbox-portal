# ReDBox extension contracts and form contracts

Schema version: 1.0.0  
Source commit: 09c66809c8032dd3ac39aa5d4b886a389861a828  
Build time: 2026-09-02T07:19:04.655Z

## RecordController

- Kind: ajax-controller
- Lifecycle: supported
- Source: [packages/redbox-core/src/controllers/RecordController.ts:75](https://github.com/redbox-mint/redbox-portal/blob/09c66809c8032dd3ac39aa5d4b886a389861a828/packages/redbox-core/src/controllers/RecordController.ts#L75)

Responsible for all things related to a Record, includings Forms, etc.

How to change this contract: Register a subclass as `RecordController` through `registerRedboxControllers` to override browser-facing record actions.

| Member | Contract | Default | Purpose |
|---|---|---|---|
| `init` | `(): void` | `` |  |
| `getMeta` | `(req: Sails.Req, res: Sails.Res): Promise<import("@types/express").Response<any, globalThis.Record<string, any>>>` | `` |  |
| `getMetaDefault` | `(req: Sails.Req, res: Sails.Res): Promise<import("@types/express").Response<any, globalThis.Record<string, any>>>` | `` |  |
| `view` | `(req: Sails.Req, res: Sails.Res): Promise<void \| import("@types/express-serve-static-core").Response<any, globalThis.Record<string, any>, number>>` | `` |  |
| `edit` | `(req: Sails.Req, res: Sails.Res): void` | `` |  |
| `getForm` | `(req: Sails.Req, res: Sails.Res): Promise<import("@types/express").Response<any, globalThis.Record<string, any>>>` | `` |  |
| `create` | `(req: Sails.Req, res: Sails.Res): void` | `` |  |
| `delete` | `(req: Sails.Req, res: Sails.Res): Promise<import("@types/express").Response<any, globalThis.Record<string, any>>>` | `` |  |
| `restoreRecord` | `(req: Sails.Req, res: Sails.Res): Promise<import("@types/express").Response<any, globalThis.Record<string, any>>>` | `` |  |
| `destroyDeletedRecord` | `(req: Sails.Req, res: Sails.Res): Promise<import("@types/express").Response<any, globalThis.Record<string, any>>>` | `` |  |
| `update` | `(req: Sails.Req, res: Sails.Res): void` | `` |  |
| `stepTo` | `(req: Sails.Req, res: Sails.Res): import("rxjs/dist").Subscription` | `` |  |
| `search` | `(req: Sails.Req, res: Sails.Res): Promise<void>` | `` |  |
| `getType` | `(req: Sails.Req, res: Sails.Res): void` | `` | Returns the RecordType configuration based of the response model that is intentionally restricting
the object schema and information that is allowed to be sent back in this endpoint |
| `getAllTypes` | `(req: Sails.Req, res: Sails.Res): void` | `` | Returns all RecordTypes configuration based of the response model that is intentionally restricting
the object schema and information that is allowed to be sent back in this endpoint |
| `getDashboardType` | `(req: Sails.Req, res: Sails.Res): void` | `` |  |
| `getAllDashboardTypes` | `(req: Sails.Req, res: Sails.Res): void` | `` |  |
| `getDashboardView` | `(req: Sails.Req, res: Sails.Res): import("@types/express").Response<any, globalThis.Record<string, any>>` | `` |  |
| `doAttachment` | `(req: Sails.Req, res: Sails.Res): Promise<import("@types/express").Response<any, globalThis.Record<string, any>> \| Observable<string>>` | `` |  |
| `getWorkflowSteps` | `(req: Sails.Req, res: Sails.Res): Promise<import("@types/express").Response<any, globalThis.Record<string, any>>>` | `` |  |
| `getRelatedRecords` | `(req: Sails.Req, res: Sails.Res): Promise<import("@types/express").Response<any, globalThis.Record<string, any>>>` | `` |  |
| `getPermissionsInternal` | `(req: Sails.Req, _res: Sails.Res): Promise<import("packages/redbox-core/src/RecordsService").ResolvedRecordPermissions>` | `` |  |
| `getPermissions` | `(req: Sails.Req, res: Sails.Res): Promise<import("@types/express").Response<any, globalThis.Record<string, any>>>` | `` |  |
| `getAttachments` | `(req: Sails.Req, res: Sails.Res): Promise<import("@types/express").Response<any, globalThis.Record<string, any>>>` | `` |  |
| `getDataStream` | `(req: Sails.Req, res: Sails.Res): Promise<import("@types/express").Response<any, globalThis.Record<string, any>> \| Observable<string>>` | `` |  |
| `listWorkspaces` | `(req: Sails.Req, res: Sails.Res): void` | `` | Dashboard Controller functions |
| `render` | `(req: Sails.Req, res: Sails.Res): Promise<void>` | `` |  |
| `renderDashboardView` | `(req: Sails.Req, res: Sails.Res): Promise<void \| import("@types/express").Response<any, globalThis.Record<string, any>>>` | `` |  |
| `redirectLegacyConsolidatedDashboard` | `(req: Sails.Req, res: Sails.Res): void` | `` |  |
| `getRecordList` | `(req: Sails.Req, res: Sails.Res): Promise<void>` | `` |  |
| `getDeletedRecordList` | `(req: Sails.Req, res: Sails.Res): Promise<void>` | `` |  |
| `renderDeletedRecords` | `(req: Sails.Req, res: Sails.Res): void` | `` |  |

## Controller

- Kind: base-controller
- Lifecycle: supported
- Source: [packages/redbox-core/src/CoreController.ts:44](https://github.com/redbox-mint/redbox-portal/blob/09c66809c8032dd3ac39aa5d4b886a389861a828/packages/redbox-core/src/CoreController.ts#L44)

Core controller which defines common logic between controllers.

Workflow details:
- First, the "_handleRequest" method must be called. It ensures common stuff happens, and bind some data into the option object.
- It calls a magic method such as "__beforeIndex" if the request was coming from an "index" method.
- If it doesn't find any specific magic method to call, it calls directly the "__beforeEach" method.
- If it does find a custom magic method, then the "__beforeIndex" will automatically call the "__beforeEach" once it is done.
- Once all the "__before" magic methods have been called, the caller's callback function is called.

The options object contains specific stuff that belongs to the controllers logic, I could have use the req but I prefer not.

The public methods such as index/show/etc. are defined but send by default a 404 response if they are not overridden in the child class.
They exists just to bind by default all these methods without take care if they exists or not in order to speed up development.

How to change this contract: Hook controllers extend this class, retain inherited `_exportedMethods`, and export replacements under the same controller registry name.

| Member | Contract | Default | Purpose |
|---|---|---|---|
| `exports` | `(): Record<string, unknown>` | `` | Returns an object that contains all exported methods of the controller.
These methods must be defined in either the "_defaultExportedMethods" or "_exportedMethods" arrays. |
| `sendResp` | `(req: Sails.Req, res: Sails.Res, buildResponse?: BuildResponseType): Response` | `` | Send a response built from the properties.

Defaults / Conventions:
- The default response format is 'json'.
- If only 'data' is provided, the 'status' will be 200.
- If there are any 'errors', the 'status' will default to 500.
- If there are no displayErrors, a generic one will be added.
- Errors are never used as display errors, to avoid revealing implementation details.
- If there are any displayErrors:
  - the top-level status will be 500 if any status starts with 5, or
  - the top-level status will be 400 if any status starts with 4 and no statuses start with a 5, or
  - the top-level status will be 500 if none of the display errors has a status, and the top-level status is not already 4xx or 5xx.
- The response will be in the format matching the request kind (e.g. API, ajax).
- If there is no displayError.title and no displayError.detail, and displayError.code is set,
  the displayError.code will be used as a translation message identifier for displayError.title.
- Both displayError.title and displayError.detail will be treated as translation message identifiers.
- API v1 will return 'v1' if it is set.
- API v1 will return 'data' as the body on 'status' 200, if no 'v1' is supplied. |

## Service

- Kind: base-service
- Lifecycle: supported
- Source: [packages/redbox-core/src/CoreService.ts:20](https://github.com/redbox-mint/redbox-portal/blob/09c66809c8032dd3ac39aa5d4b886a389861a828/packages/redbox-core/src/CoreService.ts#L20)

Base contract for services exposed through ReDBox loader-generated Sails shims.

How to change this contract: Hook services extend this class and list every public shim method in `_exportedMethods`; overrides should retain inherited exported methods when adding new ones.

| Member | Contract | Default | Purpose |
|---|---|---|---|
| `getObservable` | `<T = unknown>(q: QueryObject, method?: string, type?: string): Observable<T>` | `` | Returns an RxJS Observable wrapped nice and tidy for your subscribing pleasure |
| `init` | `(): void` | `` | Initialization method called during bootstrap for services that need to register
hooks or perform other setup after Sails is available.
Override in subclass to implement custom initialization logic.
Called by coreBootstrap() for all services loaded via redbox-loader shims. |
| `exports` | `(): Record<string, unknown>` | `` | Returns an object that contains all exported methods of the controller.
These methods must be defined in either the "_defaultExportedMethods" or "_exportedMethods" arrays. |
| `convertToType` | `<Type>(source: Record<string, unknown>, dest: Record<string, unknown>, mapping: { [key: string]: string; } \| undefined, appendMappingToSource?: boolean): Type` | `` | Convenience method to quickly assign properties of one type to another. Note type-safety isn't fully guaranteed.

Usually used to convert to/from DTOs. Destination object constructing is left to the callee.

TODO: source and dest can be made more type safe |

## AccordionComponent

- Kind: form-component
- Lifecycle: supported
- Source: [packages/sails-ng-common/src/config/component/accordion.outline.ts:151](https://github.com/redbox-mint/redbox-portal/blob/09c66809c8032dd3ac39aa5d4b886a389861a828/packages/sails-ng-common/src/config/component/accordion.outline.ts#L151)

Groups child components into an accordion container.

How to change this contract: Use `AccordionComponent` in FormConfig to organise related accordion panels.

| Member | Contract | Default | Purpose |
|---|---|---|---|
| `panels` | `AccordionPanelFormComponentDefinitionOutline[]` | `` |  |
| `startingOpenMode` | `"all-open" \| "first-open" \| "last-open"` | `'all-open'` |  |
| `onItemSelect` | `{ rawPath: string; clearValue?: unknown; }` | `` |  |
| `readonly` | `boolean` | `` | Whether the component is read-only or not.

Note that readonly affects only the component's interactivity.
Readonly is separate from disabled, they can be set independently. |
| `visible` | `boolean` | `` | Whether the component is visible or not. |
| `editMode` | `boolean` | `` | Whether the component is in edit mode or not. |
| `label` | `string` | `` | The label text translation message id. |
| `defaultComponentCssClasses` | `KeyValueStringProperty` | `` | The form-supplied css classes |
| `hostCssClasses` | `KeyValueStringProperty` | `'view-accordion'` | The css classes to bind to host |
| `wrapperCssClasses` | `KeyValueStringProperty` | `` | The wrapper css classes to bind to host |
| `disabled` | `boolean` | `` | Whether the component is disabled or not.

Note that disabled affects only the component's interactivity.
Disabled is separate from readonly, they can be set independently. |
| `autofocus` | `boolean` | `` | Whether the component has autofocus or not. |
| `tooltip` | `string` | `` | The tooltip text translation message id. |
| `showValidIndicator` | `boolean` | `` | Whether to show a visual valid indicator (e.g. Bootstrap is-valid style) when the field has no errors.
Defaults to false. |
| `syncSources` | `SyncSourceEntry[]` | `` | Declares source fields for one-way additive sync. |

## AccordionPanelComponent

- Kind: form-component
- Lifecycle: supported
- Source: [packages/sails-ng-common/src/config/component/accordion.outline.ts:171](https://github.com/redbox-mint/redbox-portal/blob/09c66809c8032dd3ac39aa5d4b886a389861a828/packages/sails-ng-common/src/config/component/accordion.outline.ts#L171)

Defines one collapsible panel within an accordion.

How to change this contract: Use `AccordionPanelComponent` beneath an accordion to configure a labelled panel and its children.

| Member | Contract | Default | Purpose |
|---|---|---|---|
| `componentDefinitions` | `(AccordionPanelFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").TabContentFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").RepeatableFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").GroupFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").SaveButtonFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").SaveStatusFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").IntegrationStatusFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").CancelButtonFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").DeleteButtonFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").TabNavButtonFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").TextAreaFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").ContentFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").SimpleInputFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").ValidationSummaryFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").SuggestedValidationSummaryFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").TabFormComponentDefinitionOutline \| AccordionFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").CheckboxInputFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").DropdownInputFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").RadioInputFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").DateInputFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").ReusableFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").QuestionTreeFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").CheckboxTreeFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").RecordSelectorFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").TypeaheadInputFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").RichTextEditorFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").MapFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").FileUploadFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").PDFListFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").RecordMetadataRetrieverFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").DataLocationFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").PublishDataLocationRefreshFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").PublishDataLocationSelectorFormComponentDefinitionOutline)[]` | `` |  |
| `onItemSelect` | `{ rawPath: string; clearValue?: unknown; }` | `` |  |
| `readonly` | `boolean` | `` | Whether the component is read-only or not.

Note that readonly affects only the component's interactivity.
Readonly is separate from disabled, they can be set independently. |
| `visible` | `boolean` | `` | Whether the component is visible or not. |
| `editMode` | `boolean` | `` | Whether the component is in edit mode or not. |
| `label` | `string` | `` | The label text translation message id. |
| `defaultComponentCssClasses` | `KeyValueStringProperty` | `` | The form-supplied css classes |
| `hostCssClasses` | `KeyValueStringProperty` | `` | The css classes to bind to host |
| `wrapperCssClasses` | `KeyValueStringProperty` | `` | The wrapper css classes to bind to host |
| `disabled` | `boolean` | `` | Whether the component is disabled or not.

Note that disabled affects only the component's interactivity.
Disabled is separate from readonly, they can be set independently. |
| `autofocus` | `boolean` | `` | Whether the component has autofocus or not. |
| `tooltip` | `string` | `` | The tooltip text translation message id. |
| `showValidIndicator` | `boolean` | `` | Whether to show a visual valid indicator (e.g. Bootstrap is-valid style) when the field has no errors.
Defaults to false. |
| `syncSources` | `SyncSourceEntry[]` | `` | Declares source fields for one-way additive sync. |

## CancelButtonComponent

- Kind: form-component
- Lifecycle: supported
- Source: [packages/sails-ng-common/src/config/component/cancel-button.outline.ts:86](https://github.com/redbox-mint/redbox-portal/blob/09c66809c8032dd3ac39aa5d4b886a389861a828/packages/sails-ng-common/src/config/component/cancel-button.outline.ts#L86)

Configures a button that cancels form editing.

How to change this contract: Use `CancelButtonComponent` in FormConfig action areas and configure its label and navigation behaviour.

| Member | Contract | Default | Purpose |
|---|---|---|---|
| `confirmationMessage` | `string` | `` | An optional confirmation message shown to the user before cancelling.
If not set, the cancel action proceeds without confirmation. |
| `confirmationTitle` | `string` | `` | The title of the confirmation dialog. |
| `cancelButtonMessage` | `string` | `` | The label for the cancel button in the confirmation dialog. |
| `confirmButtonMessage` | `string` | `` | The label for the confirm button in the confirmation dialog. |
| `buttonCssClasses` | `string` | `` | CSS classes to apply to the main cancel button element.
Example: 'btn-warning' or 'btn btn-warning'. |
| `redirectLocation` | `string` | `` | The relative url to redirect to.
Leave empty to use the browser's location.back. |
| `redirectDelaySeconds` | `number` | `` | The delay before redirecting.
Default is 3 seconds delay. |
| `onItemSelect` | `{ rawPath: string; clearValue?: unknown; }` | `` |  |
| `readonly` | `boolean` | `` | Whether the component is read-only or not.

Note that readonly affects only the component's interactivity.
Readonly is separate from disabled, they can be set independently. |
| `visible` | `boolean` | `` | Whether the component is visible or not. |
| `editMode` | `boolean` | `` | Whether the component is in edit mode or not. |
| `label` | `string` | `` | The label text translation message id. |
| `defaultComponentCssClasses` | `KeyValueStringProperty` | `` | The form-supplied css classes |
| `hostCssClasses` | `KeyValueStringProperty` | `` | The css classes to bind to host |
| `wrapperCssClasses` | `KeyValueStringProperty` | `` | The wrapper css classes to bind to host |
| `disabled` | `boolean` | `` | Whether the component is disabled or not.

Note that disabled affects only the component's interactivity.
Disabled is separate from readonly, they can be set independently. |
| `autofocus` | `boolean` | `` | Whether the component has autofocus or not. |
| `tooltip` | `string` | `` | The tooltip text translation message id. |
| `showValidIndicator` | `boolean` | `` | Whether to show a visual valid indicator (e.g. Bootstrap is-valid style) when the field has no errors.
Defaults to false. |
| `syncSources` | `SyncSourceEntry[]` | `` | Declares source fields for one-way additive sync. |

## CheckboxInputComponent

- Kind: form-component
- Lifecycle: supported
- Source: [packages/sails-ng-common/src/config/component/checkbox-input.outline.ts:92](https://github.com/redbox-mint/redbox-portal/blob/09c66809c8032dd3ac39aa5d4b886a389861a828/packages/sails-ng-common/src/config/component/checkbox-input.outline.ts#L92)

Configures one or more checkbox choices from inline options or a vocabulary.

How to change this contract: Use `CheckboxInputComponent` with `CheckboxInputModel`; vocabulary-aware hooks may populate `vocabRef` or `inlineVocab` through the standard visitor pipeline.

| Member | Contract | Default | Purpose |
|---|---|---|---|
| `placeholder` | `string` | `` |  |
| `options` | `CheckboxOption[]` | `[]` |  |
| `multipleValues` | `boolean` | `` |  |
| `vocabRef` | `string` | `` |  |
| `inlineVocab` | `boolean` | `` |  |
| `historicalVocabMode` | `HistoricalVocabMode` | `` |  |
| `onItemSelect` | `{ rawPath: string; clearValue?: unknown; }` | `` |  |
| `readonly` | `boolean` | `` | Whether the component is read-only or not.

Note that readonly affects only the component's interactivity.
Readonly is separate from disabled, they can be set independently. |
| `visible` | `boolean` | `` | Whether the component is visible or not. |
| `editMode` | `boolean` | `` | Whether the component is in edit mode or not. |
| `label` | `string` | `` | The label text translation message id. |
| `defaultComponentCssClasses` | `KeyValueStringProperty` | `` | The form-supplied css classes |
| `hostCssClasses` | `KeyValueStringProperty` | `` | The css classes to bind to host |
| `wrapperCssClasses` | `KeyValueStringProperty` | `` | The wrapper css classes to bind to host |
| `disabled` | `boolean` | `` | Whether the component is disabled or not.

Note that disabled affects only the component's interactivity.
Disabled is separate from readonly, they can be set independently. |
| `autofocus` | `boolean` | `` | Whether the component has autofocus or not. |
| `tooltip` | `string` | `` | The tooltip text translation message id. |
| `showValidIndicator` | `boolean` | `` | Whether to show a visual valid indicator (e.g. Bootstrap is-valid style) when the field has no errors.
Defaults to false. |
| `syncSources` | `SyncSourceEntry[]` | `` | Declares source fields for one-way additive sync. |

## CheckboxTreeComponent

- Kind: form-component
- Lifecycle: supported
- Source: [packages/sails-ng-common/src/config/component/checkbox-tree.outline.ts:103](https://github.com/redbox-mint/redbox-portal/blob/09c66809c8032dd3ac39aa5d4b886a389861a828/packages/sails-ng-common/src/config/component/checkbox-tree.outline.ts#L103)

Configures hierarchical checkbox selection from tree-shaped option data.

How to change this contract: Use `CheckboxTreeComponent` with its model to collect one or more values from a hierarchy.

| Member | Contract | Default | Purpose |
|---|---|---|---|
| `vocabRef` | `string` | `` |  |
| `inlineVocab` | `boolean` | `` |  |
| `historicalVocabMode` | `HistoricalVocabMode` | `` |  |
| `treeData` | `CheckboxTreeNode[]` | `[]` |  |
| `leafOnly` | `boolean` | `` |  |
| `maxDepth` | `number` | `` |  |
| `labelTemplate` | `string` | `` |  |
| `onItemSelect` | `{ rawPath: string; clearValue?: unknown; }` | `` |  |
| `readonly` | `boolean` | `` | Whether the component is read-only or not.

Note that readonly affects only the component's interactivity.
Readonly is separate from disabled, they can be set independently. |
| `visible` | `boolean` | `` | Whether the component is visible or not. |
| `editMode` | `boolean` | `` | Whether the component is in edit mode or not. |
| `label` | `string` | `` | The label text translation message id. |
| `defaultComponentCssClasses` | `KeyValueStringProperty` | `` | The form-supplied css classes |
| `hostCssClasses` | `KeyValueStringProperty` | `` | The css classes to bind to host |
| `wrapperCssClasses` | `KeyValueStringProperty` | `` | The wrapper css classes to bind to host |
| `disabled` | `boolean` | `` | Whether the component is disabled or not.

Note that disabled affects only the component's interactivity.
Disabled is separate from readonly, they can be set independently. |
| `autofocus` | `boolean` | `` | Whether the component has autofocus or not. |
| `tooltip` | `string` | `` | The tooltip text translation message id. |
| `showValidIndicator` | `boolean` | `` | Whether to show a visual valid indicator (e.g. Bootstrap is-valid style) when the field has no errors.
Defaults to false. |
| `syncSources` | `SyncSourceEntry[]` | `` | Declares source fields for one-way additive sync. |

## ContentComponent

- Kind: form-component
- Lifecycle: supported
- Source: [packages/sails-ng-common/src/config/component/content.outline.ts:72](https://github.com/redbox-mint/redbox-portal/blob/09c66809c8032dd3ac39aa5d4b886a389861a828/packages/sails-ng-common/src/config/component/content.outline.ts#L72)

Renders configured informational content without contributing a model value.

How to change this contract: Use `ContentComponent` in FormConfig for headings, guidance, or other non-field content.

| Member | Contract | Default | Purpose |
|---|---|---|---|
| `template` | `string` | `` | The template that can be used for setting content in innerHtml. |
| `content` | `unknown` | `` | The value available to the template as `content`.
Set 'content' to static content, with no template, to just show the static content. |
| `outputFormat` | `string` | `` | Optional auxiliary template context used by view-mode transforms. |
| `contentIsTranslationCode` | `boolean` | `` | Whether the `content` value should be treated as a translation key. |
| `translationContentFormat` | `"plain" \| "html"` | `` | The expected format of translated content when `contentIsTranslationCode` is true. |
| `onItemSelect` | `{ rawPath: string; clearValue?: unknown; }` | `` |  |
| `readonly` | `boolean` | `` | Whether the component is read-only or not.

Note that readonly affects only the component's interactivity.
Readonly is separate from disabled, they can be set independently. |
| `visible` | `boolean` | `` | Whether the component is visible or not. |
| `editMode` | `boolean` | `` | Whether the component is in edit mode or not. |
| `label` | `string` | `` | The label text translation message id. |
| `defaultComponentCssClasses` | `KeyValueStringProperty` | `` | The form-supplied css classes |
| `hostCssClasses` | `KeyValueStringProperty` | `` | The css classes to bind to host |
| `wrapperCssClasses` | `KeyValueStringProperty` | `` | The wrapper css classes to bind to host |
| `disabled` | `boolean` | `` | Whether the component is disabled or not.

Note that disabled affects only the component's interactivity.
Disabled is separate from readonly, they can be set independently. |
| `autofocus` | `boolean` | `` | Whether the component has autofocus or not. |
| `tooltip` | `string` | `` | The tooltip text translation message id. |
| `showValidIndicator` | `boolean` | `` | Whether to show a visual valid indicator (e.g. Bootstrap is-valid style) when the field has no errors.
Defaults to false. |
| `syncSources` | `SyncSourceEntry[]` | `` | Declares source fields for one-way additive sync. |

## DataLocationComponent

- Kind: form-component
- Lifecycle: supported
- Source: [packages/sails-ng-common/src/config/component/data-location.outline.ts:136](https://github.com/redbox-mint/redbox-portal/blob/09c66809c8032dd3ac39aa5d4b886a389861a828/packages/sails-ng-common/src/config/component/data-location.outline.ts#L136)

Captures and displays a configured research-data location.

How to change this contract: Use `DataLocationComponent` with `DataLocationModel` where a form records storage or access locations.

| Member | Contract | Default | Purpose |
|---|---|---|---|
| `notesEnabled` | `boolean` | `true` |  |
| `iscEnabled` | `boolean` | `false` |  |
| `iscHeader` | `string` | `"Information Security Classification"` |  |
| `defaultSelect` | `string` | `"confidential"` |  |
| `securityClassificationOptions` | `DataLocationOption[]` | `[]` |  |
| `locationAddText` | `string` | `""` |  |
| `typeHeader` | `string` | `"Type"` |  |
| `locationHeader` | `string` | `"Location"` |  |
| `notesHeader` | `string` | `"Notes"` |  |
| `columns` | `string[] \| Record<string, unknown>[]` | `[]` |  |
| `editNotesButtonText` | `string` | `"Edit"` |  |
| `editNotesTitle` | `string` | `"Edit Notes"` |  |
| `cancelEditNotesButtonText` | `string` | `"Cancel"` |  |
| `applyEditNotesButtonText` | `string` | `"Apply"` |  |
| `editNotesCssClasses` | `string` | `"form-control"` |  |
| `dataTypes` | `DataLocationOption[]` | `[
        { label: "URL", value: "url" },
        { label: "Physical location", value: "physical" },
        { label: "File path", value: "file" },
        { label: "Attachment", value: "attachment" }
    ]` |  |
| `dataTypePlaceholder` | `string` | `""` |  |
| `dataTypeLookup` | `Record<string, string>` | `{
        url: "URL",
        physical: "Physical location",
        file: "File path",
        attachment: "Attachment"
    }` |  |
| `hideNotesForLocationTypes` | `string[]` | `[]` |  |
| `restrictions` | `Record<string, unknown>` | `` |  |
| `enabledSources` | `FileUploadSourceType[]` | `[]` |  |
| `companionUrl` | `string` | `` |  |
| `allowUploadWithoutSave` | `boolean` | `false` |  |
| `uppyDashboardNote` | `string` | `"Maximum upload size: 1 Gb per file"` |  |
| `tusHeaders` | `Record<string, string>` | `` |  |
| `onItemSelect` | `{ rawPath: string; clearValue?: unknown; }` | `` |  |
| `readonly` | `boolean` | `` | Whether the component is read-only or not.

Note that readonly affects only the component's interactivity.
Readonly is separate from disabled, they can be set independently. |
| `visible` | `boolean` | `` | Whether the component is visible or not. |
| `editMode` | `boolean` | `` | Whether the component is in edit mode or not. |
| `label` | `string` | `` | The label text translation message id. |
| `defaultComponentCssClasses` | `KeyValueStringProperty` | `` | The form-supplied css classes |
| `hostCssClasses` | `KeyValueStringProperty` | `` | The css classes to bind to host |
| `wrapperCssClasses` | `KeyValueStringProperty` | `` | The wrapper css classes to bind to host |
| `disabled` | `boolean` | `` | Whether the component is disabled or not.

Note that disabled affects only the component's interactivity.
Disabled is separate from readonly, they can be set independently. |
| `autofocus` | `boolean` | `` | Whether the component has autofocus or not. |
| `tooltip` | `string` | `` | The tooltip text translation message id. |
| `showValidIndicator` | `boolean` | `` | Whether to show a visual valid indicator (e.g. Bootstrap is-valid style) when the field has no errors.
Defaults to false. |
| `syncSources` | `SyncSourceEntry[]` | `` | Declares source fields for one-way additive sync. |

## DateInputComponent

- Kind: form-component
- Lifecycle: supported
- Source: [packages/sails-ng-common/src/config/component/date-input.outline.ts:87](https://github.com/redbox-mint/redbox-portal/blob/09c66809c8032dd3ac39aa5d4b886a389861a828/packages/sails-ng-common/src/config/component/date-input.outline.ts#L87)

Configures date entry and its serialised model value.

How to change this contract: Use `DateInputComponent` with `DateInputModel` and the documented date configuration properties.

| Member | Contract | Default | Purpose |
|---|---|---|---|
| `placeholder` | `string` | `'yyyy/mm/dd'` |  |
| `dateFormat` | `string` | `'YYYY/MM/DD'` |  |
| `showWeekNumbers` | `boolean` | `false` |  |
| `containerClass` | `string` | `'theme-dark-blue'` |  |
| `enableTimePicker` | `boolean` | `false` |  |
| `robustParsing` | `boolean` | `true` |  |
| `bsFullConfig` | `any` | `null` |  |
| `onItemSelect` | `{ rawPath: string; clearValue?: unknown; }` | `` |  |
| `readonly` | `boolean` | `` | Whether the component is read-only or not.

Note that readonly affects only the component's interactivity.
Readonly is separate from disabled, they can be set independently. |
| `visible` | `boolean` | `` | Whether the component is visible or not. |
| `editMode` | `boolean` | `` | Whether the component is in edit mode or not. |
| `label` | `string` | `` | The label text translation message id. |
| `defaultComponentCssClasses` | `KeyValueStringProperty` | `` | The form-supplied css classes |
| `hostCssClasses` | `KeyValueStringProperty` | `` | The css classes to bind to host |
| `wrapperCssClasses` | `KeyValueStringProperty` | `` | The wrapper css classes to bind to host |
| `disabled` | `boolean` | `` | Whether the component is disabled or not.

Note that disabled affects only the component's interactivity.
Disabled is separate from readonly, they can be set independently. |
| `autofocus` | `boolean` | `` | Whether the component has autofocus or not. |
| `tooltip` | `string` | `` | The tooltip text translation message id. |
| `showValidIndicator` | `boolean` | `` | Whether to show a visual valid indicator (e.g. Bootstrap is-valid style) when the field has no errors.
Defaults to false. |
| `syncSources` | `SyncSourceEntry[]` | `` | Declares source fields for one-way additive sync. |

## DeleteButtonComponent

- Kind: form-component
- Lifecycle: supported
- Source: [packages/sails-ng-common/src/config/component/delete-button.outline.ts:86](https://github.com/redbox-mint/redbox-portal/blob/09c66809c8032dd3ac39aa5d4b886a389861a828/packages/sails-ng-common/src/config/component/delete-button.outline.ts#L86)

Configures a form action that deletes the current record.

How to change this contract: Use `DeleteButtonComponent` in authorised form action areas and retain its confirmation semantics.

| Member | Contract | Default | Purpose |
|---|---|---|---|
| `confirmationMessage` | `string` | `` | An optional confirmation message shown to the user before cancelling.
If not set, the cancel action proceeds without confirmation. |
| `confirmationTitle` | `string` | `` | The title of the confirmation dialog. |
| `cancelButtonMessage` | `string` | `` | The label for the cancel button in the confirmation dialog. |
| `confirmButtonMessage` | `string` | `` | The label for the confirm button in the confirmation dialog. |
| `buttonCssClasses` | `string` | `` | CSS classes to apply to the main cancel button element.
Example: 'btn-warning' or 'btn btn-warning'. |
| `closeOnDelete` | `boolean` | `` | Whether to 'close' the form by redirecting on a successful delete. Default false. |
| `redirectLocation` | `string` | `` | The relative url to redirect to on a successful delete if closeOnDelete is true.
Leave empty to use the browser's location.back. |
| `redirectDelaySeconds` | `number` | `` | The delay before redirecting on a successful delete if closeOnDelete is true.
Default is 3 seconds delay. |
| `onItemSelect` | `{ rawPath: string; clearValue?: unknown; }` | `` |  |
| `readonly` | `boolean` | `` | Whether the component is read-only or not.

Note that readonly affects only the component's interactivity.
Readonly is separate from disabled, they can be set independently. |
| `visible` | `boolean` | `` | Whether the component is visible or not. |
| `editMode` | `boolean` | `` | Whether the component is in edit mode or not. |
| `label` | `string` | `` | The label text translation message id. |
| `defaultComponentCssClasses` | `KeyValueStringProperty` | `` | The form-supplied css classes |
| `hostCssClasses` | `KeyValueStringProperty` | `` | The css classes to bind to host |
| `wrapperCssClasses` | `KeyValueStringProperty` | `` | The wrapper css classes to bind to host |
| `disabled` | `boolean` | `` | Whether the component is disabled or not.

Note that disabled affects only the component's interactivity.
Disabled is separate from readonly, they can be set independently. |
| `autofocus` | `boolean` | `` | Whether the component has autofocus or not. |
| `tooltip` | `string` | `` | The tooltip text translation message id. |
| `showValidIndicator` | `boolean` | `` | Whether to show a visual valid indicator (e.g. Bootstrap is-valid style) when the field has no errors.
Defaults to false. |
| `syncSources` | `SyncSourceEntry[]` | `` | Declares source fields for one-way additive sync. |

## DropdownInputComponent

- Kind: form-component
- Lifecycle: supported
- Source: [packages/sails-ng-common/src/config/component/dropdown-input.outline.ts:92](https://github.com/redbox-mint/redbox-portal/blob/09c66809c8032dd3ac39aa5d4b886a389861a828/packages/sails-ng-common/src/config/component/dropdown-input.outline.ts#L92)

Configures a dropdown backed by inline options or a ReDBox vocabulary.

How to change this contract: Use `DropdownInputComponent` with `DropdownInputModel`; hooks may supply vocabulary configuration while retaining the documented value contract.

| Member | Contract | Default | Purpose |
|---|---|---|---|
| `placeholder` | `string` | `` |  |
| `options` | `DropdownOption[]` | `[]` |  |
| `vocabRef` | `string` | `` |  |
| `inlineVocab` | `boolean` | `` |  |
| `historicalVocabMode` | `HistoricalVocabMode` | `` |  |
| `onItemSelect` | `{ rawPath: string; clearValue?: unknown; }` | `` |  |
| `readonly` | `boolean` | `` | Whether the component is read-only or not.

Note that readonly affects only the component's interactivity.
Readonly is separate from disabled, they can be set independently. |
| `visible` | `boolean` | `` | Whether the component is visible or not. |
| `editMode` | `boolean` | `` | Whether the component is in edit mode or not. |
| `label` | `string` | `` | The label text translation message id. |
| `defaultComponentCssClasses` | `KeyValueStringProperty` | `` | The form-supplied css classes |
| `hostCssClasses` | `KeyValueStringProperty` | `` | The css classes to bind to host |
| `wrapperCssClasses` | `KeyValueStringProperty` | `` | The wrapper css classes to bind to host |
| `disabled` | `boolean` | `` | Whether the component is disabled or not.

Note that disabled affects only the component's interactivity.
Disabled is separate from readonly, they can be set independently. |
| `autofocus` | `boolean` | `` | Whether the component has autofocus or not. |
| `tooltip` | `string` | `` | The tooltip text translation message id. |
| `showValidIndicator` | `boolean` | `` | Whether to show a visual valid indicator (e.g. Bootstrap is-valid style) when the field has no errors.
Defaults to false. |
| `syncSources` | `SyncSourceEntry[]` | `` | Declares source fields for one-way additive sync. |

## FileUploadComponent

- Kind: form-component
- Lifecycle: supported
- Source: [packages/sails-ng-common/src/config/component/file-upload.outline.ts:103](https://github.com/redbox-mint/redbox-portal/blob/09c66809c8032dd3ac39aa5d4b886a389861a828/packages/sails-ng-common/src/config/component/file-upload.outline.ts#L103)

Configures attachment upload and the associated persisted file metadata.

How to change this contract: Use `FileUploadComponent` with `FileUploadModel` for local or provider-backed attachments.

| Member | Contract | Default | Purpose |
|---|---|---|---|
| `restrictions` | `Record<string, unknown>` | `` |  |
| `enabledSources` | `FileUploadSourceType[]` | `[]` |  |
| `companionUrl` | `string` | `` |  |
| `allowUploadWithoutSave` | `boolean` | `false` |  |
| `uppyDashboardNote` | `string` | `"Maximum upload size: 1 Gb per file"` |  |
| `tusHeaders` | `Record<string, string>` | `` |  |
| `onItemSelect` | `{ rawPath: string; clearValue?: unknown; }` | `` |  |
| `readonly` | `boolean` | `` | Whether the component is read-only or not.

Note that readonly affects only the component's interactivity.
Readonly is separate from disabled, they can be set independently. |
| `visible` | `boolean` | `` | Whether the component is visible or not. |
| `editMode` | `boolean` | `` | Whether the component is in edit mode or not. |
| `label` | `string` | `` | The label text translation message id. |
| `defaultComponentCssClasses` | `KeyValueStringProperty` | `` | The form-supplied css classes |
| `hostCssClasses` | `KeyValueStringProperty` | `` | The css classes to bind to host |
| `wrapperCssClasses` | `KeyValueStringProperty` | `` | The wrapper css classes to bind to host |
| `disabled` | `boolean` | `` | Whether the component is disabled or not.

Note that disabled affects only the component's interactivity.
Disabled is separate from readonly, they can be set independently. |
| `autofocus` | `boolean` | `` | Whether the component has autofocus or not. |
| `tooltip` | `string` | `` | The tooltip text translation message id. |
| `showValidIndicator` | `boolean` | `` | Whether to show a visual valid indicator (e.g. Bootstrap is-valid style) when the field has no errors.
Defaults to false. |
| `syncSources` | `SyncSourceEntry[]` | `` | Declares source fields for one-way additive sync. |

## GroupComponent

- Kind: form-component
- Lifecycle: supported
- Source: [packages/sails-ng-common/src/config/component/group.outline.ts:87](https://github.com/redbox-mint/redbox-portal/blob/09c66809c8032dd3ac39aa5d4b886a389861a828/packages/sails-ng-common/src/config/component/group.outline.ts#L87)

Groups child form definitions and their values into a structured object.

How to change this contract: Use `GroupComponent` with `GroupModel` to create a nested form section and model scope.

| Member | Contract | Default | Purpose |
|---|---|---|---|
| `componentDefinitions` | `(import("packages/sails-ng-common/src/index").AccordionPanelFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").TabContentFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").RepeatableFormComponentDefinitionOutline \| GroupFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").SaveButtonFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").SaveStatusFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").IntegrationStatusFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").CancelButtonFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").DeleteButtonFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").TabNavButtonFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").TextAreaFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").ContentFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").SimpleInputFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").ValidationSummaryFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").SuggestedValidationSummaryFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").TabFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").AccordionFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").CheckboxInputFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").DropdownInputFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").RadioInputFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").DateInputFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").ReusableFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").QuestionTreeFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").CheckboxTreeFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").RecordSelectorFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").TypeaheadInputFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").RichTextEditorFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").MapFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").FileUploadFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").PDFListFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").RecordMetadataRetrieverFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").DataLocationFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").PublishDataLocationRefreshFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").PublishDataLocationSelectorFormComponentDefinitionOutline)[]` | `` |  |
| `onItemSelect` | `{ rawPath: string; clearValue?: unknown; }` | `` |  |
| `readonly` | `boolean` | `` | Whether the component is read-only or not.

Note that readonly affects only the component's interactivity.
Readonly is separate from disabled, they can be set independently. |
| `visible` | `boolean` | `` | Whether the component is visible or not. |
| `editMode` | `boolean` | `` | Whether the component is in edit mode or not. |
| `label` | `string` | `` | The label text translation message id. |
| `defaultComponentCssClasses` | `KeyValueStringProperty` | `` | The form-supplied css classes |
| `hostCssClasses` | `KeyValueStringProperty` | `` | The css classes to bind to host |
| `wrapperCssClasses` | `KeyValueStringProperty` | `` | The wrapper css classes to bind to host |
| `disabled` | `boolean` | `` | Whether the component is disabled or not.

Note that disabled affects only the component's interactivity.
Disabled is separate from readonly, they can be set independently. |
| `autofocus` | `boolean` | `` | Whether the component has autofocus or not. |
| `tooltip` | `string` | `` | The tooltip text translation message id. |
| `showValidIndicator` | `boolean` | `` | Whether to show a visual valid indicator (e.g. Bootstrap is-valid style) when the field has no errors.
Defaults to false. |
| `syncSources` | `SyncSourceEntry[]` | `` | Declares source fields for one-way additive sync. |

## IntegrationStatusComponent

- Kind: form-component
- Lifecycle: supported
- Source: [packages/sails-ng-common/src/config/component/integration-status.outline.ts:60](https://github.com/redbox-mint/redbox-portal/blob/09c66809c8032dd3ac39aa5d4b886a389861a828/packages/sails-ng-common/src/config/component/integration-status.outline.ts#L60)

Displays status information for configured external integrations.

How to change this contract: Use `IntegrationStatusComponent` to surface integration state without adding a submitted model value.

| Member | Contract | Default | Purpose |
|---|---|---|---|
| `integrationNames` | `string[]` | `` |  |
| `pollIntervalMs` | `number` | `5000` |  |
| `maxPollAttempts` | `number` | `60` |  |
| `rapidPollDurationMs` | `number` | `3000` |  |
| `rapidPollIntervalMs` | `number` | `100` |  |
| `heading` | `string` | `` |  |
| `technicalDetailRoles` | `string[]` | `['Admin', 'Librarians']` |  |
| `hideWhenInactive` | `boolean` | `false` |  |
| `onItemSelect` | `{ rawPath: string; clearValue?: unknown; }` | `` |  |
| `readonly` | `boolean` | `` | Whether the component is read-only or not.

Note that readonly affects only the component's interactivity.
Readonly is separate from disabled, they can be set independently. |
| `visible` | `boolean` | `` | Whether the component is visible or not. |
| `editMode` | `boolean` | `` | Whether the component is in edit mode or not. |
| `label` | `string` | `` | The label text translation message id. |
| `defaultComponentCssClasses` | `KeyValueStringProperty` | `` | The form-supplied css classes |
| `hostCssClasses` | `KeyValueStringProperty` | `` | The css classes to bind to host |
| `wrapperCssClasses` | `KeyValueStringProperty` | `` | The wrapper css classes to bind to host |
| `disabled` | `boolean` | `` | Whether the component is disabled or not.

Note that disabled affects only the component's interactivity.
Disabled is separate from readonly, they can be set independently. |
| `autofocus` | `boolean` | `` | Whether the component has autofocus or not. |
| `tooltip` | `string` | `` | The tooltip text translation message id. |
| `showValidIndicator` | `boolean` | `` | Whether to show a visual valid indicator (e.g. Bootstrap is-valid style) when the field has no errors.
Defaults to false. |
| `syncSources` | `SyncSourceEntry[]` | `` | Declares source fields for one-way additive sync. |

## MapComponent

- Kind: form-component
- Lifecycle: supported
- Source: [packages/sails-ng-common/src/config/component/map.outline.ts:110](https://github.com/redbox-mint/redbox-portal/blob/09c66809c8032dd3ac39aa5d4b886a389861a828/packages/sails-ng-common/src/config/component/map.outline.ts#L110)

Configures interactive geographic feature capture and display.

How to change this contract: Use `MapComponent` with `MapModel` to collect geometry using the supported drawing configuration.

| Member | Contract | Default | Purpose |
|---|---|---|---|
| `center` | `[number, number]` | `[-24.67, 134.07]` |  |
| `zoom` | `number` | `4` |  |
| `mapHeight` | `string` | `"450px"` |  |
| `tileLayers` | `MapTileLayerConfig[]` | `[]` |  |
| `enabledModes` | `MapDrawingMode[]` | `["point", "polygon", "linestring", "rectangle", "circle", "select"]` |  |
| `enableImport` | `boolean` | `true` |  |
| `coordinatesHelp` | `string` | `` |  |
| `coordinatePrecision` | `number` | `15` | Maximum coordinate decimal places retained for TerraDraw. Integer from 0 to 15; defaults to 15. |
| `onItemSelect` | `{ rawPath: string; clearValue?: unknown; }` | `` |  |
| `readonly` | `boolean` | `` | Whether the component is read-only or not.

Note that readonly affects only the component's interactivity.
Readonly is separate from disabled, they can be set independently. |
| `visible` | `boolean` | `` | Whether the component is visible or not. |
| `editMode` | `boolean` | `` | Whether the component is in edit mode or not. |
| `label` | `string` | `` | The label text translation message id. |
| `defaultComponentCssClasses` | `KeyValueStringProperty` | `` | The form-supplied css classes |
| `hostCssClasses` | `KeyValueStringProperty` | `` | The css classes to bind to host |
| `wrapperCssClasses` | `KeyValueStringProperty` | `` | The wrapper css classes to bind to host |
| `disabled` | `boolean` | `` | Whether the component is disabled or not.

Note that disabled affects only the component's interactivity.
Disabled is separate from readonly, they can be set independently. |
| `autofocus` | `boolean` | `` | Whether the component has autofocus or not. |
| `tooltip` | `string` | `` | The tooltip text translation message id. |
| `showValidIndicator` | `boolean` | `` | Whether to show a visual valid indicator (e.g. Bootstrap is-valid style) when the field has no errors.
Defaults to false. |
| `syncSources` | `SyncSourceEntry[]` | `` | Declares source fields for one-way additive sync. |

## PDFListComponent

- Kind: form-component
- Lifecycle: supported
- Source: [packages/sails-ng-common/src/config/component/pdf-list.outline.ts:97](https://github.com/redbox-mint/redbox-portal/blob/09c66809c8032dd3ac39aa5d4b886a389861a828/packages/sails-ng-common/src/config/component/pdf-list.outline.ts#L97)

Displays and models a configured list of PDF resources.

How to change this contract: Use `PDFListComponent` with `PDFListModel` where a form manages PDF entries.

| Member | Contract | Default | Purpose |
|---|---|---|---|
| `startsWith` | `string` | `"rdmp-pdf"` |  |
| `recentPdfLimit` | `number` | `5` |  |
| `showVersionCounter` | `boolean` | `false` |  |
| `showVersionColumn` | `boolean` | `false` |  |
| `versionColumnValueField` | `string` | `""` |  |
| `versionColumnLabelKey` | `string` | `""` |  |
| `useVersionLabelForFileName` | `boolean` | `false` |  |
| `downloadBtnLabel` | `string` | `"@pdf-download"` |  |
| `downloadPreviousBtnLabel` | `string` | `"@pdf-download-previous"` |  |
| `downloadPrefix` | `string` | `"rdmp"` |  |
| `fileNameTemplate` | `string` | `""` |  |
| `onItemSelect` | `{ rawPath: string; clearValue?: unknown; }` | `` |  |
| `readonly` | `boolean` | `` | Whether the component is read-only or not.

Note that readonly affects only the component's interactivity.
Readonly is separate from disabled, they can be set independently. |
| `visible` | `boolean` | `` | Whether the component is visible or not. |
| `editMode` | `boolean` | `` | Whether the component is in edit mode or not. |
| `label` | `string` | `` | The label text translation message id. |
| `defaultComponentCssClasses` | `KeyValueStringProperty` | `` | The form-supplied css classes |
| `hostCssClasses` | `KeyValueStringProperty` | `` | The css classes to bind to host |
| `wrapperCssClasses` | `KeyValueStringProperty` | `` | The wrapper css classes to bind to host |
| `disabled` | `boolean` | `` | Whether the component is disabled or not.

Note that disabled affects only the component's interactivity.
Disabled is separate from readonly, they can be set independently. |
| `autofocus` | `boolean` | `` | Whether the component has autofocus or not. |
| `tooltip` | `string` | `` | The tooltip text translation message id. |
| `showValidIndicator` | `boolean` | `` | Whether to show a visual valid indicator (e.g. Bootstrap is-valid style) when the field has no errors.
Defaults to false. |
| `syncSources` | `SyncSourceEntry[]` | `` | Declares source fields for one-way additive sync. |

## PublishDataLocationRefreshComponent

- Kind: form-component
- Lifecycle: supported
- Source: [packages/sails-ng-common/src/config/component/publish-data-location-refresh.outline.ts:65](https://github.com/redbox-mint/redbox-portal/blob/09c66809c8032dd3ac39aa5d4b886a389861a828/packages/sails-ng-common/src/config/component/publish-data-location-refresh.outline.ts#L65)

Configures the action that refreshes publishable data-location state.

How to change this contract: Use `PublishDataLocationRefreshComponent` alongside the publish data-location selector; it intentionally has no backing model.

| Member | Contract | Default | Purpose |
|---|---|---|---|
| `eventFieldId` | `string` | `` | Optional explicit field id for emitted refresh events. When omitted, the
component emits using its own resolved lineage path. |
| `onItemSelect` | `{ rawPath: string; clearValue?: unknown; }` | `` |  |
| `readonly` | `boolean` | `` | Whether the component is read-only or not.

Note that readonly affects only the component's interactivity.
Readonly is separate from disabled, they can be set independently. |
| `visible` | `boolean` | `` | Whether the component is visible or not. |
| `editMode` | `boolean` | `` | Whether the component is in edit mode or not. |
| `label` | `string` | `` | The label text translation message id. |
| `defaultComponentCssClasses` | `KeyValueStringProperty` | `` | The form-supplied css classes |
| `hostCssClasses` | `KeyValueStringProperty` | `` | The css classes to bind to host |
| `wrapperCssClasses` | `KeyValueStringProperty` | `` | The wrapper css classes to bind to host |
| `disabled` | `boolean` | `` | Whether the component is disabled or not.

Note that disabled affects only the component's interactivity.
Disabled is separate from readonly, they can be set independently. |
| `autofocus` | `boolean` | `` | Whether the component has autofocus or not. |
| `tooltip` | `string` | `` | The tooltip text translation message id. |
| `showValidIndicator` | `boolean` | `` | Whether to show a visual valid indicator (e.g. Bootstrap is-valid style) when the field has no errors.
Defaults to false. |
| `syncSources` | `SyncSourceEntry[]` | `` | Declares source fields for one-way additive sync. |

## PublishDataLocationSelectorComponent

- Kind: form-component
- Lifecycle: supported
- Source: [packages/sails-ng-common/src/config/component/publish-data-location-selector.outline.ts:135](https://github.com/redbox-mint/redbox-portal/blob/09c66809c8032dd3ac39aa5d4b886a389861a828/packages/sails-ng-common/src/config/component/publish-data-location-selector.outline.ts#L135)

Selects a configured data location for publication workflows.

How to change this contract: Use `PublishDataLocationSelectorComponent` with its model to bind publishable location choices.

| Member | Contract | Default | Purpose |
|---|---|---|---|
| `headerActions` | `(import("packages/sails-ng-common/src/index").AccordionPanelFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").TabContentFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").RepeatableFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").GroupFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").SaveButtonFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").SaveStatusFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").IntegrationStatusFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").CancelButtonFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").DeleteButtonFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").TabNavButtonFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").TextAreaFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").ContentFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").SimpleInputFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").ValidationSummaryFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").SuggestedValidationSummaryFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").TabFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").AccordionFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").CheckboxInputFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").DropdownInputFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").RadioInputFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").DateInputFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").ReusableFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").QuestionTreeFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").CheckboxTreeFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").RecordSelectorFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").TypeaheadInputFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").RichTextEditorFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").MapFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").FileUploadFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").PDFListFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").RecordMetadataRetrieverFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/config/component/data-location.outline").DataLocationFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").PublishDataLocationRefreshFormComponentDefinitionOutline \| PublishDataLocationSelectorFormComponentDefinitionOutline)[]` | `[]` |  |
| `columns` | `string[] \| Record<string, unknown>[]` | `[]` |  |
| `editNotesButtonText` | `string` | `"Edit"` |  |
| `editNotesTitle` | `string` | `"Edit Notes"` |  |
| `cancelEditNotesButtonText` | `string` | `"Cancel"` |  |
| `applyEditNotesButtonText` | `string` | `"Apply"` |  |
| `editNotesCssClasses` | `string` | `"form-control"` |  |
| `typeHeader` | `string` | `"Type"` |  |
| `locationHeader` | `string` | `"Location"` |  |
| `notesHeader` | `string` | `"Notes"` |  |
| `iscHeader` | `string` | `"Information Security Classification"` |  |
| `iscEnabled` | `boolean` | `false` |  |
| `notesEnabled` | `boolean` | `true` |  |
| `metadataOnlyTitle` | `string` | `"No data locations selected"` |  |
| `metadataOnlyBody` | `string` | `"Publicise only metadata (or description)"` |  |
| `noLocationsAvailableTitle` | `string` | `"No data locations available"` |  |
| `noLocationsAvailableBody` | `string` | `""` |  |
| `selectionSummaryTemplate` | `string` | `"{{selected}} of {{total}} locations selected for publication"` |  |
| `publicCheck` | `string` | `"public"` |  |
| `selectionCriteria` | `PublishDataLocationSelectionCriterion[]` | `[{ isc: "public", type: "attachment" }]` |  |
| `dataTypes` | `DataLocationOption[]` | `[
    { label: "URL", value: "url" },
    { label: "Physical location", value: "physical" },
    { label: "File path", value: "file" },
    { label: "Attachment", value: "attachment" },
  ]` |  |
| `dataTypeLookup` | `Record<string, string>` | `{
    url: "URL",
    physical: "Physical location",
    file: "File path",
    attachment: "Attachment",
  }` |  |
| `onItemSelect` | `{ rawPath: string; clearValue?: unknown; }` | `` |  |
| `readonly` | `boolean` | `` | Whether the component is read-only or not.

Note that readonly affects only the component's interactivity.
Readonly is separate from disabled, they can be set independently. |
| `visible` | `boolean` | `` | Whether the component is visible or not. |
| `editMode` | `boolean` | `` | Whether the component is in edit mode or not. |
| `label` | `string` | `` | The label text translation message id. |
| `defaultComponentCssClasses` | `KeyValueStringProperty` | `` | The form-supplied css classes |
| `hostCssClasses` | `KeyValueStringProperty` | `` | The css classes to bind to host |
| `wrapperCssClasses` | `KeyValueStringProperty` | `` | The wrapper css classes to bind to host |
| `disabled` | `boolean` | `` | Whether the component is disabled or not.

Note that disabled affects only the component's interactivity.
Disabled is separate from readonly, they can be set independently. |
| `autofocus` | `boolean` | `` | Whether the component has autofocus or not. |
| `tooltip` | `string` | `` | The tooltip text translation message id. |
| `showValidIndicator` | `boolean` | `` | Whether to show a visual valid indicator (e.g. Bootstrap is-valid style) when the field has no errors.
Defaults to false. |
| `syncSources` | `SyncSourceEntry[]` | `` | Declares source fields for one-way additive sync. |

## QuestionTreeComponent

- Kind: form-component
- Lifecycle: supported
- Source: [packages/sails-ng-common/src/config/component/question-tree.outline.ts:341](https://github.com/redbox-mint/redbox-portal/blob/09c66809c8032dd3ac39aa5d4b886a389861a828/packages/sails-ng-common/src/config/component/question-tree.outline.ts#L341)

Configures a branching question tree and its selected answers.

How to change this contract: Use `QuestionTreeComponent` with `QuestionTreeModel` for conditional hierarchical questionnaires.

| Member | Contract | Default | Purpose |
|---|---|---|---|
| `availableOutcomes` | `QuestionTreeOutcome[]` | `` | The available outcome keys and values.

The order of the outcomes is the importance / sensitivity,
from lowest / least at index 0 to highest / most at index length - 1.

Interface only, there is no class for this config property. |
| `availableMeta` | `QuestionTreeMeta` | `` | The additional data that can be included with outcomes.
The additional data has no notion of important / sensitivity.
Interface only, there is no class for this config property. |
| `questions` | `QuestionTreeQuestion[]` | `` | The question definitions.
Interface only, there is no class for this config property. |
| `componentDefinitions` | `(import("packages/sails-ng-common/src/index").AccordionPanelFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").TabContentFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").RepeatableFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").GroupFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").SaveButtonFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").SaveStatusFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").IntegrationStatusFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").CancelButtonFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").DeleteButtonFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").TabNavButtonFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").TextAreaFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").ContentFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").SimpleInputFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").ValidationSummaryFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").SuggestedValidationSummaryFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").TabFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").AccordionFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").CheckboxInputFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").DropdownInputFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").RadioInputFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").DateInputFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").ReusableFormComponentDefinitionOutline \| QuestionTreeFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").CheckboxTreeFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").RecordSelectorFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").TypeaheadInputFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").RichTextEditorFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").MapFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").FileUploadFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").PDFListFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").RecordMetadataRetrieverFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").DataLocationFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").PublishDataLocationRefreshFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").PublishDataLocationSelectorFormComponentDefinitionOutline)[]` | `` |  |
| `onItemSelect` | `{ rawPath: string; clearValue?: unknown; }` | `` |  |
| `readonly` | `boolean` | `` | Whether the component is read-only or not.

Note that readonly affects only the component's interactivity.
Readonly is separate from disabled, they can be set independently. |
| `visible` | `boolean` | `` | Whether the component is visible or not. |
| `editMode` | `boolean` | `` | Whether the component is in edit mode or not. |
| `label` | `string` | `` | The label text translation message id. |
| `defaultComponentCssClasses` | `KeyValueStringProperty` | `` | The form-supplied css classes |
| `hostCssClasses` | `KeyValueStringProperty` | `` | The css classes to bind to host |
| `wrapperCssClasses` | `KeyValueStringProperty` | `` | The wrapper css classes to bind to host |
| `disabled` | `boolean` | `` | Whether the component is disabled or not.

Note that disabled affects only the component's interactivity.
Disabled is separate from readonly, they can be set independently. |
| `autofocus` | `boolean` | `` | Whether the component has autofocus or not. |
| `tooltip` | `string` | `` | The tooltip text translation message id. |
| `showValidIndicator` | `boolean` | `` | Whether to show a visual valid indicator (e.g. Bootstrap is-valid style) when the field has no errors.
Defaults to false. |
| `syncSources` | `SyncSourceEntry[]` | `` | Declares source fields for one-way additive sync. |

## RadioInputComponent

- Kind: form-component
- Lifecycle: supported
- Source: [packages/sails-ng-common/src/config/component/radio-input.outline.ts:90](https://github.com/redbox-mint/redbox-portal/blob/09c66809c8032dd3ac39aa5d4b886a389861a828/packages/sails-ng-common/src/config/component/radio-input.outline.ts#L90)

Configures a single-choice radio group from inline or vocabulary options.

How to change this contract: Use `RadioInputComponent` with `RadioInputModel` to collect one value from the configured choices.

| Member | Contract | Default | Purpose |
|---|---|---|---|
| `options` | `RadioOption[]` | `[]` |  |
| `vocabRef` | `string` | `` |  |
| `inlineVocab` | `boolean` | `` |  |
| `historicalVocabMode` | `HistoricalVocabMode` | `` |  |
| `onItemSelect` | `{ rawPath: string; clearValue?: unknown; }` | `` |  |
| `readonly` | `boolean` | `` | Whether the component is read-only or not.

Note that readonly affects only the component's interactivity.
Readonly is separate from disabled, they can be set independently. |
| `visible` | `boolean` | `` | Whether the component is visible or not. |
| `editMode` | `boolean` | `` | Whether the component is in edit mode or not. |
| `label` | `string` | `` | The label text translation message id. |
| `defaultComponentCssClasses` | `KeyValueStringProperty` | `` | The form-supplied css classes |
| `hostCssClasses` | `KeyValueStringProperty` | `` | The css classes to bind to host |
| `wrapperCssClasses` | `KeyValueStringProperty` | `` | The wrapper css classes to bind to host |
| `disabled` | `boolean` | `` | Whether the component is disabled or not.

Note that disabled affects only the component's interactivity.
Disabled is separate from readonly, they can be set independently. |
| `autofocus` | `boolean` | `` | Whether the component has autofocus or not. |
| `tooltip` | `string` | `` | The tooltip text translation message id. |
| `showValidIndicator` | `boolean` | `` | Whether to show a visual valid indicator (e.g. Bootstrap is-valid style) when the field has no errors.
Defaults to false. |
| `syncSources` | `SyncSourceEntry[]` | `` | Declares source fields for one-way additive sync. |

## RecordMetadataRetrieverComponent

- Kind: form-component
- Lifecycle: supported
- Source: [packages/sails-ng-common/src/config/component/record-metadata-retriever.outline.ts:54](https://github.com/redbox-mint/redbox-portal/blob/09c66809c8032dd3ac39aa5d4b886a389861a828/packages/sails-ng-common/src/config/component/record-metadata-retriever.outline.ts#L54)

Configures retrieval of metadata from a related ReDBox record.

How to change this contract: Use `RecordMetadataRetrieverComponent` to populate form state through the supported record metadata lookup contract.

| Member | Contract | Default | Purpose |
|---|---|---|---|
| `onItemSelect` | `{ rawPath: string; clearValue?: unknown; }` | `` |  |
| `readonly` | `boolean` | `` | Whether the component is read-only or not.

Note that readonly affects only the component's interactivity.
Readonly is separate from disabled, they can be set independently. |
| `visible` | `boolean` | `` | Whether the component is visible or not. |
| `editMode` | `boolean` | `` | Whether the component is in edit mode or not. |
| `label` | `string` | `` | The label text translation message id. |
| `defaultComponentCssClasses` | `KeyValueStringProperty` | `` | The form-supplied css classes |
| `hostCssClasses` | `KeyValueStringProperty` | `` | The css classes to bind to host |
| `wrapperCssClasses` | `KeyValueStringProperty` | `` | The wrapper css classes to bind to host |
| `disabled` | `boolean` | `` | Whether the component is disabled or not.

Note that disabled affects only the component's interactivity.
Disabled is separate from readonly, they can be set independently. |
| `autofocus` | `boolean` | `` | Whether the component has autofocus or not. |
| `tooltip` | `string` | `` | The tooltip text translation message id. |
| `showValidIndicator` | `boolean` | `` | Whether to show a visual valid indicator (e.g. Bootstrap is-valid style) when the field has no errors.
Defaults to false. |
| `syncSources` | `SyncSourceEntry[]` | `` | Declares source fields for one-way additive sync. |

## RecordSelectorComponent

- Kind: form-component
- Lifecycle: supported
- Source: [packages/sails-ng-common/src/config/component/record-selector.outline.ts:96](https://github.com/redbox-mint/redbox-portal/blob/09c66809c8032dd3ac39aa5d4b886a389861a828/packages/sails-ng-common/src/config/component/record-selector.outline.ts#L96)

Configures lookup and selection of another ReDBox record.

How to change this contract: Use `RecordSelectorComponent` with `RecordSelectorModel` for relationship or record-reference fields.

| Member | Contract | Default | Purpose |
|---|---|---|---|
| `columnTitle` | `string` | `'Record title'` |  |
| `relationshipId` | `string` | `` |  |
| `recordType` | `string` | `` |  |
| `workflowState` | `string` | `''` |  |
| `filterMode` | `string` | `'default'` |  |
| `filterFields` | `string[]` | `[]` |  |
| `onItemSelect` | `{ rawPath: string; clearValue?: unknown; }` | `` |  |
| `readonly` | `boolean` | `` | Whether the component is read-only or not.

Note that readonly affects only the component's interactivity.
Readonly is separate from disabled, they can be set independently. |
| `visible` | `boolean` | `` | Whether the component is visible or not. |
| `editMode` | `boolean` | `` | Whether the component is in edit mode or not. |
| `label` | `string` | `` | The label text translation message id. |
| `defaultComponentCssClasses` | `KeyValueStringProperty` | `` | The form-supplied css classes |
| `hostCssClasses` | `KeyValueStringProperty` | `` | The css classes to bind to host |
| `wrapperCssClasses` | `KeyValueStringProperty` | `` | The wrapper css classes to bind to host |
| `disabled` | `boolean` | `` | Whether the component is disabled or not.

Note that disabled affects only the component's interactivity.
Disabled is separate from readonly, they can be set independently. |
| `autofocus` | `boolean` | `` | Whether the component has autofocus or not. |
| `tooltip` | `string` | `` | The tooltip text translation message id. |
| `showValidIndicator` | `boolean` | `` | Whether to show a visual valid indicator (e.g. Bootstrap is-valid style) when the field has no errors.
Defaults to false. |
| `syncSources` | `SyncSourceEntry[]` | `` | Declares source fields for one-way additive sync. |

## RepeatableComponent

- Kind: form-component
- Lifecycle: supported
- Source: [packages/sails-ng-common/src/config/component/repeatable.outline.ts:133](https://github.com/redbox-mint/redbox-portal/blob/09c66809c8032dd3ac39aa5d4b886a389861a828/packages/sails-ng-common/src/config/component/repeatable.outline.ts#L133)

Repeats a configured element template and models the resulting array of values.

How to change this contract: Use `RepeatableComponent` with `RepeatableModel` for zero-or-more structured form entries.

| Member | Contract | Default | Purpose |
|---|---|---|---|
| `elementTemplate` | `import("packages/sails-ng-common/src/index").AccordionPanelFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").TabContentFormComponentDefinitionOutline \| RepeatableFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").GroupFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").SaveButtonFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").SaveStatusFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").IntegrationStatusFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").CancelButtonFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").DeleteButtonFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").TabNavButtonFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").TextAreaFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").ContentFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").SimpleInputFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").ValidationSummaryFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").SuggestedValidationSummaryFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").TabFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").AccordionFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").CheckboxInputFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").DropdownInputFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").RadioInputFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").DateInputFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").ReusableFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").QuestionTreeFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").CheckboxTreeFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").RecordSelectorFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").TypeaheadInputFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").RichTextEditorFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").MapFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").FileUploadFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").PDFListFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").RecordMetadataRetrieverFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").DataLocationFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").PublishDataLocationRefreshFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").PublishDataLocationSelectorFormComponentDefinitionOutline` | `` |  |
| `addButtonShow` | `boolean` | `true` |  |
| `allowZeroRows` | `boolean` | `false` |  |
| `hideWhenZeroRows` | `boolean` | `false` |  |
| `canSort` | `boolean` | `` |  |
| `onItemSelect` | `{ rawPath: string; clearValue?: unknown; }` | `` |  |
| `readonly` | `boolean` | `` | Whether the component is read-only or not.

Note that readonly affects only the component's interactivity.
Readonly is separate from disabled, they can be set independently. |
| `visible` | `boolean` | `` | Whether the component is visible or not. |
| `editMode` | `boolean` | `` | Whether the component is in edit mode or not. |
| `label` | `string` | `` | The label text translation message id. |
| `defaultComponentCssClasses` | `KeyValueStringProperty` | `` | The form-supplied css classes |
| `hostCssClasses` | `KeyValueStringProperty` | `` | The css classes to bind to host |
| `wrapperCssClasses` | `KeyValueStringProperty` | `` | The wrapper css classes to bind to host |
| `disabled` | `boolean` | `` | Whether the component is disabled or not.

Note that disabled affects only the component's interactivity.
Disabled is separate from readonly, they can be set independently. |
| `autofocus` | `boolean` | `` | Whether the component has autofocus or not. |
| `tooltip` | `string` | `` | The tooltip text translation message id. |
| `showValidIndicator` | `boolean` | `` | Whether to show a visual valid indicator (e.g. Bootstrap is-valid style) when the field has no errors.
Defaults to false. |
| `syncSources` | `SyncSourceEntry[]` | `` | Declares source fields for one-way additive sync. |

## ReusableComponent

- Kind: form-component
- Lifecycle: supported
- Source: [packages/sails-ng-common/src/config/component/reusable.outline.ts:50](https://github.com/redbox-mint/redbox-portal/blob/09c66809c8032dd3ac39aa5d4b886a389861a828/packages/sails-ng-common/src/config/component/reusable.outline.ts#L50)

References a reusable form definition that the construction visitor expands.

How to change this contract: Use `ReusableComponent` to compose named reusable definitions; it is a construction-time contract rather than an Angular component.

| Member | Contract | Default | Purpose |
|---|---|---|---|
| `componentDefinitions` | `(import("packages/sails-ng-common/src/index").AccordionPanelFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").TabContentFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").RepeatableFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").GroupFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").SaveButtonFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").SaveStatusFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").IntegrationStatusFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").CancelButtonFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").DeleteButtonFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").TabNavButtonFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").TextAreaFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").ContentFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").SimpleInputFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").ValidationSummaryFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").SuggestedValidationSummaryFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").TabFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").AccordionFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").CheckboxInputFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").DropdownInputFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").RadioInputFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").DateInputFormComponentDefinitionOutline \| ReusableFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").QuestionTreeFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").CheckboxTreeFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").RecordSelectorFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").TypeaheadInputFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").RichTextEditorFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").MapFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").FileUploadFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").PDFListFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").RecordMetadataRetrieverFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").DataLocationFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").PublishDataLocationRefreshFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").PublishDataLocationSelectorFormComponentDefinitionOutline)[]` | `` |  |
| `onItemSelect` | `{ rawPath: string; clearValue?: unknown; }` | `` |  |
| `readonly` | `boolean` | `` | Whether the component is read-only or not.

Note that readonly affects only the component's interactivity.
Readonly is separate from disabled, they can be set independently. |
| `visible` | `boolean` | `` | Whether the component is visible or not. |
| `editMode` | `boolean` | `` | Whether the component is in edit mode or not. |
| `label` | `string` | `` | The label text translation message id. |
| `defaultComponentCssClasses` | `KeyValueStringProperty` | `` | The form-supplied css classes |
| `hostCssClasses` | `KeyValueStringProperty` | `` | The css classes to bind to host |
| `wrapperCssClasses` | `KeyValueStringProperty` | `` | The wrapper css classes to bind to host |
| `disabled` | `boolean` | `` | Whether the component is disabled or not.

Note that disabled affects only the component's interactivity.
Disabled is separate from readonly, they can be set independently. |
| `autofocus` | `boolean` | `` | Whether the component has autofocus or not. |
| `tooltip` | `string` | `` | The tooltip text translation message id. |
| `showValidIndicator` | `boolean` | `` | Whether to show a visual valid indicator (e.g. Bootstrap is-valid style) when the field has no errors.
Defaults to false. |
| `syncSources` | `SyncSourceEntry[]` | `` | Declares source fields for one-way additive sync. |

## RichTextEditorComponent

- Kind: form-component
- Lifecycle: supported
- Source: [packages/sails-ng-common/src/config/component/rich-text-editor.outline.ts:91](https://github.com/redbox-mint/redbox-portal/blob/09c66809c8032dd3ac39aa5d4b886a389861a828/packages/sails-ng-common/src/config/component/rich-text-editor.outline.ts#L91)

Configures rich-text editing and its serialised text value.

How to change this contract: Use `RichTextEditorComponent` with `RichTextEditorModel` for formatted long-form content.

| Member | Contract | Default | Purpose |
|---|---|---|---|
| `outputFormat` | `RichTextEditorOutputFormatType` | `"html"` |  |
| `showSourceToggle` | `boolean` | `false` |  |
| `toolbar` | `string[]` | `[...defaultToolbar]` |  |
| `minHeight` | `string` | `"200px"` |  |
| `placeholder` | `string` | `""` |  |
| `onItemSelect` | `{ rawPath: string; clearValue?: unknown; }` | `` |  |
| `readonly` | `boolean` | `` | Whether the component is read-only or not.

Note that readonly affects only the component's interactivity.
Readonly is separate from disabled, they can be set independently. |
| `visible` | `boolean` | `` | Whether the component is visible or not. |
| `editMode` | `boolean` | `` | Whether the component is in edit mode or not. |
| `label` | `string` | `` | The label text translation message id. |
| `defaultComponentCssClasses` | `KeyValueStringProperty` | `` | The form-supplied css classes |
| `hostCssClasses` | `KeyValueStringProperty` | `` | The css classes to bind to host |
| `wrapperCssClasses` | `KeyValueStringProperty` | `` | The wrapper css classes to bind to host |
| `disabled` | `boolean` | `` | Whether the component is disabled or not.

Note that disabled affects only the component's interactivity.
Disabled is separate from readonly, they can be set independently. |
| `autofocus` | `boolean` | `` | Whether the component has autofocus or not. |
| `tooltip` | `string` | `` | The tooltip text translation message id. |
| `showValidIndicator` | `boolean` | `` | Whether to show a visual valid indicator (e.g. Bootstrap is-valid style) when the field has no errors.
Defaults to false. |
| `syncSources` | `SyncSourceEntry[]` | `` | Declares source fields for one-way additive sync. |

## SaveButtonComponent

- Kind: form-component
- Lifecycle: supported
- Source: [packages/sails-ng-common/src/config/component/save-button.outline.ts:87](https://github.com/redbox-mint/redbox-portal/blob/09c66809c8032dd3ac39aa5d4b886a389861a828/packages/sails-ng-common/src/config/component/save-button.outline.ts#L87)

Configures the primary form save action.

How to change this contract: Use `SaveButtonComponent` in form action areas and configure its supported label and save behaviour.

| Member | Contract | Default | Purpose |
|---|---|---|---|
| `targetStep` | `string` | `` | Try to transition to this workflow step as part of the save process on the server. |
| `forceSave` | `boolean` | `` | Save the form, even if it would otherwise not be able to save.
For example, save even if nothing has changed or there are validation failures. |
| `labelSaving` | `string` | `` | The label to set to the button while saving. |
| `buttonCssClasses` | `string` | `` | CSS classes to apply to the underlying button element.
Example: 'btn-success' or 'btn btn-success'. |
| `enabledValidationGroups` | `string[]` | `` | Validation groups to enable for this save request.
Defaults to the form's current enabled validation groups. |
| `closeOnSave` | `boolean` | `` | Whether to 'close' the form by redirecting on a successful save. Default false. |
| `redirectLocation` | `string` | `` | The relative url to redirect to on a successful save if closeOnSave is true.
Leave empty to use the browser's location.back. |
| `redirectDelaySeconds` | `number` | `` | The delay before redirecting on a successful save if closeOnSave is true.
Default is 3 seconds delay. |
| `onItemSelect` | `{ rawPath: string; clearValue?: unknown; }` | `` |  |
| `readonly` | `boolean` | `` | Whether the component is read-only or not.

Note that readonly affects only the component's interactivity.
Readonly is separate from disabled, they can be set independently. |
| `visible` | `boolean` | `` | Whether the component is visible or not. |
| `editMode` | `boolean` | `` | Whether the component is in edit mode or not. |
| `label` | `string` | `` | The label text translation message id. |
| `defaultComponentCssClasses` | `KeyValueStringProperty` | `` | The form-supplied css classes |
| `hostCssClasses` | `KeyValueStringProperty` | `` | The css classes to bind to host |
| `wrapperCssClasses` | `KeyValueStringProperty` | `` | The wrapper css classes to bind to host |
| `disabled` | `boolean` | `` | Whether the component is disabled or not.

Note that disabled affects only the component's interactivity.
Disabled is separate from readonly, they can be set independently. |
| `autofocus` | `boolean` | `` | Whether the component has autofocus or not. |
| `tooltip` | `string` | `` | The tooltip text translation message id. |
| `showValidIndicator` | `boolean` | `` | Whether to show a visual valid indicator (e.g. Bootstrap is-valid style) when the field has no errors.
Defaults to false. |
| `syncSources` | `SyncSourceEntry[]` | `` | Declares source fields for one-way additive sync. |

## SaveStatusComponent

- Kind: form-component
- Lifecycle: supported
- Source: [packages/sails-ng-common/src/config/component/save-status.outline.ts:54](https://github.com/redbox-mint/redbox-portal/blob/09c66809c8032dd3ac39aa5d4b886a389861a828/packages/sails-ng-common/src/config/component/save-status.outline.ts#L54)

Displays current form save progress and result state.

How to change this contract: Use `SaveStatusComponent` alongside save controls without adding a submitted model value.

| Member | Contract | Default | Purpose |
|---|---|---|---|
| `successDisplayDurationMs` | `number` | `3000` | How long to keep the success message visible after a save succeeds.
Defaults to 3000 milliseconds. |
| `onItemSelect` | `{ rawPath: string; clearValue?: unknown; }` | `` |  |
| `readonly` | `boolean` | `` | Whether the component is read-only or not.

Note that readonly affects only the component's interactivity.
Readonly is separate from disabled, they can be set independently. |
| `visible` | `boolean` | `` | Whether the component is visible or not. |
| `editMode` | `boolean` | `` | Whether the component is in edit mode or not. |
| `label` | `string` | `` | The label text translation message id. |
| `defaultComponentCssClasses` | `KeyValueStringProperty` | `` | The form-supplied css classes |
| `hostCssClasses` | `KeyValueStringProperty` | `` | The css classes to bind to host |
| `wrapperCssClasses` | `KeyValueStringProperty` | `` | The wrapper css classes to bind to host |
| `disabled` | `boolean` | `` | Whether the component is disabled or not.

Note that disabled affects only the component's interactivity.
Disabled is separate from readonly, they can be set independently. |
| `autofocus` | `boolean` | `` | Whether the component has autofocus or not. |
| `tooltip` | `string` | `` | The tooltip text translation message id. |
| `showValidIndicator` | `boolean` | `` | Whether to show a visual valid indicator (e.g. Bootstrap is-valid style) when the field has no errors.
Defaults to false. |
| `syncSources` | `SyncSourceEntry[]` | `` | Declares source fields for one-way additive sync. |

## SimpleInputComponent

- Kind: form-component
- Lifecycle: supported
- Source: [packages/sails-ng-common/src/config/component/simple-input.outline.ts:86](https://github.com/redbox-mint/redbox-portal/blob/09c66809c8032dd3ac39aa5d4b886a389861a828/packages/sails-ng-common/src/config/component/simple-input.outline.ts#L86)

Configures a single-line textual, numeric, password, URL, telephone, or hidden input.

How to change this contract: Use `SimpleInputComponent` with `SimpleInputModel` in a FormConfig component definition; hooks may extend its configuration through the normal form component registration path.

| Member | Contract | Default | Purpose |
|---|---|---|---|
| `placeholder` | `string` | `''` |  |
| `type` | `"number" \| "text" \| "hidden" \| "url" \| "email" \| "tel" \| "password"` | `"text"` |  |
| `onItemSelect` | `{ rawPath: string; clearValue?: unknown; }` | `` |  |
| `readonly` | `boolean` | `` | Whether the component is read-only or not.

Note that readonly affects only the component's interactivity.
Readonly is separate from disabled, they can be set independently. |
| `visible` | `boolean` | `` | Whether the component is visible or not. |
| `editMode` | `boolean` | `` | Whether the component is in edit mode or not. |
| `label` | `string` | `` | The label text translation message id. |
| `defaultComponentCssClasses` | `KeyValueStringProperty` | `` | The form-supplied css classes |
| `hostCssClasses` | `KeyValueStringProperty` | `` | The css classes to bind to host |
| `wrapperCssClasses` | `KeyValueStringProperty` | `` | The wrapper css classes to bind to host |
| `disabled` | `boolean` | `` | Whether the component is disabled or not.

Note that disabled affects only the component's interactivity.
Disabled is separate from readonly, they can be set independently. |
| `autofocus` | `boolean` | `` | Whether the component has autofocus or not. |
| `tooltip` | `string` | `` | The tooltip text translation message id. |
| `showValidIndicator` | `boolean` | `` | Whether to show a visual valid indicator (e.g. Bootstrap is-valid style) when the field has no errors.
Defaults to false. |
| `syncSources` | `SyncSourceEntry[]` | `` | Declares source fields for one-way additive sync. |

## SuggestedValidationSummaryComponent

- Kind: form-component
- Lifecycle: supported
- Source: [packages/sails-ng-common/src/config/component/suggested-validation-summary.outline.ts:55](https://github.com/redbox-mint/redbox-portal/blob/09c66809c8032dd3ac39aa5d4b886a389861a828/packages/sails-ng-common/src/config/component/suggested-validation-summary.outline.ts#L55)

Displays advisory validation suggestions separately from blocking errors.

How to change this contract: Use `SuggestedValidationSummaryComponent` to present configured non-blocking validation feedback.

| Member | Contract | Default | Purpose |
|---|---|---|---|
| `enabledValidationGroups` | `string[]` | `[]` |  |
| `includeTabLabel` | `boolean` | `false` |  |
| `showWhenValid` | `boolean` | `false` |  |
| `header` | `string` | `"@dmpt-form-suggested-validation-summary-header"` |  |
| `onItemSelect` | `{ rawPath: string; clearValue?: unknown; }` | `` |  |
| `readonly` | `boolean` | `` | Whether the component is read-only or not.

Note that readonly affects only the component's interactivity.
Readonly is separate from disabled, they can be set independently. |
| `visible` | `boolean` | `` | Whether the component is visible or not. |
| `editMode` | `boolean` | `` | Whether the component is in edit mode or not. |
| `label` | `string` | `` | The label text translation message id. |
| `defaultComponentCssClasses` | `KeyValueStringProperty` | `` | The form-supplied css classes |
| `hostCssClasses` | `KeyValueStringProperty` | `` | The css classes to bind to host |
| `wrapperCssClasses` | `KeyValueStringProperty` | `` | The wrapper css classes to bind to host |
| `disabled` | `boolean` | `` | Whether the component is disabled or not.

Note that disabled affects only the component's interactivity.
Disabled is separate from readonly, they can be set independently. |
| `autofocus` | `boolean` | `` | Whether the component has autofocus or not. |
| `tooltip` | `string` | `` | The tooltip text translation message id. |
| `showValidIndicator` | `boolean` | `` | Whether to show a visual valid indicator (e.g. Bootstrap is-valid style) when the field has no errors.
Defaults to false. |
| `syncSources` | `SyncSourceEntry[]` | `` | Declares source fields for one-way additive sync. |

## TabComponent

- Kind: form-component
- Lifecycle: supported
- Source: [packages/sails-ng-common/src/config/component/tab.outline.ts:110](https://github.com/redbox-mint/redbox-portal/blob/09c66809c8032dd3ac39aa5d4b886a389861a828/packages/sails-ng-common/src/config/component/tab.outline.ts#L110)

Groups child form definitions into a tabbed container.

How to change this contract: Use `TabComponent` in FormConfig to organise tab-content definitions and navigation.

| Member | Contract | Default | Purpose |
|---|---|---|---|
| `tabs` | `TabContentFormComponentDefinitionOutline[]` | `` |  |
| `onItemSelect` | `{ rawPath: string; clearValue?: unknown; }` | `` |  |
| `readonly` | `boolean` | `` | Whether the component is read-only or not.

Note that readonly affects only the component's interactivity.
Readonly is separate from disabled, they can be set independently. |
| `visible` | `boolean` | `` | Whether the component is visible or not. |
| `editMode` | `boolean` | `` | Whether the component is in edit mode or not. |
| `label` | `string` | `` | The label text translation message id. |
| `defaultComponentCssClasses` | `KeyValueStringProperty` | `` | The form-supplied css classes |
| `hostCssClasses` | `KeyValueStringProperty` | `'tab-content'` | The css classes to bind to host |
| `wrapperCssClasses` | `KeyValueStringProperty` | `` | The wrapper css classes to bind to host |
| `disabled` | `boolean` | `` | Whether the component is disabled or not.

Note that disabled affects only the component's interactivity.
Disabled is separate from readonly, they can be set independently. |
| `autofocus` | `boolean` | `` | Whether the component has autofocus or not. |
| `tooltip` | `string` | `` | The tooltip text translation message id. |
| `showValidIndicator` | `boolean` | `` | Whether to show a visual valid indicator (e.g. Bootstrap is-valid style) when the field has no errors.
Defaults to false. |
| `syncSources` | `SyncSourceEntry[]` | `` | Declares source fields for one-way additive sync. |

## TabContentComponent

- Kind: form-component
- Lifecycle: supported
- Source: [packages/sails-ng-common/src/config/component/tab-content.outline.ts:96](https://github.com/redbox-mint/redbox-portal/blob/09c66809c8032dd3ac39aa5d4b886a389861a828/packages/sails-ng-common/src/config/component/tab-content.outline.ts#L96)

Defines the child content displayed by a tab container.

How to change this contract: Use `TabContentComponent` beneath a tab to configure its labelled panel and child components.

| Member | Contract | Default | Purpose |
|---|---|---|---|
| `componentDefinitions` | `(import("packages/sails-ng-common/src/index").AccordionPanelFormComponentDefinitionOutline \| TabContentFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").RepeatableFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").GroupFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").SaveButtonFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").SaveStatusFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").IntegrationStatusFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").CancelButtonFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").DeleteButtonFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").TabNavButtonFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").TextAreaFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").ContentFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").SimpleInputFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").ValidationSummaryFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").SuggestedValidationSummaryFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").TabFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").AccordionFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").CheckboxInputFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").DropdownInputFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").RadioInputFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").DateInputFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").ReusableFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").QuestionTreeFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").CheckboxTreeFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").RecordSelectorFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").TypeaheadInputFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").RichTextEditorFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").MapFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").FileUploadFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").PDFListFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").RecordMetadataRetrieverFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").DataLocationFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").PublishDataLocationRefreshFormComponentDefinitionOutline \| import("packages/sails-ng-common/src/index").PublishDataLocationSelectorFormComponentDefinitionOutline)[]` | `` | The components to render in the tab. |
| `selected` | `boolean` | `false` | Whether the tab is selected on initialization |
| `onItemSelect` | `{ rawPath: string; clearValue?: unknown; }` | `` |  |
| `readonly` | `boolean` | `` | Whether the component is read-only or not.

Note that readonly affects only the component's interactivity.
Readonly is separate from disabled, they can be set independently. |
| `visible` | `boolean` | `` | Whether the component is visible or not. |
| `editMode` | `boolean` | `` | Whether the component is in edit mode or not. |
| `label` | `string` | `` | The label text translation message id. |
| `defaultComponentCssClasses` | `KeyValueStringProperty` | `` | The form-supplied css classes |
| `hostCssClasses` | `KeyValueStringProperty` | `` | The css classes to bind to host |
| `wrapperCssClasses` | `KeyValueStringProperty` | `` | The wrapper css classes to bind to host |
| `disabled` | `boolean` | `` | Whether the component is disabled or not.

Note that disabled affects only the component's interactivity.
Disabled is separate from readonly, they can be set independently. |
| `autofocus` | `boolean` | `` | Whether the component has autofocus or not. |
| `tooltip` | `string` | `` | The tooltip text translation message id. |
| `showValidIndicator` | `boolean` | `` | Whether to show a visual valid indicator (e.g. Bootstrap is-valid style) when the field has no errors.
Defaults to false. |
| `syncSources` | `SyncSourceEntry[]` | `` | Declares source fields for one-way additive sync. |

## TabNavButtonComponent

- Kind: form-component
- Lifecycle: supported
- Source: [packages/sails-ng-common/src/config/component/tab-nav-button.outline.ts:71](https://github.com/redbox-mint/redbox-portal/blob/09c66809c8032dd3ac39aa5d4b886a389861a828/packages/sails-ng-common/src/config/component/tab-nav-button.outline.ts#L71)

Configures a button that moves between tabs in a form.

How to change this contract: Use `TabNavButtonComponent` within tabbed forms and configure its supported navigation target.

| Member | Contract | Default | Purpose |
|---|---|---|---|
| `prevLabel` | `string` | `` | The label for the previous button. |
| `nextLabel` | `string` | `` | The label for the next button. |
| `targetTabContainerId` | `string` | `` | The name of the target TabComponent to navigate. |
| `endDisplayMode` | `string` | `` | How to handle the button at the start/end of tabs.
'hidden' hides the button, 'disabled' disables it. |
| `onItemSelect` | `{ rawPath: string; clearValue?: unknown; }` | `` |  |
| `readonly` | `boolean` | `` | Whether the component is read-only or not.

Note that readonly affects only the component's interactivity.
Readonly is separate from disabled, they can be set independently. |
| `visible` | `boolean` | `` | Whether the component is visible or not. |
| `editMode` | `boolean` | `` | Whether the component is in edit mode or not. |
| `label` | `string` | `` | The label text translation message id. |
| `defaultComponentCssClasses` | `KeyValueStringProperty` | `` | The form-supplied css classes |
| `hostCssClasses` | `KeyValueStringProperty` | `` | The css classes to bind to host |
| `wrapperCssClasses` | `KeyValueStringProperty` | `` | The wrapper css classes to bind to host |
| `disabled` | `boolean` | `` | Whether the component is disabled or not.

Note that disabled affects only the component's interactivity.
Disabled is separate from readonly, they can be set independently. |
| `autofocus` | `boolean` | `` | Whether the component has autofocus or not. |
| `tooltip` | `string` | `` | The tooltip text translation message id. |
| `showValidIndicator` | `boolean` | `` | Whether to show a visual valid indicator (e.g. Bootstrap is-valid style) when the field has no errors.
Defaults to false. |
| `syncSources` | `SyncSourceEntry[]` | `` | Declares source fields for one-way additive sync. |

## TextAreaComponent

- Kind: form-component
- Lifecycle: supported
- Source: [packages/sails-ng-common/src/config/component/text-area.outline.ts:89](https://github.com/redbox-mint/redbox-portal/blob/09c66809c8032dd3ac39aa5d4b886a389861a828/packages/sails-ng-common/src/config/component/text-area.outline.ts#L89)

Configures multiline plain-text entry and its model value.

How to change this contract: Use `TextAreaComponent` with `TextAreaModel` for long-form unformatted text fields.

| Member | Contract | Default | Purpose |
|---|---|---|---|
| `rows` | `number` | `2` |  |
| `cols` | `number` | `20` |  |
| `placeholder` | `string` | `''` |  |
| `onItemSelect` | `{ rawPath: string; clearValue?: unknown; }` | `` |  |
| `readonly` | `boolean` | `` | Whether the component is read-only or not.

Note that readonly affects only the component's interactivity.
Readonly is separate from disabled, they can be set independently. |
| `visible` | `boolean` | `` | Whether the component is visible or not. |
| `editMode` | `boolean` | `` | Whether the component is in edit mode or not. |
| `label` | `string` | `` | The label text translation message id. |
| `defaultComponentCssClasses` | `KeyValueStringProperty` | `` | The form-supplied css classes |
| `hostCssClasses` | `KeyValueStringProperty` | `` | The css classes to bind to host |
| `wrapperCssClasses` | `KeyValueStringProperty` | `` | The wrapper css classes to bind to host |
| `disabled` | `boolean` | `` | Whether the component is disabled or not.

Note that disabled affects only the component's interactivity.
Disabled is separate from readonly, they can be set independently. |
| `autofocus` | `boolean` | `` | Whether the component has autofocus or not. |
| `tooltip` | `string` | `` | The tooltip text translation message id. |
| `showValidIndicator` | `boolean` | `` | Whether to show a visual valid indicator (e.g. Bootstrap is-valid style) when the field has no errors.
Defaults to false. |
| `syncSources` | `SyncSourceEntry[]` | `` | Declares source fields for one-way additive sync. |

## TypeaheadInputComponent

- Kind: form-component
- Lifecycle: supported
- Source: [packages/sails-ng-common/src/config/component/typeahead-input.outline.ts:218](https://github.com/redbox-mint/redbox-portal/blob/09c66809c8032dd3ac39aa5d4b886a389861a828/packages/sails-ng-common/src/config/component/typeahead-input.outline.ts#L218)

Configures searchable typeahead selection from local or remote choices.

How to change this contract: Use `TypeaheadInputComponent` with `TypeaheadInputModel` and the supported lookup configuration.

_This contract has no published members._

## ValidationSummaryComponent

- Kind: form-component
- Lifecycle: supported
- Source: [packages/sails-ng-common/src/config/component/validation-summary.outline.ts:60](https://github.com/redbox-mint/redbox-portal/blob/09c66809c8032dd3ac39aa5d4b886a389861a828/packages/sails-ng-common/src/config/component/validation-summary.outline.ts#L60)

Displays the form's current blocking validation errors.

How to change this contract: Use `ValidationSummaryComponent` to provide a consolidated accessible validation summary.

| Member | Contract | Default | Purpose |
|---|---|---|---|
| `includeTabLabel` | `boolean` | `` | Whether to include tab labels in validation summary labels.
Group labels are always included. |
| `showWhenValid` | `boolean` | `false` | Whether to render the informational success message when the form has no validation errors.
Defaults to false. |
| `onItemSelect` | `{ rawPath: string; clearValue?: unknown; }` | `` |  |
| `readonly` | `boolean` | `` | Whether the component is read-only or not.

Note that readonly affects only the component's interactivity.
Readonly is separate from disabled, they can be set independently. |
| `visible` | `boolean` | `` | Whether the component is visible or not. |
| `editMode` | `boolean` | `` | Whether the component is in edit mode or not. |
| `label` | `string` | `` | The label text translation message id. |
| `defaultComponentCssClasses` | `KeyValueStringProperty` | `` | The form-supplied css classes |
| `hostCssClasses` | `KeyValueStringProperty` | `` | The css classes to bind to host |
| `wrapperCssClasses` | `KeyValueStringProperty` | `` | The wrapper css classes to bind to host |
| `disabled` | `boolean` | `` | Whether the component is disabled or not.

Note that disabled affects only the component's interactivity.
Disabled is separate from readonly, they can be set independently. |
| `autofocus` | `boolean` | `` | Whether the component has autofocus or not. |
| `tooltip` | `string` | `` | The tooltip text translation message id. |
| `showValidIndicator` | `boolean` | `` | Whether to show a visual valid indicator (e.g. Bootstrap is-valid style) when the field has no errors.
Defaults to false. |
| `syncSources` | `SyncSourceEntry[]` | `` | Declares source fields for one-way additive sync. |

## FormConfig

- Kind: form-config
- Lifecycle: supported
- Source: [packages/sails-ng-common/src/config/form-config.outline.ts:15](https://github.com/redbox-mint/redbox-portal/blob/09c66809c8032dd3ac39aa5d4b886a389861a828/packages/sails-ng-common/src/config/form-config.outline.ts#L15)

The top-level form config interface that provides typing for the object literal and schema.

How to change this contract: Hook form registrations provide objects conforming to this contract; component definitions must use registered component, model, and layout class names.

| Member | Contract | Default | Purpose |
|---|---|---|---|
| `name` | `string` | `''` | optional form name, will be used to identify the form in the config |
| `type` | `string` | `` | the record type |
| `domElementType` | `string` | `` | the dom element type to inject, e.g. div, span, etc. leave empty to use 'ng-container' |
| `domId` | `string` | `` | optional form dom id property. When set, value will be injected into the overall dom node |
| `viewCssClasses` | `KeyValueStringProperty` | `` | the optional css clases to be applied to the form dom node in view / read-only mode |
| `editCssClasses` | `KeyValueStringProperty` | `` | the optional css clases to be applied to the form dom node in edit mode |
| `defaultComponentConfig` | `KeyValueStringNested` | `` | optional configuration to set in each component |
| `enabledValidationGroups` | `string[]` | `['all']` | The validation groups to enable for the form.
The validation groups will be set as part of loading the form.
Default ["all"] if none specified.

In the angular form:
- The available validation groups cannot change.
- The groups a validator belongs to cannot change.
- The currently enabled validation groups can change.

It is possible to change the enabled validation groups after the form has loaded.
This is done by changing this property in the Form Component config.
Use component expressions with target 'form.enabledValidationGroups' to trigger the event.

Use Cases for whether a validator is enabled or disabled in the angular form.

Must change as the user is interacting with the form:
 - Enabled only when a component is visible (or hidden), and disabled otherwise.
 - Enabled based on the value in another component.
 - Enabled when a particular system integration / external state is activated or changed, and disabled otherwise.

 Change based on state provided from the server that does not change in the angular form:
 - Disabled for a new form, but enabled for a saved form.
 - Enabled for some workflow stages, but disabled in other stages. |
| `validators` | `FormValidatorTargetFieldConfig[]` | `[]` | The validators that are configured at the form level, usually because they involve two or more fields. |
| `validationGroups` | `FormValidationGroups` | `{
    all: { description: 'Validate all fields with validators.', initialMembership: 'all' },
    none: { description: 'Validate none of the fields.', initialMembership: 'none' },
  }` | The validation groups available in this form.
These are the only validation group names that can be used in the validator config. |
| `defaultLayoutComponent` | `string` | `` | TODO: the default layout component |
| `componentDefinitions` | `(import("packages/sails-ng-common/src/index").TabContentFormComponentDefinitionFrame \| import("packages/sails-ng-common/src/index").RepeatableFormComponentDefinitionFrame \| import("packages/sails-ng-common/src/index").GroupFormComponentDefinitionFrame \| import("packages/sails-ng-common/src/index").SaveButtonFormComponentDefinitionFrame \| import("packages/sails-ng-common/src/index").SaveStatusFormComponentDefinitionFrame \| import("packages/sails-ng-common/src/index").IntegrationStatusFormComponentDefinitionFrame \| import("packages/sails-ng-common/src/index").CancelButtonFormComponentDefinitionFrame \| import("packages/sails-ng-common/src/index").DeleteButtonFormComponentDefinitionFrame \| import("packages/sails-ng-common/src/index").TabNavButtonFormComponentDefinitionFrame \| import("packages/sails-ng-common/src/index").TextAreaFormComponentDefinitionFrame \| import("packages/sails-ng-common/src/index").ContentFormComponentDefinitionFrame \| import("packages/sails-ng-common/src/index").SimpleInputFormComponentDefinitionFrame \| import("packages/sails-ng-common/src/index").ValidationSummaryFormComponentDefinitionFrame \| import("packages/sails-ng-common/src/index").SuggestedValidationSummaryFormComponentDefinitionFrame \| import("packages/sails-ng-common/src/index").TabFormComponentDefinitionFrame \| import("packages/sails-ng-common/src/index").AccordionFormComponentDefinitionFrame \| import("packages/sails-ng-common/src/index").AccordionPanelFormComponentDefinitionFrame \| import("packages/sails-ng-common/src/index").CheckboxInputFormComponentDefinitionFrame \| import("packages/sails-ng-common/src/index").DropdownInputFormComponentDefinitionFrame \| import("packages/sails-ng-common/src/index").RadioInputFormComponentDefinitionFrame \| import("packages/sails-ng-common/src/index").DateInputFormComponentDefinitionFrame \| import("packages/sails-ng-common/src/index").ReusableFormComponentDefinitionFrame \| import("packages/sails-ng-common/src/index").QuestionTreeFormComponentDefinitionFrame \| import("packages/sails-ng-common/src/index").CheckboxTreeFormComponentDefinitionFrame \| import("packages/sails-ng-common/src/index").RecordSelectorFormComponentDefinitionFrame \| import("packages/sails-ng-common/src/index").TypeaheadInputFormComponentDefinitionFrame \| import("packages/sails-ng-common/src/index").RichTextEditorFormComponentDefinitionFrame \| import("packages/sails-ng-common/src/index").MapFormComponentDefinitionFrame \| import("packages/sails-ng-common/src/index").FileUploadFormComponentDefinitionFrame \| import("packages/sails-ng-common/src/index").PDFListFormComponentDefinitionFrame \| import("packages/sails-ng-common/src/index").RecordMetadataRetrieverFormComponentDefinitionFrame \| import("packages/sails-ng-common/src/index").DataLocationFormComponentDefinitionFrame \| import("packages/sails-ng-common/src/index").PublishDataLocationRefreshFormComponentDefinitionFrame \| import("packages/sails-ng-common/src/index").PublishDataLocationSelectorFormComponentDefinitionFrame)[]` | `[]` | the components of this form |
| `debugValue` | `boolean` | `false` | debug: show the form JSON
Default false. |
| `expressions` | `FormExpressionsConfigOutline[]` | `` | A record with string keys and expression template values for defining expressions. |
| `behaviours` | `FormBehaviourConfigFrame[]` | `` | Form-level automation rules introduced by the form behaviours v1 feature.

Behaviours complement, rather than replace, component expressions:
expressions remain component-scoped and mostly synchronous, while behaviours
operate at form scope and may run async processor/action pipelines. |
| `attachmentFields` | `string[]` | `` | The list of fields that are attachments.
This is automatically populated by the form config visitor. |

## defineRedboxHook

- Kind: hook-protocol
- Lifecycle: supported
- Source: [packages/redbox-core/src/hooks/defineRedboxHook.ts:31](https://github.com/redbox-mint/redbox-portal/blob/09c66809c8032dd3ac39aa5d4b886a389861a828/packages/redbox-core/src/hooks/defineRedboxHook.ts#L31)

Declares the capabilities contributed by an installable ReDBox hook.

How to change this contract: Pass registration functions to `defineRedboxHook`; the loader calls them during static shim discovery. Registration functions must be deterministic and must not require a lifted Sails application.

| Member | Contract | Default | Purpose |
|---|---|---|---|
| `defaults` | `Record<string, unknown>` | `` |  |
| `routes` | `unknown` | `` |  |
| `configure` | `(sails: Application) => void` | `` |  |
| `initialize` | `HookInitializer` | `` |  |
| `registerRedboxConfig` | `() => HookRegistrationMap` | `` |  |
| `registerHookApiRoutes` | `() => readonly ApiRouteDefinition[]` | `` |  |
| `registerRedboxControllers` | `() => HookRegistrationMap` | `` |  |
| `registerRedboxWebserviceControllers` | `() => HookRegistrationMap` | `` |  |
| `registerRedboxServices` | `() => HookRegistrationMap` | `` |  |
| `registerRedboxFormConfigs` | `() => HookRegistrationMap` | `` |  |
| `additionalExports` | `Record<string, unknown>` | `` |  |

## RecordsService

- Kind: service
- Lifecycle: supported
- Source: [packages/redbox-core/src/services/RecordsService.ts:82](https://github.com/redbox-mint/redbox-portal/blob/09c66809c8032dd3ac39aa5d4b886a389861a828/packages/redbox-core/src/services/RecordsService.ts#L82)

Provides the core record lifecycle, persistence, authorization, and relationship operations.

How to change this contract: Register a subclass as `RecordsService` from a hook to replace or extend record behaviour while preserving the exported-method contract.

| Member | Contract | Default | Purpose |
|---|---|---|---|
| `bootstrapData` | `(): Promise<void>` | `` |  |
| `init` | `(): void` | `` |  |
| `create` | `(brand: unknown, record: AnyRecord, recordType: unknown, user?: AnyRecord, triggerPreSaveTriggers?: boolean, triggerPostSaveTriggers?: boolean, targetStep?: any): Promise<StorageServiceResponse>` | `` |  |
| `updateMeta` | `(brand: unknown, oid: string, record: AnyRecord, user?: AnyRecord, triggerPreSaveTriggers?: boolean, triggerPostSaveTriggers?: boolean, nextStep?: unknown, metadata?: AnyRecord): Promise<StorageServiceResponse>` | `` |  |
| `getMeta` | `(oid: string): Promise<RecordModel>` | `` |  |
| `getRecordAudit` | `(params: RecordAuditParams): Promise<Record<string, unknown>[]>` | `` |  |
| `getResolvedPermissionsSummary` | `(oid: string): Promise<{ edit: any[]; view: any[]; editPending: string[]; viewPending: string[]; editRoles: string[]; viewRoles: string[]; }>` | `` |  |
| `createBatch` | `(type: unknown, data: AnyRecord, harvestIdFldName: unknown): Promise<unknown>` | `` |  |
| `provideUserAccessAndRemovePendingAccess` | `(oid: string, userid: unknown, pendingValue: unknown): void` | `` |  |
| `getRelatedRecords` | `(oid: string, brand: unknown, options?: RecordRelationshipExpandOptions): Promise<RecordRelationshipGraph>` | `` |  |
| `getMetaWithRelationships` | `(oid: string, brand: unknown, options?: RecordRelationshipExpandOptions): Promise<RecordMetaWithRelationships>` | `` |  |
| `getRecordTypeSummary` | `(brand: BrandingModel, recordTypeName: string): Promise<RecordTypeLookupSummary \| null>` | `` |  |
| `delete` | `(oid: string, permanentlyDelete: boolean, currentRec: unknown, recordType: unknown, user: AnyRecord): Promise<StorageServiceResponse>` | `` |  |
| `updateNotificationLog` | `(oid: string, record: AnyRecord, options: AnyRecord): Promise<unknown>` | `` |  |
| `getRecords` | `(workflowState: string, recordType: unknown, start: unknown, rows: unknown, username: unknown, roles: AnyRecord[], brand: unknown, editAccessOnly?: unknown, packageType?: unknown, sort?: unknown, fieldNames?: unknown, filterString?: unknown, filterMode?: unknown, secondarySort?: unknown): Promise<StorageServiceResponse>` | `` |  |
| `exportAllPlans` | `(username: unknown, roles: AnyRecord[], brand: unknown, format: unknown, modBefore: unknown, modAfter: unknown, recType: unknown): Readable` | `` |  |
| `getAttachments` | `(oid: string, labelFilterStr?: string \| undefined, requestContext?: { username?: string; } \| undefined): Promise<Record<string, unknown>[]>` | `` |  |
| `checkRedboxRunning` | `(): Promise<unknown>` | `` |  |
| `storeRecordAudit` | `(job: AnyRecord): void` | `` |  |
| `appendToRecord` | `(targetRecordOid: string, linkData: unknown, fieldName: string, fieldType?: string \| undefined, targetRecord?: unknown): Promise<StorageServiceResponse>` | `` | Sets/appends to a field in the targetRecord |
| `removeFromRecord` | `(targetRecordOid: string, dataToRemove: unknown, fieldName: string, targetRecord?: unknown): Promise<StorageServiceResponse>` | `` | Removes a field in the targetRecord. If field is an array, uses the `_.isEqual` to compare the field value. |
| `hasViewAccess` | `(brand: unknown, user: AnyRecord, roles: AnyRecord[], record: AnyRecord): boolean` | `` | Fine-grained access to the record, converted to sync. |
| `hasEditAccess` | `(brand: unknown, user: AnyRecord, roles: AnyRecord[], record: AnyRecord): boolean` | `` | Fine-grained access to the record, converted to sync. |
| `searchFuzzy` | `(type: unknown, workflowState: string, searchQuery: unknown, exactSearches: unknown, facetSearches: unknown, brand: unknown, user: AnyRecord, roles: AnyRecord[], returnFields: unknown): Promise<unknown>` | `` |  |
| `restoreRecord` | `(oid: string, user: AnyRecord): Promise<StorageServiceResponse>` | `` |  |
| `destroyDeletedRecord` | `(oid: string, user: AnyRecord): Promise<StorageServiceResponse>` | `` |  |
| `getDeletedRecordMeta` | `(oid: string): Promise<RecordModel \| null>` | `` | Metadata of a soft deleted record, or null when no deleted record exists for the oid. |
| `getDeletedRecords` | `(workflowState: string, recordType: unknown, start: unknown, rows: unknown, username: unknown, roles: AnyRecord[], brand: unknown, editAccessOnly: unknown, packageType: unknown, sort: unknown, fieldNames?: unknown, filterString?: unknown, filterMode?: unknown): Promise<StorageServiceResponse>` | `` |  |
| `transitionWorkflowStep` | `(_currentRec: unknown, _recordType: unknown, _nextStep: unknown, _user: AnyRecord, _triggerPreSaveTriggers?: boolean, _triggerPostSaveTriggers?: boolean): Promise<void>` | `` |  |
| `setWorkflowStepRelatedMetadata` | `(currentRec: unknown, nextStep: unknown): void` | `` |  |
| `transitionWorkflowStepMetadata` | `(currentRec: unknown, nextStep: unknown): void` | `` |  |
| `triggerPreSaveTransitionWorkflowTriggers` | `(oid: string \| null, record: AnyRecord, recordType: unknown, nextStep: unknown, user?: unknown): Promise<AnyRecord>` | `` |  |
| `triggerPostSaveTransitionWorkflowTriggers` | `(oid: string \| null, record: AnyRecord, recordType: unknown, nextStep: unknown, user?: unknown, response?: unknown): Promise<AnyRecord>` | `` |  |
| `triggerPreSaveTriggers` | `(oid: string \| null, record: AnyRecord, recordType: unknown, mode?: string, user?: unknown): Promise<AnyRecord>` | `` |  |
| `triggerPostSaveSyncTriggers` | `(oid: string \| null, record: AnyRecord, recordType: unknown, mode?: string, user?: unknown, response?: AnyRecord): Promise<AnyRecord>` | `` |  |
| `triggerPostSaveTriggers` | `(oid: string \| null, record: AnyRecord, recordType: unknown, mode?: string, user?: unknown): void` | `` |  |
| `exists` | `(oid: string): Promise<boolean>` | `` |  |
| `handleUpdateDataStream` | `(oid: string, origRecord: unknown, metadata: AnyRecord): import("rxjs/dist").Observable<unknown>` | `` |  |

## RecordController

- Kind: webservice-controller
- Lifecycle: supported
- Source: [packages/redbox-core/src/controllers/webservice/RecordController.ts:80](https://github.com/redbox-mint/redbox-portal/blob/09c66809c8032dd3ac39aa5d4b886a389861a828/packages/redbox-core/src/controllers/webservice/RecordController.ts#L80)

Implements the legacy webservice record operations exposed by the core route registry.

How to change this contract: Register a subclass as `RecordController` through `registerRedboxWebserviceControllers` to replace the webservice implementation without changing its route contract.

| Member | Contract | Default | Purpose |
|---|---|---|---|
| `init` | `(): void` | `` |  |
| `getPermissions` | `(req: Sails.Req, res: Sails.Res): Promise<import("@types/express").Response<any, globalThis.Record<string, any>>>` | `` |  |
| `addUserEdit` | `(req: Sails.Req, res: Sails.Res): Promise<import("@types/express").Response<any, globalThis.Record<string, any>>>` | `` |  |
| `addUserView` | `(req: Sails.Req, res: Sails.Res): Promise<import("@types/express").Response<any, globalThis.Record<string, any>>>` | `` |  |
| `removeUserEdit` | `(req: Sails.Req, res: Sails.Res): Promise<import("@types/express").Response<any, globalThis.Record<string, any>>>` | `` |  |
| `removeUserView` | `(req: Sails.Req, res: Sails.Res): Promise<import("@types/express").Response<any, globalThis.Record<string, any>>>` | `` |  |
| `getMeta` | `(req: Sails.Req, res: Sails.Res): Promise<import("@types/express").Response<any, globalThis.Record<string, any>>>` | `` |  |
| `getRecordAudit` | `(req: Sails.Req, res: Sails.Res): Promise<import("@types/express").Response<any, globalThis.Record<string, any>>>` | `` |  |
| `getObjectMeta` | `(req: Sails.Req, res: Sails.Res): Promise<import("@types/express").Response<any, globalThis.Record<string, any>>>` | `` |  |
| `updateMeta` | `(req: Sails.Req, res: Sails.Res): Promise<import("@types/express").Response<any, globalThis.Record<string, any>>>` | `` |  |
| `updateObjectMeta` | `(req: Sails.Req, res: Sails.Res): Promise<import("@types/express").Response<any, globalThis.Record<string, any>>>` | `` |  |
| `create` | `(req: Sails.Req, res: Sails.Res): void` | `` |  |
| `getDataStream` | `(req: Sails.Req, res: Sails.Res): Promise<import("@types/express").Response<any, globalThis.Record<string, any>>>` | `` |  |
| `addDataStreams` | `(req: Sails.Req, res: Sails.Res): Promise<import("@types/express").Response<any, globalThis.Record<string, any>>>` | `` |  |
| `listRecords` | `(req: Sails.Req, res: Sails.Res): import("@types/express").Response<any, globalThis.Record<string, any>> \| Promise<void>` | `` |  |
| `restoreRecord` | `(req: Sails.Req, res: Sails.Res): Promise<import("@types/express").Response<any, globalThis.Record<string, any>>>` | `` |  |
| `deleteRecord` | `(req: Sails.Req, res: Sails.Res): Promise<import("@types/express").Response<any, globalThis.Record<string, any>>>` | `` |  |
| `destroyDeletedRecord` | `(req: Sails.Req, res: Sails.Res): Promise<import("@types/express").Response<any, globalThis.Record<string, any>>>` | `` |  |
| `transitionWorkflow` | `(req: Sails.Req, res: Sails.Res): Promise<import("@types/express").Response<any, globalThis.Record<string, any>>>` | `` |  |
| `listDatastreams` | `(req: Sails.Req, res: Sails.Res): Promise<import("@types/express").Response<any, globalThis.Record<string, any>>>` | `` |  |
| `addRoleEdit` | `(req: Sails.Req, res: Sails.Res): Promise<import("@types/express").Response<any, globalThis.Record<string, any>>>` | `` |  |
| `addRoleView` | `(req: Sails.Req, res: Sails.Res): Promise<import("@types/express").Response<any, globalThis.Record<string, any>>>` | `` |  |
| `removeRoleEdit` | `(req: Sails.Req, res: Sails.Res): Promise<import("@types/express").Response<any, globalThis.Record<string, any>>>` | `` |  |
| `removeRoleView` | `(req: Sails.Req, res: Sails.Res): Promise<import("@types/express").Response<any, globalThis.Record<string, any>>>` | `` |  |
| `harvest` | `(req: Sails.Req, res: Sails.Res): Promise<import("@types/express").Response<any, globalThis.Record<string, any>>>` | `` |  |
| `legacyHarvest` | `(req: Sails.Req, res: Sails.Res): Promise<import("@types/express").Response<any, globalThis.Record<string, any>>>` | `` |  |
| `listDeletedRecords` | `(req: Sails.Req, res: Sails.Res): import("@types/express").Response<any, globalThis.Record<string, any>> \| Promise<void \| import("@types/express").Response<any, globalThis.Record<string, any>>>` | `` |  |
