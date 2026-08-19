import type { FormConfigFrame } from '@researchdatabox/sails-ng-common';
import type { GenerationCandidatePatch, GenerationCandidatePatchItem, GenerationGroundingState } from '@researchdatabox/sails-ng-common';
import { Services as services } from '../CoreService';
import {
  canonicalHash,
  GenerationError,
  GenerationEvidence,
  GenerationOutputType,
  GenerationProfileDefinitionV1,
  GenerationProfileTargetField,
} from '../model/generation';

interface ResolvedFormTarget {
  metadataPointer: string;
  componentClass: string;
  disabled: boolean;
}

interface ProviderAnswer {
  value: unknown;
  evidenceIds: string[];
  rationale: string;
}

const SUPPORTED_COMPONENTS = new Set([
  'SimpleInputComponent', 'TextAreaComponent', 'RichTextEditorComponent', 'CheckboxInputComponent',
  'DateInputComponent', 'RadioInputComponent', 'DropdownInputComponent', 'TypeaheadInputComponent',
  'GroupComponent', 'RepeatableComponent',
]);

function schemaForOutput(output: GenerationOutputType, maxLength?: number): Record<string, unknown> {
  switch (output.kind) {
    case 'string':
    case 'richText': return { type: 'string', ...(maxLength || output.maxLength ? { maxLength: maxLength ?? output.maxLength } : {}) };
    case 'boolean': return { type: 'boolean' };
    case 'date': return { type: 'string', format: 'date' };
    case 'enum': return { type: 'string', enum: output.values };
    case 'enumArray': return { type: 'array', uniqueItems: true, items: { type: 'string', enum: output.values }, ...(output.maxItems ? { maxItems: output.maxItems } : {}) };
    case 'object': return {
      type: 'object', additionalProperties: false, required: Object.keys(output.properties),
      properties: Object.fromEntries(Object.entries(output.properties).map(([key, value]) => [key, schemaForOutput(value)])),
    };
    case 'objectArray': return {
      type: 'array', ...(output.maxItems ? { maxItems: output.maxItems } : {}),
      items: {
        type: 'object', additionalProperties: false, required: Object.keys(output.properties),
        properties: Object.fromEntries(Object.entries(output.properties).map(([key, value]) => [key, schemaForOutput(value)])),
      },
    };
  }
}

export namespace Services {
  export class GenerationSchemaService extends services.Core.Service {
    protected override _exportedMethods = ['resolveFormTargets', 'validateTargets', 'buildProviderSchema', 'validateCandidate'];

    public resolveFormTargets(form: FormConfigFrame): Map<string, ResolvedFormTarget> {
      const result = new Map<string, ResolvedFormTarget>();
      const visit = (items: unknown[], parents: string[]) => {
        for (const raw of items) {
          if (!raw || typeof raw !== 'object') continue;
          const item = raw as Record<string, unknown>;
          const name = String(item.name ?? '').trim();
          const lineage = name ? [...parents, name] : parents;
          const component = (item.component ?? {}) as Record<string, unknown>;
          const config = (component.config ?? {}) as Record<string, unknown>;
          if (name && component.class) {
            result.set(`/${lineage.map((part) => part.replaceAll('~', '~0').replaceAll('/', '~1')).join('/')}`, {
              metadataPointer: `/${lineage.join('/')}`,
              componentClass: String(component.class),
              disabled: config.disabled === true || config.readonly === true || config.editMode === false,
            });
          }
          const children = config.componentDefinitions;
          if (Array.isArray(children)) visit(children, lineage);
        }
      };
      visit(form.componentDefinitions as unknown[], []);
      return result;
    }

