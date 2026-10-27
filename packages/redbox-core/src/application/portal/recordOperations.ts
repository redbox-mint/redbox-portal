import type { RecordTriggers } from '../../records/RecordTriggers';
import type { Services as Workflows } from '../../records/WorkflowTriggers';
import type { Services as Records } from '../../records/Records';
import type { Services as Email } from '../../integrations/Email';
import type { Services as Doi } from '../../integrations/Doi';
import type { Services as Raid } from '../../integrations/Raid';
import type { Services as Oni } from '../../integrations/Oni';
import type { Services as Figshare } from '../../integrations/Figshare';

/** Selected instances are resolved only on invocation, preserving initialization order. */
export function portalRecordOperations(input: {
  triggers(): RecordTriggers;
  workflows(): Workflows.Trigger;
  records(): Pick<Records.Records, 'updateNotificationLog'>;
  email(): Pick<Email.Email, 'sendRecordNotification'>;
  doi(): Pick<Doi.Doi, 'publishDoiTrigger' | 'publishDoiTriggerSync' | 'updateDoiTriggerSync'>;
  raid(): Pick<Raid.Raid, 'mintTrigger' | 'mintPostCreateRetryHandler'>;
  oni(): Pick<Oni.OniService, 'exportDataset'>;
  figshare(): Pick<
    Figshare.FigshareService,
    'validateFigshareRecord' | 'wakeFigshareRecord' | 'requestFigshareCleanup'
  >;
}) {
  const operations = {
    'record.runTemplates': (...args: Parameters<RecordTriggers['runTemplates']>) =>
      input.triggers().runTemplates(...args),
    'record.assignPermissions': (...args: Parameters<RecordTriggers['assignPermissions']>) =>
      input.triggers().assignPermissions(...args),
    'record.complexAssignPermissions': (...args: Parameters<RecordTriggers['complexAssignPermissions']>) =>
      input.triggers().complexAssignPermissions(...args),
    'record.processRecordCounters': (...args: Parameters<RecordTriggers['processRecordCounters']>) =>
      input.triggers().processRecordCounters(...args),
    'record.queueTriggerCall': (...args: Parameters<RecordTriggers['queueTriggerCall']>) =>
      input.triggers().queueTriggerCall(...args),
    'record.checkTotalSizeOfFilesInRecord': (...args: Parameters<RecordTriggers['checkTotalSizeOfFilesInRecord']>) =>
      input.triggers().checkTotalSizeOfFilesInRecord(...args),
    'record.stripUserBasedPermissions': (...args: Parameters<RecordTriggers['stripUserBasedPermissions']>) =>
      input.triggers().stripUserBasedPermissions(...args),
    'record.restoreUserBasedPermissions': (...args: Parameters<RecordTriggers['restoreUserBasedPermissions']>) =>
      input.triggers().restoreUserBasedPermissions(...args),
    'record.addWorkspaceToRecord': (...args: Parameters<RecordTriggers['addWorkspaceToRecord']>) =>
      input.triggers().addWorkspaceToRecord(...args),
    'record.removeWorkspaceFromRecord': (...args: Parameters<RecordTriggers['removeWorkspaceFromRecord']>) =>
      input.triggers().removeWorkspaceFromRecord(...args),
    'record.updateNotificationLog': (...args: Parameters<Records.Records['updateNotificationLog']>) =>
      input.records().updateNotificationLog(...args),
    'workflow.transition': (...args: Parameters<Workflows.Trigger['transitionWorkflow']>) =>
      input.workflows().transitionWorkflow(...args),
    'workflow.runHooksSync': (...args: Parameters<Workflows.Trigger['runHooksSync']>) =>
      input.workflows().runHooksSync(...args),
    'workflow.applyFieldLevelPermissions': (...args: Parameters<Workflows.Trigger['applyFieldLevelPermissions']>) =>
      input.workflows().applyFieldLevelPermissions(...args),
    'workflow.validateFieldUsingRegex': (...args: Parameters<Workflows.Trigger['validateFieldUsingRegex']>) =>
      input.workflows().validateFieldUsingRegex(...args),
    'workflow.validateFieldsUsingTemplate': (...args: Parameters<Workflows.Trigger['validateFieldsUsingTemplate']>) =>
      input.workflows().validateFieldsUsingTemplate(...args),
    'workflow.validateFieldMapUsingRegex': (...args: Parameters<Workflows.Trigger['validateFieldMapUsingRegex']>) =>
      input.workflows().validateFieldMapUsingRegex(...args),
    'workflow.runTemplatesOnRelatedRecord': (...args: Parameters<Workflows.Trigger['runTemplatesOnRelatedRecord']>) =>
      input.workflows().runTemplatesOnRelatedRecord(...args),
    'email.sendRecordNotification': (...args: Parameters<Email.Email['sendRecordNotification']>) =>
      input.email().sendRecordNotification(...args),
    'doi.publish': (...args: Parameters<Doi.Doi['publishDoiTrigger']>) => input.doi().publishDoiTrigger(...args),
    'doi.publishSync': (...args: Parameters<Doi.Doi['publishDoiTriggerSync']>) =>
      input.doi().publishDoiTriggerSync(...args),
    'doi.updateSync': (...args: Parameters<Doi.Doi['updateDoiTriggerSync']>) =>
      input.doi().updateDoiTriggerSync(...args),
    'raid.mint': (...args: Parameters<Raid.Raid['mintTrigger']>) => input.raid().mintTrigger(...args),
    'raid.mintPostCreateRetryHandler': (...args: Parameters<Raid.Raid['mintPostCreateRetryHandler']>) =>
      input.raid().mintPostCreateRetryHandler(...args),
    'oni.exportDataset': (...args: Parameters<Oni.OniService['exportDataset']>) => input.oni().exportDataset(...args),
    'figshare.validateFigshareRecord': (...args: Parameters<Figshare.FigshareService['validateFigshareRecord']>) =>
      input.figshare().validateFigshareRecord(...args),
    'figshare.wakeFigshareRecord': (...args: Parameters<Figshare.FigshareService['wakeFigshareRecord']>) =>
      input.figshare().wakeFigshareRecord(...args),
    'figshare.requestFigshareCleanup': (...args: Parameters<Figshare.FigshareService['requestFigshareCleanup']>) =>
      input.figshare().requestFigshareCleanup(...args),
  };
  return {
    operations,
    resolveHook(name: string): unknown {
      if (!Object.hasOwn(operations, name)) throw new Error('Unregistered record hook operation.');
      return operations[name as keyof typeof operations];
    },
  };
}
