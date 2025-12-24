// This file is generated from internal/sails-ts/api/services/BrandingService.ts. Do not edit directly.
import { Observable, of, throwError } from 'rxjs';
import { mergeMap as flatMap } from 'rxjs/operators';
import { Services as services, BrandingModel, BrandingConfigWaterlineModel, BrandingConfigAttributes, BrandingConfigHistoryWaterlineModel, CacheEntryWaterlineModel } from '../../index';
import { Sails } from "sails";
import * as crypto from 'crypto';

export interface BrandingService {
  bootstrap(...args: any[]): any;
  loadAvailableBrands(...args: any[]): any;
  getDefault(...args: any[]): any;
  getBrand(...args: any[]): any;
  getAvailable(...args: any[]): any;
  getBrandAndPortalPath(req: any): string;
  getBrandFromReq(req: any): string;
  getPortalFromReq(req: any): any;
  getFullPath(req: any): string;
  getRootContext(): string;
  getBrandById(...args: any[]): any;
  getBrandingFromDB(name: string): Promise<BrandingConfigAttributes>;
  saveDraft(input: { branding: string; variables: Record<string, string>; actor?: any; }): Promise<any>;
  preview(branding: string, portal: string): Promise<{ token: string; url: string; hash: string; }>;
  fetchPreview(token: string): Promise<{ css: string; branding: string; portal: string; hash: string; }>;
  publish(branding: string, portal: string, actor: any, opts?: { expectedVersion?: number; }): Promise<{ version: number; hash: string; idempotent?: boolean; }>;
  rollback(historyId: string, actor: any): Promise<{ version: number; hash: string; branding: any; }>;
  refreshBrandingCache(id: any): any;
}
