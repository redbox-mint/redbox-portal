import { logEventWithLogger } from '../../integrations/FigshareObservability';
import type { FigshareRunContext } from './types';
export { withSpan, redactObject, redactSecret } from '../../integrations/FigshareObservability';
export function logEvent(level: string, message: string, context: FigshareRunContext, payload: unknown = {}): void {
  logEventWithLogger(sails.log, level, message, context, payload);
}
