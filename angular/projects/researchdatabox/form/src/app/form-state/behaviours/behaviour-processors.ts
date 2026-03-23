import { FormBehaviourProcessorConfig, FormBehaviourProcessorType } from '@researchdatabox/sails-ng-common';
import { LoggerService, RecordService } from '@researchdatabox/portal-ng-common';
import { BehaviourCompiledTemplateEvaluator } from './behaviour-compiled-template-evaluator';

/**
 * Shared value bag passed between behaviour processors and actions.
 *
 * The pipeline is intentionally simple in v1: each processor replaces the
 * current `value`, and actions then consume the final result plus the original
 * event/form context.
 */
export interface BehaviourPipelineContext {
  [key: string]: unknown;
  value: unknown;
  event: unknown;
  formData: Record<string, unknown>;
  requestParams: Record<string, unknown>;
  runtimeContext: Record<string, unknown>;
  querySource?: unknown;
}

export interface BehaviourProcessorExecutionContext {
  behaviourIndex: number;
  processorIndex: number;
  compiledTemplateEvaluator?: BehaviourCompiledTemplateEvaluator;
  recordService: RecordService;
  logger: LoggerService;
  // Kept for compatibility with the broader behaviour API, even though refresh
  // fetches intentionally avoid replaying cached metadata.
  metadataCache: Map<string, unknown>;
}

/**
 * Execute one processor step in the behaviour pipeline.
 *
 * v1 is intentionally limited to a small built-in set. Future work can expand
 * this dispatch table, but hook-driven extensibility is explicitly out of scope
 * for the first release.
 */
export async function executeBehaviourProcessor(
  processor: FormBehaviourProcessorConfig,
  pipelineContext: BehaviourPipelineContext,
  ctx: BehaviourProcessorExecutionContext
): Promise<unknown> {
  switch (processor.type) {
    case FormBehaviourProcessorType.JSONataTransform:
      return executeJSONataTransform(processor, pipelineContext, ctx);
    case FormBehaviourProcessorType.FetchMetadata:
      return executeFetchMetadata(pipelineContext.value, ctx);
    default:
      return pipelineContext.value;
  }
}

/**
 * JSONata transform processor.
 *
 * If the template was stripped for client delivery, the compiled evaluator is
 * used; otherwise the raw template value is treated as a fallback for tests or
 * non-stripped contexts.
 */
async function executeJSONataTransform(
  processor: Extract<FormBehaviourProcessorConfig, { type: 'jsonataTransform' }>,
  pipelineContext: BehaviourPipelineContext,
  ctx: BehaviourProcessorExecutionContext
): Promise<unknown> {
  const templateConfig = processor.config ?? {};
  if (templateConfig.hasTemplate && ctx.compiledTemplateEvaluator) {
    return ctx.compiledTemplateEvaluator.evaluate(
      ctx.behaviourIndex,
      ['processors', ctx.processorIndex, 'config', 'template'],
      pipelineContext
    );
  }
  return templateConfig.template ?? pipelineContext.value;
}

/**
 * Metadata lookup processor used by behaviour pipelines.
 *
 * Design and limitations aligned with the implementation plan:
 * - consumes the current pipeline value as the candidate OID
 * - no-ops for empty or non-string input
 * - replaces pipeline value with returned metadata
 * - does not emit events; downstream actions decide what to do
 * - repeated executions must re-fetch so explicit refresh actions can observe
 *   external changes made after the initial load
 */
async function executeFetchMetadata(value: unknown, ctx: BehaviourProcessorExecutionContext): Promise<unknown> {
  if (typeof value !== 'string') {
    return value;
  }

  const oid = value.trim();
  if (!oid) {
    return value;
  }

  // Explicit refresh is expected to observe newly saved server state, including
  // saves made from another browser tab.
  const metadata = await ctx.recordService.getRecordMeta(oid);
  const payload =
    typeof metadata === 'object' && metadata !== null
      ? { ...(metadata as Record<string, unknown>), oid }
      : { oid, value: metadata };
  return payload;
}
