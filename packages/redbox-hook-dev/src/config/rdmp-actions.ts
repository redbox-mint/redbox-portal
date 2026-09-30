import type { ActionRegistry } from '@researchdatabox/redbox-core';

// Keep configuration loadable before the core runtime is compiled. The migration tests verify these stable IDs.
const bindingIds = {
  onCreate: ['actb_f8d7897e5507bb2c392ae143e48294a6', 'actb_9bf6ff5173ee85afd40384e09bb1f88e'],
  onUpdate: [
    'actb_352ceb07dba54d40ef97ae2406c43aef',
    'actb_dd15d13ae9bc5b8568bf26bbdc3e7a0f',
    'actb_70f2d23858b54853f413895133148ce2',
  ],
};

/** Registered development actions preserve the server write-back demo without legacy JavaScript evaluation. */
export const rdmpActionPlan: ActionRegistry.ActionPlan = {
  schemaVersion: 1,
  recordTypeKey: 'rdmp',
  bindings: (['onCreate', 'onUpdate'] as const).flatMap(mode => {
    const scope = { context: 'record-lifecycle' as const, mode, phase: 'pre' as const };
    const actions: {
      actionId: ActionRegistry.ActionDefinitionId;
      stableKey: string;
      parameters: ActionRegistry.ActionParameterValues;
    }[] = [
      {
        actionId: 'redbox.core.record.apply-templates' as ActionRegistry.ActionDefinitionId,
        stableKey: 'server-write-back',
        parameters: {
          field: { kind: 'literal', value: 'metadata.server_sync_test_value' },
          value: { kind: 'jsonata', expression: '"test-" & $string($floor(100000 + $random() * 900000))' },
          parseObject: { kind: 'literal', value: false },
        },
      },
      {
        actionId: 'redbox.core.record.assign-permissions' as ActionRegistry.ActionDefinitionId,
        stableKey: 'contributor-permissions',
        parameters: {
          condition: { kind: 'jsonata', expression: 'true' },
          emailProperty: { kind: 'literal', value: 'email' },
          editContributorProperties: {
            kind: 'literal',
            value: ['metadata.contributor_ci', 'metadata.contributor_data_manager', 'metadata.dataowner_email'],
          },
          viewContributorProperties: {
            kind: 'literal',
            value: [
              'metadata.contributor_ci',
              'metadata.contributor_data_manager',
              'metadata.contributor_supervisor',
              'metadata.contributors',
            ],
          },
          recordCreatorPermissions: { kind: 'literal', value: 'view&edit' },
        },
      },
    ];
    if (mode === 'onUpdate') {
      actions.push({
        actionId: 'redbox.core.record.validate-total-attachment-size' as ActionRegistry.ActionDefinitionId,
        stableKey: 'total-attachment-size',
        parameters: {
          condition: {
            kind: 'jsonata',
            expression:
              'record.candidate.workflow.stage = "draft" or record.candidate.workflow.stage = "queued" or record.candidate.workflow.stage = "published"',
          },
          maxUploadSizeMessageCode: {
            kind: 'literal',
            value: 'max-total-files-upload-size-alternative-validation-error',
          },
          replaceOrAppend: { kind: 'literal', value: 'append' },
        },
      });
    }
    return actions.map(({ actionId, stableKey, parameters }, order) => ({
      schemaVersion: 1 as const,
      id: bindingIds[mode][order] as ActionRegistry.ActionBindingId,
      stableKey,
      actionId,
      contractVersion: 1,
      scope,
      parameters,
      order,
    }));
  }),
};
