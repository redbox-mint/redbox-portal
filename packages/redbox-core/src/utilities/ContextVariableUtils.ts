import { ContextVariables } from '../forms/ContextVariables';
export class ContextVariableUtils {
  public static evaluateContextVariables(req: Sails.Req, recordData: unknown): Record<string, string> {
    return new ContextVariables(sails.config.record?.contextVariables ?? {}, sails.log).evaluateContextVariables(
      req,
      recordData
    );
  }
}
