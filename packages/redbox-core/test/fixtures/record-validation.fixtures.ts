import type { FormConfigFrame, FormConfigOutline, ValidationMode } from '@researchdatabox/sails-ng-common';
import type { FormAttributes } from '../../src/waterline-models/Form';
import type {
  RecordValidationCandidate,
  RecordValidationMetricsHooks,
  RecordValidationRequest,
  RecordValidationResolutionMetric,
  RecordValidationServiceDependencies,
} from '../../src/services/RecordValidationService';
import type { FormValidatorSummaryErrors } from '@researchdatabox/sails-ng-common';

export interface RecordValidationFixtureOptions {
  mode?: ValidationMode;
  candidate?: Partial<RecordValidationCandidate>;
  form?: FormConfigFrame;
  recordType?: Record<string, unknown> | null;
  startingStep?: Record<string, unknown> | null;
  workflowSteps?: Readonly<Record<string, Record<string, unknown> | null>>;
}

export interface RecordValidationFixture {
  request: RecordValidationRequest;
  dependencies: RecordValidationServiceDependencies;
  metrics: RecordValidationMetricsHooks;
  metricEvents: RecordValidationResolutionMetric[];
  calls: {
    recordTypes: Array<{ brand: string; recordType: string }>;
    startingSteps: number;
    workflowSteps: string[];
    forms: Array<{ formName: string; brand: string }>;
    validatorGroups: string[][];
  };
}

export function validationForm(overrides: Partial<FormConfigFrame> = {}): FormConfigFrame {
  return {
    name: 'dataset-2.4-draft',
    type: 'dataset',
    enabledValidationGroups: ['base'],
    validationGroups: {
      all: { description: 'all', initialMembership: 'all' },
      none: { description: 'none', initialMembership: 'none' },
      base: { description: 'base', initialMembership: 'all' },
      conditional: { description: 'conditional', initialMembership: 'none' },
      submit: { description: 'submit', initialMembership: 'none' },
      stage: { description: 'stage', initialMembership: 'none' },
    },
    validationOperations: {
      submit: {
        enabledValidationGroups: ['submit'],
        roles: ['Researcher', 'Librarian'],
        allowedTargetSteps: ['review', 'published'],
      },
    },
    componentDefinitions: [],
    ...overrides,
  };
}

export function validationCandidate(overrides: Partial<RecordValidationCandidate> = {}): RecordValidationCandidate {
  return {
    redboxOid: 'oid-1',
    metadata: { title: 'Final title', activate: true },
    metaMetadata: { brandId: 'brand-1', type: 'dataset', form: 'dataset-2.4-draft' },
    workflow: { stage: 'draft' },
    ...overrides,
  };
}

export function createRecordValidationFixture(options: RecordValidationFixtureOptions = {}): RecordValidationFixture {
  const form = options.form ?? validationForm();
  const calls = {
    recordTypes: [] as Array<{ brand: string; recordType: string }>,
    startingSteps: 0,
    workflowSteps: [] as string[],
    forms: [] as Array<{ formName: string; brand: string }>,
    validatorGroups: [] as string[][],
  };
  const metricEvents: RecordValidationResolutionMetric[] = [];
  const recordType =
    options.recordType === undefined
      ? { id: 'record-type-1', name: 'dataset', recordValidation: { mode: options.mode } }
      : options.recordType;
  const startingStep =
    options.startingStep === undefined
      ? { name: 'draft', starting: true, config: { form: 'dataset-2.4-draft', workflow: { stage: 'draft' } } }
      : options.startingStep;
  const workflowSteps = {
    draft: { name: 'draft', config: { form: 'dataset-2.4-draft', workflow: { stage: 'draft' } } },
    review: { name: 'review', config: { form: 'dataset-2.4-review', workflow: { stage: 'review' } } },
    published: { name: 'published', config: { form: 'dataset-2.4-published', workflow: { stage: 'published' } } },
    ...(options.workflowSteps ?? {}),
  };
  const dependencies: RecordValidationServiceDependencies = {
    loadRecordType: async (brand, recordTypeName) => {
      calls.recordTypes.push({ brand, recordType: recordTypeName });
      return recordType as never;
    },
    loadStartingWorkflowStep: async () => {
      calls.startingSteps += 1;
      return startingStep as never;
    },
    loadWorkflowStep: async (_recordType, step) => {
      calls.workflowSteps.push(step);
      return (workflowSteps as Record<string, unknown>)[step] as never;
    },
    loadForm: async (formName, brand) => {
      calls.forms.push({ formName, brand });
      if (formName !== String(form.name ?? '')) return null;
      return {
        id: `form-${formName}`,
        name: formName,
        branding: brand,
        configuration: form,
      } as unknown as FormAttributes;
    },
    constructForm: async rawForm => rawForm as unknown as FormConfigOutline,
    executeValidators: async (_form, groups): Promise<FormValidatorSummaryErrors[]> => {
      calls.validatorGroups.push([...groups]);
      return [];
    },
  };
  return {
    request: {
      candidate: validationCandidate(options.candidate),
      writeKind: 'update',
      actor: { authenticated: true, roles: ['Researcher'] },
      requestId: 'request-1',
    },
    dependencies,
    metrics: { resolutionCompleted: metric => metricEvents.push(metric) },
    metricEvents,
    calls,
  };
}