    public validateTargets(definition: GenerationProfileDefinitionV1, form: FormConfigFrame): Map<string, ResolvedFormTarget> {
      const resolved = this.resolveFormTargets(form);
      for (const target of definition.targetFields) {
        const formTarget = resolved.get(target.metadataPointer);
        if (!formTarget || formTarget.disabled || !SUPPORTED_COMPONENTS.has(formTarget.componentClass) ||
          !target.expectedComponentClasses.includes(formTarget.componentClass)) {
          throw new GenerationError('GENERATION_PROFILE_INVALID', `Target '${target.id}' does not resolve to an editable supported form component`);
        }
      }
      return resolved;
    }

    public buildProviderSchema(definition: GenerationProfileDefinitionV1): Record<string, unknown> {
      const answerProperties = Object.fromEntries(definition.targetFields.map((field) => [field.id, {
        type: 'object', additionalProperties: false, required: ['value', 'evidenceIds', 'rationale'],
        properties: {
          value: schemaForOutput(field.output, field.maxLength),
          evidenceIds: { type: 'array', uniqueItems: true, items: { type: 'string', maxLength: 300 } },
          rationale: { type: 'string', maxLength: 500 },
        },
      }]));
      return {
        type: 'object', additionalProperties: false, required: ['answers'],
        properties: {
          answers: {
            type: 'object', additionalProperties: false,
            required: definition.targetFields.map((field) => field.id),
            properties: answerProperties,
          },
        },
      };
    }

    public validateCandidate(input: {
      runId: string;
      rawContent: string;
      definition: GenerationProfileDefinitionV1;
      evidence: GenerationEvidence[];
      baseTargetDigest: string;
      maxResponseBytes?: number;
    }): GenerationCandidatePatch {
      const maxBytes = input.maxResponseBytes ?? sails.config.generation.provider.maxResponseBytes;
      if (Buffer.byteLength(input.rawContent, 'utf8') > maxBytes) {
        throw new GenerationError('GENERATION_OUTPUT_PARSE_FAILED', 'Generation response exceeds the configured size limit');
      }
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(input.rawContent) as Record<string, unknown>;
      } catch {
        throw new GenerationError('GENERATION_OUTPUT_PARSE_FAILED', 'Generation response is not valid JSON');
      }
      if (Object.keys(parsed).length !== 1 || !parsed.answers || typeof parsed.answers !== 'object' || Array.isArray(parsed.answers)) {
        throw new GenerationError('GENERATION_OUTPUT_SCHEMA_INVALID', 'Generation response envelope is invalid');
      }
      const answers = parsed.answers as Record<string, ProviderAnswer>;
      const expectedIds = input.definition.targetFields.map((field) => field.id);
      const actualIds = Object.keys(answers);
      if (actualIds.length !== expectedIds.length || actualIds.some((id) => !expectedIds.includes(id))) {
        throw new GenerationError('GENERATION_OUTPUT_SCHEMA_INVALID', 'Generation response fields do not match the profile allowlist');
      }
      const evidenceById = new Map(input.evidence.map((item) => [item.id, item]));
      const items = input.definition.targetFields.map((field) => this.validateAnswer(field, answers[field.id], evidenceById));
      const candidateDigest = canonicalHash(items.map(({ fieldId, value, valueHash }) => ({ fieldId, value, valueHash })));
      return { runId: input.runId, candidateDigest, baseTargetDigest: input.baseTargetDigest, items };
    }

