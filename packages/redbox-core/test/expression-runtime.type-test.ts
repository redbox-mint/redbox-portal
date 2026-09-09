import { ExpressionRuntime, ActionRegistry } from '../dist';

export async function publicConsumer(context: ActionRegistry.ActionContext): Promise<string> {
  const prepared: ExpressionRuntime.PreparedJsonataExpression =
    ExpressionRuntime.compileManagedJsonataExpression('true');
  const transition = ExpressionRuntime.projectTransitionConditionContext(context);
  const condition: boolean = await ExpressionRuntime.evaluateManagedCondition(prepared, transition);
  const parameters = ExpressionRuntime.projectActionParameterContext(context);
  const result: ExpressionRuntime.ManagedJsonataResult = await ExpressionRuntime.evaluateManagedJsonata(
    prepared,
    parameters
  );
  const text = ExpressionRuntime.projectTextTemplateContext(context);
  const template = ExpressionRuntime.compileManagedHandlebarsTemplate('{{record.oid}}', 'html-text');
  const rendered: string = await ExpressionRuntime.renderManagedHandlebars(template, text);
  if (!condition || result === undefined) return '';
  return rendered;
}

// @ts-expect-error A JavaScript destination is not a supported text sink.
ExpressionRuntime.compileManagedHandlebarsTemplate('{{record}}', 'javascript');
// @ts-expect-error Caller-provided bindings are not part of the evaluation contract.
const options: ExpressionRuntime.ManagedEvaluationOptions = { bindings: {} };
void options;
