// This file is generated from internal/sails-ts/api/services/SassCompilerService.ts. Do not edit directly.
import { PopulateExportedMethods } from '../../index';
import { Services as services } from '../../index';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import sass from 'sass';
import os from 'os';
import fse from 'fs-extra';

declare const webpack: any;
declare const MiniCssExtractPlugin: any;
declare const CssMinimizerPlugin: any;

export interface SassCompilerService {
  getWhitelist(): string[];
  normaliseHex(value: string): string;
  buildRootScss(overrideLines: string[]): string;
  compile(variables: Record<string, string>): Promise<{ css: string; hash: string; }>;
}
