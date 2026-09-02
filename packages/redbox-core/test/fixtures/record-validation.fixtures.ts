import {
  FormConfig,
  type FormConfigFrame,
  type FormConfigOutline,
  type ValidationMode,
} from '@researchdatabox/sails-ng-common';
import type { FormAttributes } from '../../src/waterline-models/Form';
import type {
  RecordValidationCandidate,
  RecordValidationRequest,
  RecordValidationResult,
  RecordValidationServiceDependencies,
} from '../../src/services/RecordValidationService';

type ResolvedRecordValidationResult = Extract<RecordValidationResult, { status: 'resolved' }>;

export function buildResolvedRecordValidationResult(
  request: RecordValidationRequest,
  overrides: Partial<Omit<ResolvedRecordValidationResult, 'status'>> = {}
): ResolvedRecordValidationResult {
  const formName =
    typeof request.candidate.metaMetadata.form === 'string' ? request.candidate.metaMetadata.form : 'default-form';
  const recordType =
    typeof request.candidate.metaMetadata.type === 'string' ? request.candidate.metaMetadata.type : 'dataset';
  const brand =
    typeof request.candidate.metaMetadata.brandId === 'string' ? request.candidate.metaMetadata.brandId : 'brand-1';
  const candidateWorkflowStep = request.candidate.workflow?.stage;
  const workflowStep =
    request.currentStep ?? (typeof candidateWorkflowStep === 'string' ? candidateWorkflowStep : 'draft');
  const constructedForm = new FormConfig();
  constructedForm.name = formName;
  constructedForm.componentDefinitions = [];

  return {
    status: 'resolved',
    shouldBlock: false,
    mode: 'shadow',
    formName,
    effectiveGroups: [],
    resolved: {
      constructedForm,
      formName,
      recordType,
      brand,
      workflowStep,
      conditionalGroups: [],
    },
    blockingErrors: [],
    advisoryErrors: [],
    advisoryGroups: [],
    diagnostics: [],
    transformedCandidate: request.candidate,
    ...overrides,
  };
}

export interface RecordValidationFixtureOptions {
  mode?: ValidationMode;
  candidate?: Partial<RecordValidationCandidate>;
  form?: FormConfigFrame;
  existingRecord?: Readonly<Record<string, unknown>> | null;
  recordType?: Record<string, unknown> | null;
  startingStep?: Record<string, unknown> | null;
  workflowSteps?: Readonly<Record<string, Record<string, unknown> | null>>;
}

export interface RecordValidationFixture {
  request: RecordValidationRequest;
  dependencies: RecordValidationServiceDependencies;
  calls: {
    records: string[];
    recordTypes: Array<{ brand: string; recordType: string }>;
    startingSteps: number;
    workflowSteps: string[];
    workflowStepLists: number;
    forms: Array<{ formName: string; brand: string }>;
    constructions: number;
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
    records: [] as string[],
    recordTypes: [] as Array<{ brand: string; recordType: string }>,
    startingSteps: 0,
    workflowSteps: [] as string[],
    workflowStepLists: 0,
    forms: [] as Array<{ formName: string; brand: string }>,
    constructions: 0,
    validatorGroups: [] as string[][],
  };
  const recordType =
    options.recordType === undefined
      ? { id: 'record-type-1', name: 'dataset', recordValidation: { mode: options.mode } }
      : options.recordType;
  const startingStep: Record<string, unknown> | null =
    options.startingStep === undefined
      ? { name: 'draft', starting: true, config: { form: 'dataset-2.4-draft', workflow: { stage: 'draft' } } }
      : options.startingStep;
  const workflowSteps: Record<string, Record<string, unknown> | null> = {
    draft: { name: 'draft', config: { form: 'dataset-2.4-draft', workflow: { stage: 'draft' } } },
    review: { name: 'review', config: { form: 'dataset-2.4-review', workflow: { stage: 'review' } } },
    published: { name: 'published', config: { form: 'dataset-2.4-published', workflow: { stage: 'published' } } },
    ...(options.workflowSteps ?? {}),
  };
  const candidate = validationCandidate(options.candidate);
  const existingRecord =
    options.existingRecord === undefined
      ? {
          redboxOid: candidate.redboxOid,
          metadata: candidate.metadata,
          metaMetadata: candidate.metaMetadata,
          ...(candidate.workflow ? { workflow: candidate.workflow } : {}),
        }
      : options.existingRecord;
  const dependencies: RecordValidationServiceDependencies = {
    loadRecord: async oid => {
      calls.records.push(oid);
      return existingRecord;
    },
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
      return workflowSteps[step] as never;
    },
    loadWorkflowSteps: async () => {
      calls.workflowStepLists += 1;
      const steps = Object.values(workflowSteps).filter((step): step is Record<string, unknown> => step !== null);
      if (startingStep) {
        const startingStepName = typeof startingStep.name === 'string' ? startingStep.name : '';
        const existingIndex = steps.findIndex(step => step.name === startingStepName);
        if (existingIndex >= 0) steps[existingIndex] = { ...steps[existingIndex], starting: true };
        else steps.push(startingStep);
      }
      return steps as never;
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
    constructForm: async rawForm => {
      calls.constructions += 1;
      return rawForm as unknown as FormConfigOutline;
    },
    executeValidators: async (_form, groups) => {
      calls.validatorGroups.push([...groups]);
      return { summaries: [], transformations: [] };
    },
  };
  return {
    request: {
      candidate,
      writeKind: 'update',
      actor: { authenticated: true, roles: ['Researcher'] },
      requestId: 'request-1',
    },
    dependencies,
    calls,
  };
}
