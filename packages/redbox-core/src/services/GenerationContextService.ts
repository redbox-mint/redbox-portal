import { Services as services } from '../CoreService';
import { canonicalHash, GenerationActorContext, GenerationError, GenerationEvidence, GenerationFrozenInput, GenerationProfileDefinitionV1 } from '../model/generation';
import { requireService } from './generation/require-service';

type RecordLike = { redboxOid?: string; metadata?: Record<string, unknown>; metaMetadata?: Record<string, unknown>; workflow?: Record<string, unknown> };
interface RecordsLike {
  getMeta(oid: string): Promise<RecordLike>;
  hasViewAccess(brand: unknown, user: unknown, roles: unknown[], record: unknown): boolean;
}

function decodePointer(pointer: string): string[] {
  if (!pointer.startsWith('/')) throw new GenerationError('GENERATION_PROFILE_INVALID', 'Source mapping is not a JSON pointer');
  return pointer.slice(1).split('/').map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'));
}

function pointerGet(value: unknown, pointer: string): unknown {
  return decodePointer(pointer).reduce<unknown>((current, key) =>
    current && typeof current === 'object' ? (current as Record<string, unknown>)[key] : undefined, value);
}

function pointerSet(target: Record<string, unknown>, pointer: string, value: unknown): void {
  const parts = decodePointer(pointer);
  let current = target;
  parts.forEach((part, index) => {
    if (index === parts.length - 1) current[part] = value;
    else {
      const child = current[part];
      current[part] = child && typeof child === 'object' && !Array.isArray(child) ? child : {};
      current = current[part] as Record<string, unknown>;
    }
  });
}

export namespace Services {
  export class GenerationContextService extends services.Core.Service {
    protected override _exportedMethods = ['projectAllowedPaths', 'buildQuestionDefaults', 'prepare'];

    public projectAllowedPaths(source: Record<string, unknown>, allowedPaths: string[], maxBytes: number): Record<string, unknown> {
      const projected: Record<string, unknown> = {};
      for (const pointer of allowedPaths) {
        const value = pointerGet(source, pointer);
        if (value === undefined) continue;
        const valueBytes = Buffer.byteLength(JSON.stringify(value), 'utf8');
        if (valueBytes > maxBytes) throw new GenerationError('GENERATION_PROFILE_INVALID', `Source field '${pointer}' exceeds its context limit`);
        pointerSet(projected, pointer, value);
      }
      return projected;
    }

    public buildQuestionDefaults(definition: GenerationProfileDefinitionV1, sources: Record<string, unknown>): Array<{ id: string; value: unknown }> {
      return definition.questions.map((question) => ({
        id: question.id,
        value: question.sourceDefaultExpression?.startsWith('/')
          ? pointerGet(sources, question.sourceDefaultExpression)
          : null,
      }));
    }

