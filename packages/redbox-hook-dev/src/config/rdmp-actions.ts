import { ActionRegistry } from '@researchdatabox/redbox-core';

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
        actionId: ActionRegistry.BUILT_IN_ACTION_IDS.applyTemplates,
        stableKey: 'server-write-back',
        parameters: {
          field: { kind: 'literal', value: 'metadata.server_sync_test_value' },
          value: { kind: 'jsonata', expression: '"test-" & $string($floor(100000 + $random() * 900000))' },
          parseObject: { kind: 'literal', value: false },
        },
      },
      {
        actionId: ActionRegistry.BUILT_IN_ACTION_IDS.assignPermissions,
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
        actionId: ActionRegistry.BUILT_IN_ACTION_IDS.validateTotalAttachmentSize,
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
      id: ActionRegistry.deriveStableActionBindingId({
        recordTypeKey: 'rdmp',
        scope,
        actionId,
        contractVersion: 1,
        stableKey,
      }),
      stableKey,
      actionId,
      contractVersion: 1,
      scope,
      parameters,
      order,
    }));
  }),
};
