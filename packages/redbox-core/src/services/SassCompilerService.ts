import { PopulateExportedMethods } from '../decorator/PopulateExportedMethods.decorator';
import { Services as services } from '../CoreService';
import * as BrandingThemeCssServiceModule from './BrandingThemeCssService';

/**
 * SassCompilerService
 * Deprecated compatibility wrapper for variable CSS generation.
 */
export namespace Services {
  @PopulateExportedMethods
  export class SassCompiler extends services.Core.Service {
    constructor(private readonly theme: BrandingThemeCssServiceModule.Services.BrandingThemeCss) {
      super();
    }

    getAllowedVariableKeys(): string[] {
      return this.theme.getAllowedVariableKeys();
    }

    normalizeHex(value: string): string {
      return this.theme.normalizeHex(value);
    }

    validateVariables(variables: Record<string, string>): Record<string, string> {
      return this.theme.validateVariables(variables);
    }

    async compile(variables: Record<string, string>): Promise<{ css: string; hash: string }> {
      return this.theme.generate(variables);
    }
  }
}
