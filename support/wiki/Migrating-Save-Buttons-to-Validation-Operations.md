# Migrating Save Buttons to Validation Operations

Authoritative validation uses a server-owned operation name, not the
`enabledValidationGroups` sent by an Angular save button. Existing buttons
without an operation remain valid, and their client-side group behavior is
unchanged, but workflow-specific actions should be migrated so direct REST
clients and Angular select the same server policy.

## Before

```javascript
{
  name: 'submit_button',
  component: {
    class: 'SaveButtonComponent',
    config: {
      label: 'Submit',
      targetStep: 'review',
      enabledValidationGroups: ['submit']
    }
  }
}
```

The groups above still control immediate Angular validation. They are not
trusted by the server and do not identify the requested business intent.

## After

For a transition, define the operation on the exact **target-step form**. The
button remains on the source form, but the server resolves transition policy
only after resolving the requested target step and its form:

```javascript
// dataset-2.4-review: the form configured by the "review" workflow step
{
  name: 'dataset-2.4-review',
  validationOperations: {
    submit: {
      enabledValidationGroups: ['submit'],
      label: 'Submit for review',
      description: 'Validate submission requirements and move to review.',
      roles: ['Researcher'],
      allowedTargetSteps: ['review']
    }
  }
}

// dataset-2.4-draft: the source form containing the transition button
{
  name: 'dataset-2.4-draft',
  componentDefinitions: [
    {
      name: 'submit_button',
      component: {
        class: 'SaveButtonComponent',
        config: {
          label: 'Submit',
          operation: 'submit',
          targetStep: 'review',
          enabledValidationGroups: ['submit']
        }
      }
    }
  ]
}
```

Keep `enabledValidationGroups` during migration for the existing interactive
UX. `operation` is the authority input; the server resolves its exact group set
from the form and applies record-type/workflow restrictions. `targetStep`
requests movement and remains independent.

## Migration checklist

1. Inventory buttons that mean draft, submit, approve, publish, or another
   business action. Ordinary save buttons may remain without an operation.
2. Choose case-sensitive identifiers matching
   `[A-Za-z][A-Za-z0-9._-]{0,63}`. Do not reuse CRUD words merely because the
   request happens to create or update a record.
3. Add `validationOperations` to each exact form the server will resolve. For
   ordinary create/update this is the candidate's exact form; for a targeted
   create or transition it is the target workflow step's exact form. A name
   missing from that resolved form is rejected as unknown.
4. Copy the existing save-time groups into the operation definition. Keep the
   button groups temporarily for Angular feedback.
5. Move authorization restrictions into `roles` and `allowedTargetSteps` only
   when they narrow existing record edit/transition authorization. They do not
   grant edit access or a transition role.
6. Add any record-type group/mode override and workflow-stage policy
   restriction. Workflow stages cannot override mode.
7. Send the same name from non-Angular clients with `?operation=submit`.
8. Exercise create, update, and every target transition in shadow mode. Compare
   Angular feedback with server telemetry.
9. Obtain rollout signoff before changing the `(record type, operation)` unit
   to enforce.
10. Inventory conditional groups driven by JSONPointer value-change events,
    browser-only roots, or `runOnFormReady: false`. They are diagnostic-only in
    shadow and reject saves as unsupported configuration in enforce; replace
    them with deterministic form-ready server expressions or validators.

## Compatibility and failure behavior

- A button without `operation` remains supported; the server deliberately runs
  all blocking validators, not the conditional/default subset currently active
  in Angular.
- Unknown or malformed operations are request errors in both shadow and
  enforce modes.
- Client-supplied validation groups cannot weaken server validation.
- Advisory groups remain non-blocking and should not be placed in the blocking
  operation group array.
- A create that targets a non-starting workflow step must pass ordinary edit
  access on the target candidate and the target step's transition roles.
- `saved-with-warnings` means primary persistence succeeded; clients must show
  it as a warning rather than a failed save.

See [Configuring Record Forms](Configuring-Record-Forms#authoritative-server-validation-operations)
for exact form resolution and
[Operating Authoritative Server-Side Form Validation](Server-Side-Form-Validation-Operations)
for shadow reporting, repairs, signoff, and rollback.
