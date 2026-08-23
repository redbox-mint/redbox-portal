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

Define the operation on every form from which the action is available:

```javascript
{
  name: 'dataset-2.4-draft',
  validationOperations: {
    submit: {
      enabledValidationGroups: ['submit'],
      label: 'Submit for review',
      description: 'Validate submission requirements and move to review.',
      roles: ['Researcher'],
      allowedTargetSteps: ['review']
    }
  },
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
3. Add `validationOperations` to every applicable workflow form. A name
   missing from the exact resolved form is rejected as unknown.
4. Copy the existing save-time groups into the operation definition. Keep the
   button groups temporarily for Angular feedback.
5. Move authorization restrictions into `roles` and `allowedTargetSteps` only
   when they narrow existing record edit/transition authorization.
6. Add any record-type group/mode override and workflow-stage policy
   restriction. Workflow stages cannot override mode.
7. Send the same name from non-Angular clients with `?operation=submit`.
8. Exercise create, update, and every target transition in shadow mode. Compare
   Angular feedback with server telemetry.
9. Obtain rollout signoff before changing the `(record type, operation)` unit
   to enforce.

## Compatibility and failure behavior

- A button without `operation` remains supported; the server runs the exact
  form-derived blocking groups, with an empty effective list retaining the
  established “all validators” meaning.
- Unknown or malformed operations are request errors in both shadow and
  enforce modes.
- Client-supplied validation groups cannot weaken server validation.
- Advisory groups remain non-blocking and should not be placed in the blocking
  operation group array.
- `saved-with-warnings` means primary persistence succeeded; clients must show
  it as a warning rather than a failed save.

See [Operating Authoritative Server-Side Form Validation](Server-Side-Form-Validation-Operations)
for shadow reporting, repairs, signoff, and rollback.
