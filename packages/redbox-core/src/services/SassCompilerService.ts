import { PopulateExportedMethods } from '../decorator/PopulateExportedMethods.decorator';
import { Services as services } from '../CoreService';
import * as BrandingThemeCssServiceModule from './BrandingThemeCssService';

declare const BrandingThemeCssService: BrandingThemeCssServiceModule.Services.BrandingThemeCss;

/**
 * SassCompilerService
 * Deprecated compatibility wrapper for variable CSS generation.
 */
export namespace Services {
  @PopulateExportedMethods
  export class SassCompiler extends services.Core.Service {
    getAllowedVariableKeys(): string[] {
      return BrandingThemeCssService.getAllowedVariableKeys();
    }

    normalizeHex(value: string): string {
      return BrandingThemeCssService.normalizeHex(value);
    }

    validateVariables(variables: Record<string, string>): Record<string, string> {
      return BrandingThemeCssService.validateVariables(variables);
    }

    async compile(variables: Record<string, string>): Promise<{ css: string; hash: string }> {
      return BrandingThemeCssService.generate(variables);
    }
  }
}

declare global {
  let SassCompilerService: Services.SassCompiler;
}
