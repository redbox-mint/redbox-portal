// This file is generated from internal/sails-ts/api/services/BrandingLogoService.ts. Do not edit directly.
import { PopulateExportedMethods, Services as coreServices } from '../../index';
import crypto from 'crypto';
import { GridFSBucket, Db } from 'mongodb';

export interface BrandingLogoService {
  getMaxBytes(): number;
  isSvg(buf: Buffer, ct: string): boolean;
  sanitizeAndValidate(fileBuf: Buffer, contentType: string): Promise<{ ok: boolean; sha256?: string; sanitizedBuffer?: Buffer; errors?: string[]; warnings?: string[]; finalContentType?: string; }>;
  putLogo(opts: { branding: string; portal: string; fileBuffer: Buffer; contentType: string; }): Promise<{
      hash: string;
      gridFsId: string;
      contentType: string;
      updatedAt: string;
    }>;
  getBinary(id: string): Buffer | null;
  getBinaryAsync(id: string): Promise<Buffer | null>;
}