    private validateAnswer(
      field: GenerationProfileTargetField,
      answer: ProviderAnswer | undefined,
      evidenceById: Map<string, GenerationEvidence>,
    ): GenerationCandidatePatchItem {
      if (!answer || typeof answer !== 'object' || !Array.isArray(answer.evidenceIds) || typeof answer.rationale !== 'string') {
        throw new GenerationError('GENERATION_OUTPUT_SCHEMA_INVALID', `Generation answer '${field.id}' is invalid`);
      }
      let value = answer.value;
      let evidenceIds = [...new Set(answer.evidenceIds)];
      if (evidenceIds.some((id) => !evidenceById.has(id))) {
        throw new GenerationError('GENERATION_EVIDENCE_INVALID', `Generation answer '${field.id}' cited unknown evidence`);
      }
      let reviewRequired = false;
      let reviewReasonCode: string | undefined;
      const evidence = evidenceIds.map((id) => evidenceById.get(id)!);
      const hasSource = evidence.some((item) => item.kind === 'source');
      const hasGuidance = evidence.some((item) => item.kind === 'knowledge');
      const missingRequired = (field.grounding === 'sourceRequired' && !hasSource) ||
        (field.grounding === 'guidanceRequired' && !hasGuidance) ||
        (field.grounding === 'sourceOrGuidance' && !hasSource && !hasGuidance);
      if (missingRequired) {
        if (!field.fallback) throw new GenerationError('GENERATION_EVIDENCE_INVALID', `Generation answer '${field.id}' lacks required evidence`);
        value = field.fallback.value;
        evidenceIds = [];
        reviewRequired = field.fallback.reviewRequired;
        reviewReasonCode = field.fallback.reasonCode;
      }
      this.validateValue(field, value);
      const groundingState: GenerationGroundingState = reviewRequired
        ? 'requiresReview'
        : hasSource && hasGuidance ? 'sourceAndGuidance'
          : hasSource ? 'sourceBacked' : hasGuidance ? 'guidanceBacked' : 'inferred';
      return {
        fieldId: field.id, metadataPointer: field.metadataPointer, value, operation: 'fill', valueHash: canonicalHash(value),
        groundingState, reviewRequired, reviewReasonCode, rationale: answer.rationale.slice(0, 500),
        evidence: evidenceIds.map((id) => {
          const item = evidenceById.get(id)!;
          return { id, label: item.label.slice(0, 200), kind: item.kind };
        }),
      };
    }

    private validateValue(field: GenerationProfileTargetField, value: unknown): void {
      const fail = (): never => { throw new GenerationError('GENERATION_OUTPUT_SCHEMA_INVALID', `Generation value for '${field.id}' is invalid`); };
      const output = field.output;
      switch (output.kind) {
        case 'string':
        case 'richText':
          if (typeof value !== 'string' || value.length > (field.maxLength ?? output.maxLength ?? Number.MAX_SAFE_INTEGER) ||
            /<(script|iframe|object|embed|style|link|meta)\b|\bon\w+\s*=|javascript\s*:/i.test(value)) fail();
          return;
        case 'boolean': if (typeof value !== 'boolean') fail(); return;
        case 'date': if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ||
          new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) fail(); return;
        case 'enum': if (typeof value !== 'string' || !output.values.includes(value)) fail(); return;
        case 'enumArray':
          if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !output.values.includes(item)) ||
            new Set(value).size !== value.length || (output.maxItems !== undefined && value.length > output.maxItems)) fail();
          return;
        case 'object': this.validateObjectValue(value, output.properties, fail); return;
        case 'objectArray': {
          const arrayValue: unknown[] = Array.isArray(value) ? value : fail();
          if (output.maxItems !== undefined && arrayValue.length > output.maxItems) fail();
          arrayValue.forEach((item: unknown) => this.validateObjectValue(item, output.properties, fail));
          return;
        }
      }
    }

    private validateObjectValue(value: unknown, properties: Record<string, GenerationOutputType>, fail: () => never): void {
      if (!value || typeof value !== 'object' || Array.isArray(value) ||
        Object.keys(value as Record<string, unknown>).some((key) => !(key in properties)) ||
        Object.keys(properties).some((key) => !(key in (value as Record<string, unknown>)))) fail();
      for (const [key, output] of Object.entries(properties)) {
        this.validateValue({
          id: key, metadataPointer: `/${key}`, expectedComponentClasses: ['GroupComponent'], output,
          operation: 'fill', grounding: 'inferenceAllowed',
        }, (value as Record<string, unknown>)[key]);
      }
    }
  }
}
