// This file is generated from internal/sails-ts/api/services/ConfigService.ts. Do not edit directly.
import { Observable } from 'rxjs';
import {BrandingModel, Services as services} from '../../index';
import {Sails, Model} from "sails";
import * as fs from 'fs-extra';
import { resolve, basename } from 'path';
import { glob } from 'fs';

export interface ConfigService {
  getBrand(brandName: string, configBlock: string): any;
  mergeHookConfig(hookName: string, configMap?: any, config_dirs?: string[], branded_app_config_dirs?: string[], dontMergeFields?: any[]): any;
}
