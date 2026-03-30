import jsonata from 'jsonata';
import { LoggerService } from '@researchdatabox/portal-ng-common';

/**
 * Minimal shape needed from the dynamically imported compiled-items module.
 *
 * Behaviours reuse the same compiled asset mechanism as expressions, but with a
 * different key space rooted at `behaviours[]` instead of component lineage.
 */
export interface BehaviourCompiledItemsModule {
  evaluate: (key: (string | number)[], context: unknown, extra?: unknown) => unknown;
}

/**
 * Evaluates compiled JSONata entries for form behaviours.
 *
 * Intent:
 * - bridge top-level behaviour config to the existing compiled-item evaluator
 * - keep evaluation stateless so handlers can build their own pipeline context
 *
 * Design notes:
 * - keys are always `['behaviours', behaviourIndex, ...propertyPath]`
 * - context values are cloned defensively to match expression evaluation and to
 *   avoid accidental mutation inside JSONata libraries
 *
 * Limitations:
 * - v1 only targets the built-in behaviour properties defined in the plan
 * - it does not own caching; callers decide lifecycle and reuse
 */
export class BehaviourCompiledTemplateEvaluator {
  constructor(
    private readonly compiledItems: BehaviourCompiledItemsModule,
    private readonly logger: LoggerService
  ) {}

  async evaluate(
    behaviourIndex: number,
    propertyPath: (string | number)[],
    context: Record<string, unknown>
  ): Promise<unknown> {
    const key = ['behaviours', behaviourIndex, ...propertyPath];
    try {
      return await this.compiledItems.evaluate(key, this.cloneContext(context), { libraries: { jsonata } });
    } catch (error) {
      this.logger.error('BehaviourCompiledTemplateEvaluator: Failed to evaluate compiled behaviour template.', {
        error,
        key,
      });
      throw error;
    }
  }

  private cloneContext(context: Record<string, unknown>): Record<string, unknown> {
    const cloned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(context)) {
      if (value === undefined) {
        cloned[key] = value;
        continue;
      }
      try {
        cloned[key] = structuredClone(value);
      } catch (error) {
        this.logger.warn(
          'BehaviourCompiledTemplateEvaluator: Failed to clone behaviour context value. Falling back to the original value.',
          {
            error,
            key,
          }
        );
        cloned[key] = value;
      }
    }
    return cloned;
  }
}