    public async prepare(input: {
      actor: GenerationActorContext;
      brand: unknown;
      user: unknown;
      sourceRefs: Array<{ slotId: string; oid: string; recordType: string }>;
      definition: GenerationProfileDefinitionV1;
      answers: Array<{ id: string; value: unknown }>;
      targetForm: { recordType: string; formName?: string; mode: 'create' };
      targetDraft: Record<string, unknown>;
    }): Promise<GenerationFrozenInput> {
      const records = requireService<RecordsLike>('recordsservice', ['getMeta', 'hasViewAccess']);
      const userRoles = input.user && typeof input.user === 'object' && Array.isArray(Reflect.get(input.user, 'roles'))
        ? Reflect.get(input.user, 'roles') as unknown[]
        : [];
      const allowedQuestionIds = new Set(input.definition.questions.map((question) => question.id));
      if (input.answers.length !== allowedQuestionIds.size || new Set(input.answers.map((answer) => answer.id)).size !== allowedQuestionIds.size ||
        input.answers.some((answer) => !allowedQuestionIds.has(answer.id))) {
        throw new GenerationError('GENERATION_REQUEST_INVALID', 'Reviewed generation answers do not match the profile');
      }
      for (const question of input.definition.questions) {
        const answer = input.answers.find((candidate) => candidate.id === question.id);
        this.validateAnswer(question, answer?.value);
      }
      const sourceValues: GenerationFrozenInput['sources'] = [];
      const sourceEvidence: GenerationEvidence[] = [];
      for (const ref of input.sourceRefs) {
        const slot = input.definition.sourceSlots.find((candidate) => candidate.id === ref.slotId && candidate.recordType === ref.recordType);
        if (!slot) throw new GenerationError('GENERATION_SOURCE_FORBIDDEN', 'Generation source does not match the published profile');
        const record = await records.getMeta(ref.oid);
        if (!record || record.metaMetadata?.brandId !== input.actor.brandId ||
          !records.hasViewAccess(input.brand, input.user, userRoles, record)) {
          throw new GenerationError('GENERATION_SOURCE_FORBIDDEN', 'Generation source is not available');
        }
        const values = this.projectAllowedPaths(record.metadata ?? {}, slot.allowedPaths, slot.maxBytes);
        sourceValues.push({ slotId: slot.id, recordType: ref.recordType, oid: ref.oid, values });
        for (const pointer of slot.allowedPaths) {
          const value = pointerGet(record.metadata ?? {}, pointer);
          if (value === undefined) continue;
          const contentHash = canonicalHash(value);
          sourceEvidence.push({
            id: `source:${slot.id}:${pointer}:${contentHash}`,
            label: `${slot.id} ${pointer}`.slice(0, 200), kind: 'source', content: value, contentHash,
          });
        }
      }
      const targetDraft = this.projectTargetDraft(input.targetDraft, input.definition);
      const result: GenerationFrozenInput = {
        sources: sourceValues, answers: input.answers, targetForm: input.targetForm,
        targetDraft, baseTargetDigest: canonicalHash(targetDraft), sourceEvidence,
      };
      if (Buffer.byteLength(JSON.stringify(result), 'utf8') > input.definition.contextLimits.totalBytes) {
        throw new GenerationError('GENERATION_PROFILE_INVALID', 'Generation context exceeds the published profile limit');
      }
      return result;
    }

    private projectTargetDraft(source: Record<string, unknown>, definition: GenerationProfileDefinitionV1): Record<string, unknown> {
      const projected: Record<string, unknown> = {};
      for (const field of definition.targetFields) {
        const value = pointerGet(source, field.metadataPointer);
        if (value !== undefined) pointerSet(projected, field.metadataPointer, value);
      }
      return projected;
    }

    private validateAnswer(question: GenerationProfileDefinitionV1['questions'][number], value: unknown): void {
      const absent = value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
      if (absent) {
        if (question.required) throw new GenerationError('GENERATION_REQUEST_INVALID', `Generation answer '${question.id}' is required`);
        return;
      }
      const options = question.options?.map((option) => option.value) ?? [];
      switch (question.type) {
        case 'boolean':
          if (typeof value !== 'boolean') throw new GenerationError('GENERATION_REQUEST_INVALID', `Generation answer '${question.id}' must be boolean`);
          return;
        case 'multiEnum':
          if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !options.includes(item)) ||
            new Set(value).size !== value.length) {
            throw new GenerationError('GENERATION_REQUEST_INVALID', `Generation answer '${question.id}' is invalid`);
          }
          return;
        case 'enum':
          if (typeof value !== 'string' || !options.includes(value)) {
            throw new GenerationError('GENERATION_REQUEST_INVALID', `Generation answer '${question.id}' is invalid`);
          }
          return;
        case 'date':
          if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ||
            new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) {
            throw new GenerationError('GENERATION_REQUEST_INVALID', `Generation answer '${question.id}' must be an ISO date`);
          }
          return;
        case 'text':
        case 'textarea':
          if (typeof value !== 'string' || (question.maxLength !== undefined && value.length > question.maxLength)) {
            throw new GenerationError('GENERATION_REQUEST_INVALID', `Generation answer '${question.id}' is invalid`);
          }
          return;
      }
    }
  }
}
