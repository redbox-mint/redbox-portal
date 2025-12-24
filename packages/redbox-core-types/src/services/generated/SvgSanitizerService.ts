// This file is generated from internal/sails-ts/api/services/SvgSanitizerService.ts. Do not edit directly.
import { PopulateExportedMethods, Services as coreServices } from '../../index';
import { Buffer } from 'buffer';
import { JSDOM } from 'jsdom';

export type DomPurifyInstance = {
  sanitize: (input: string, config?: Record<string, any>) => string;
  addHook: (hook: string, cb: (...args: any[]) => void) => void;
  removeHook: (hook: string) => void;
};
declare const isDomPurifyInstance: any;
declare const getWindow: any;
declare const instantiateDomPurify: any;
declare const initialiseDOMPurify: any;
declare const DOMPurify: any;

export interface SvgSanitizerService {
  getMaxBytes(): number;
  sanitizeWithProfile(content: string, profileName?: string): string;
  sanitize(svg: string): {
      safe: boolean;
      sanitized: string;
      errors: string[];
      warnings: string[];
      info: { originalBytes: number; sanitizedBytes: number };
    };
}
