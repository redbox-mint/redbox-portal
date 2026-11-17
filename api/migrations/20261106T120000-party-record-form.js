'use strict';

// Upgrade only the stock read-only starting party workflow. Custom forms stay selected.
module.exports = {
  name: '20261106T120000-party-record-form',
  up: async ({ context: sails }) => {
    const { recordtype: RecordType, workflowstep: WorkflowStep } = sails.models;
    for (const type of await RecordType.find({ name: 'party' })) {
      for (const step of await WorkflowStep.find({ recordType: type.id, starting: true })) {
        if (step.config.form !== 'generated-view-only') continue;
        const config = { ...step.config, form: 'party-1.0-draft' };
        await sails.services.formsservice.bootstrap({ ...step, config }, String(type.branding));
        await WorkflowStep.updateOne({ id: step.id }).set({ config });
      }
    }
  },
};
