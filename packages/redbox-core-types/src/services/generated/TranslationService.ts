// This file is generated from internal/sails-ts/api/services/TranslationService.ts. Do not edit directly.
import { Observable } from 'rxjs';
import {BrandingModel, PopulateExportedMethods, Services as services} from '../../index';
import { Sails, Model } from "sails";
import i18next from "i18next"

export interface TranslationService {
  clearInstances(brandingId?: string): any;
  bootstrap(): any;
  t(key: any, context?: any, langCode?: string, brandingName?: string): any;
  tInter(key: any, context?: any, langCode?: string): any;
  reloadResources(brandingId?: string): any;
  getAvailableLanguagesForBranding(branding: any): Promise<string[]>;
  handle(req: any, res: any, next: any): any;
}
