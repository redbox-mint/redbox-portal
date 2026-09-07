// Copyright (c) 2017 Queensland Cyber Infrastructure Foundation (http://www.qcif.edu.au/)
//
// GNU GENERAL PUBLIC LICENSE
//    Version 2, June 1991
//
// This program is free software; you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation; either version 2 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License along
// with this program; if not, write to the Free Software Foundation, Inc.,
// 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.

import { Observable, of, throwError } from 'rxjs';
import { mergeMap as flatMap } from 'rxjs/operators';
import { Services as services } from '../CoreService';
import { BrandingModel } from '../model/storage/BrandingModel';
import { BrandingConfigAttributes } from '../waterline-models/BrandingConfig';
import { BrandingConfigHistoryAttributes } from '../waterline-models/BrandingConfigHistory';
import * as crypto from 'crypto';
import * as BrandingThemeCssServiceModule from './BrandingThemeCssService';
import * as BrandingTypefaceServiceModule from './BrandingTypefaceService';
import { getBrandingPositiveInt } from '../config/branding.config';
import {
  BRANDING_HISTORY_MAX_VERSIONS,
  BRANDING_TYPEFACE_FACE_MAX_BYTES,
  BRANDING_TYPEFACE_FAMILY_MAX_BYTES,
  isBrandingTypefaceSlot,
  isPublishableTypefaceState,
  normalizeTypefaceState,
  orderedTypefaceFaces,
  type BrandingTypefaceSlot,
  type BrandingTypefaceState,
} from '../model/BrandingTypeface';
import { runWithOptionalTransaction } from '../utilities/TransactionUtils';

declare const BrandingThemeCssService: BrandingThemeCssServiceModule.Services.BrandingThemeCss;
declare const BrandingTypefaceService: BrandingTypefaceServiceModule.Services.BrandingTypeface;

/** Canonical Admin configuration response (design.md section 5.3). */
export interface BrandingVersionEntry {
  id: string;
  /** Owning brand ID (compatibility projection for history consumers). */
  branding?: string;
  version: number;
  hash: string;
  dateCreated: string;
  actorId?: string;
  actorDisplayName?: string;
  restoredFromVersion?: number;
  variables: Record<string, string>;
  typeface: BrandingTypefaceState;
}

export interface BrandingHealthWarning {
  code: string;
  slot?: BrandingTypefaceSlot;
  sha256?: string;
}

export interface BrandingAdminState {
  branding: { id: string; name: string };
  active: {
    version: number;
    hash: string;
    variables: Record<string, string>;
    typeface: BrandingTypefaceState;
  };
  draft: {
    revision: number;
    variables: Record<string, string>;
    typeface: BrandingTypefaceState;
    dirty: { colours: boolean; typeface: boolean };
  };
  versions: BrandingVersionEntry[];
  limits: { faceMaxBytes: number; familyMaxBytes: number; historyMaxVersions: number };
  healthWarnings: BrandingHealthWarning[];
}

export namespace Services {
  /**
   * Branding related functions...
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   */
  export class Branding extends services.Core.Service {
    protected override _exportedMethods: string[] = [
      'bootstrap',
      'loadAvailableBrands',
      'getDefault',
      'getBrand',
      'getAvailable',
      'getBrandAndPortalPath',
      'getFaviconUrl',
      'getBrandNameFromReq',
      'getBrandFromReq',
      'getPortalFromReq',
      'getFullPath',
      'getRootContext',
      'getBrandById',
      'getBrandingFromDB',
      'getActiveTypefaceFontInfo',
      'hasActiveCustomTypeface',
      'getAdminState',
      'listVersions',
      'saveDraft',
      'uploadTypefaceFace',
      'removeTypefaceFace',
      'useDefaultTypography',
      'revertTypefaceDraft',
      'preview',
      'previewVersion',
      'fetchPreview',
      'publish',
      'restore',
      'rollback',
      'refreshBrandingCache',
    ];

    protected availableBrandings: string[] = [];
    protected brandings: BrandingModel[] = [];
    protected dBrand = { name: 'default' };

    public bootstrap = (): Observable<BrandingModel> => {
      return super.getObservable(BrandingConfig.findOne(this.dBrand)).pipe(
        flatMap(defaultBrand => {
          if (_.isEmpty(defaultBrand)) {
            // create default brand
            sails.log.verbose("Default brand doesn't exist, creating...");
            return super.getObservable(BrandingConfig.create(this.dBrand));
          }
          sails.log.verbose('Default brand already exists...');
          return of(defaultBrand);
        }),
        flatMap(this.loadAvailableBrands)
      );
    };

    public loadAvailableBrands = (_defBrand: unknown): Observable<BrandingModel> => {
      sails.log.verbose('Loading available brands......');
      // Find all the BrandingConfig we have and add them to the availableBrandings array.
      // A policy is configured to reject any branding values not present in this array.
      return super.getObservable(BrandingConfig.find({}).populate('roles')).pipe(
        flatMap(brands => {
          this.brandings = brands as BrandingModel[];
          this.availableBrandings = _.map(this.brandings, 'name');
          const defBrandEntry: BrandingModel = this.getDefault();
          if (defBrandEntry == null) {
            sails.log.error('Failed to load default brand!');
            return throwError(new Error('Failed to load default brand!'));
          }
          return of(defBrandEntry);
        })
      );
    };

    public getDefault = (): BrandingModel => {
      return _.find(this.brandings, (o: BrandingModel) => {
        return o.name == this.dBrand.name;
      }) as BrandingModel;
    };

    public getBrand = (name: string): BrandingModel => {
      return _.find(this.brandings, (o: BrandingModel) => {
        return o.name == name;
      }) as BrandingModel;
    };

    public getBrandById = (id: string): BrandingModel => {
      return _.find(this.brandings, (o: BrandingModel) => {
        return o.id == id;
      }) as BrandingModel;
    };

    public async getBrandingFromDB(name: string): Promise<BrandingModel> {
      return (await BrandingConfig.findOne({ name: name })) as BrandingModel;
    }

    public getAvailable = (): string[] => {
      return this.availableBrandings;
    };

    public getBrandAndPortalPath(req: Sails.ReqParamProvider): string {
      const branding = this.getBrandNameFromReq(req);
      const portal = this.getPortalFromReq(req);
      const rootContext = this.getRootContext();
      if (_.isEmpty(rootContext)) {
        return `/${branding}/${portal}`;
      } else {
        return `${rootContext}/${branding}/${portal}`;
      }
    }

    public getFaviconUrl(req: Sails.ReqParamProvider): string {
      return `${this.getBrandAndPortalPath(req)}/images/favicon`;
    }

    public getRootContext(): string {
      const rootContext = sails.config.http.rootContext;
      if (_.isEmpty(rootContext)) {
        return ``;
      } else {
        return `/${rootContext}`;
      }
    }

    public getFullPath(req: Sails.ReqParamProvider): string {
      return sails.config.appUrl + this.getBrandAndPortalPath(req);
    }

    public getBrandNameFromReq(req: Sails.ReqParamProvider): string {
      let branding = null;
      if (req && req.params) {
        const paramBranding = req.params['branding'];
        branding = typeof paramBranding === 'string' ? paramBranding : null;
      }
      if (branding == null && req) {
        if (req.body != null) {
          const bodyBranding = req.body.branding;
          branding = typeof bodyBranding === 'string' ? bodyBranding : null;
        }
      }
      if (branding == null && req) {
        if (req.session != null) {
          const sessionBranding = req.session.branding;
          branding = typeof sessionBranding === 'string' ? sessionBranding : null;
        }
      }
      if (branding == null) {
        branding = sails.config.auth.defaultBrand;
      }

      return branding;
    }

    public getBrandFromReq(req: Sails.ReqParamProvider): BrandingModel {
      return this.getBrand(this.getBrandNameFromReq(req));
    }

    public getPortalFromReq(req: Sails.ReqParamProvider): string {
      let portal = null;
      if (req && req.params) {
        const paramPortal = req.params['portal'];
        portal = typeof paramPortal === 'string' ? paramPortal : null;
      }
      if (portal == null && req) {
        if (req.body != null) {
          const bodyPortal = req.body.portal;
          portal = typeof bodyPortal === 'string' ? bodyPortal : null;
        }
      }
      if (portal == null && req) {
        if (req.session != null) {
          const sessionPortal = req.session.portal;
          portal = typeof sessionPortal === 'string' ? sessionPortal : null;
        }
      }
      if (portal == null) {
        portal = sails.config.auth.defaultPortal;
      }

      return portal;
    }

    // ------------------------------------------------------------------
    // Revisioned draft and version lifecycle (design.md sections 3.3, 5, 7).
    // Every colour/typeface draft mutation requires `expectedDraftRevision`
    // and applies exactly one logical mutation with one revision increment via
    // a conditional update. Publish/restore require both expected counters,
    // re-verify stored bytes, and move active state in a single row update.
    // ------------------------------------------------------------------

    private readHistoryMaxVersions(): number {
      return getBrandingPositiveInt('historyMaxVersions', BRANDING_HISTORY_MAX_VERSIONS);
    }

    private snapshotKey(value: unknown): string {
      return JSON.stringify(value === undefined ? null : value);
    }

    private brandCounters(brand: BrandingConfigAttributes): { version: number; draftRevision: number } {
      return {
        version: typeof brand.version === 'number' ? brand.version : 0,
        draftRevision: typeof brand.draftRevision === 'number' ? brand.draftRevision : 0,
      };
    }

    private conflictError(brand: BrandingConfigAttributes): Error {
      const current = this.brandCounters(brand);
      const error = new Error(
        `branding-conflict: expected version ${current.version} and draft revision ${current.draftRevision}`
      ) as Error & { code?: string; current?: { version: number; draftRevision: number } };
      error.code = 'branding-conflict';
      error.current = current;
      return error;
    }

    private codedError(code: string, message: string): Error {
      const error = new Error(`${code}: ${message}`) as Error & { code?: string };
      error.code = code;
      return error;
    }

    private isUniqueViolation(error: unknown): boolean {
      const code =
        typeof (error as { code?: unknown })?.code === 'string' ? String((error as { code?: unknown }).code) : '';
      const message = error instanceof Error ? error.message : String(error ?? '');
      return code === 'E_UNIQUE' || /E_UNIQUE|unique|duplicate key/i.test(`${code} ${message}`);
    }

    private extractActor(actor: unknown): { actorId?: string; actorDisplayName?: string } {
      if (!actor || typeof actor !== 'object') {
        return {};
      }
      const record = actor as Record<string, unknown>;
      const actorId =
        typeof record.id === 'string' || typeof record.id === 'number'
          ? String(record.id)
          : typeof record.username === 'string'
            ? record.username
            : undefined;
      const actorDisplayName =
        typeof record.displayName === 'string'
          ? record.displayName
          : typeof record.name === 'string'
            ? record.name
            : typeof record.username === 'string'
              ? record.username
              : actorId;
      return { actorId, actorDisplayName };
    }

    private async loadBrandOrThrow(branding: string): Promise<BrandingConfigAttributes> {
      const brand = await BrandingConfig.findOne({ name: branding });
      if (!brand) {
        throw this.codedError('branding-not-found', `Brand not found: ${branding}`);
      }
      return brand;
    }

    private draftTypefaceOf(brand: BrandingConfigAttributes): BrandingTypefaceState {
      return normalizeTypefaceState(brand.draftTypeface);
    }

    private async listHistoriesAsc(brandingId: string): Promise<BrandingConfigHistoryAttributes[]> {
      return (await BrandingConfigHistory.find({ branding: brandingId }).sort(
        'version ASC'
      )) as BrandingConfigHistoryAttributes[];
    }

    private activeHistoryRow(
      histories: BrandingConfigHistoryAttributes[],
      activeVersion: number
    ): BrandingConfigHistoryAttributes | undefined {
      return histories.find(history => history.version === activeVersion);
    }

    private async maxHistoryVersion(brandingId: string): Promise<number> {
      const histories = await this.listHistoriesAsc(brandingId);
      return histories.reduce((max, history) => Math.max(max, history.version), 0);
    }

    private publicationIdentity(hash: unknown, typeface: unknown): string {
      return this.snapshotKey({
        hash: String(hash ?? ''),
        faces: orderedTypefaceFaces(normalizeTypefaceState(typeface)).map(face => [face.slot, face.sha256]),
      });
    }

    /** Newest-first version entries shared by getAdminState and listVersions. */
    private buildVersionEntries(
      brand: BrandingConfigAttributes,
      histories: BrandingConfigHistoryAttributes[]
    ): BrandingVersionEntry[] {
      return [...histories]
        .sort((left, right) => right.version - left.version)
        .map(history => ({
          id: String(history.id),
          branding: String(brand.id),
          version: history.version,
          hash: history.hash,
          dateCreated: history.dateCreated ?? '',
          actorId: history.actorId,
          actorDisplayName: history.actorDisplayName,
          restoredFromVersion: history.restoredFromVersion,
          variables: history.variables ?? {},
          typeface: normalizeTypefaceState(history.typeface),
        }));
    }

    /**
     * Canonical Admin-state response builder (design.md section 5.3).
     *
     * Every response includes advisory active-face health, including mutations,
     * because the Admin UI replaces its canonical state with each response.
     */
    public async getAdminState(branding: string): Promise<BrandingAdminState> {
      const brand = await this.loadBrandOrThrow(branding);
      const { version: activeVersion, draftRevision } = this.brandCounters(brand);
      const histories = await this.listHistoriesAsc(String(brand.id));
      const activeRow = this.activeHistoryRow(histories, activeVersion);
      const activeVariables = activeRow?.variables ?? {};
      const activeTypeface = normalizeTypefaceState(brand.typeface ?? activeRow?.typeface ?? null);
      const draftVariables = brand.variables ?? {};
      const draftTypeface = this.draftTypefaceOf(brand);
      const versions = this.buildVersionEntries(brand, histories);
      const healthWarnings = await this.activeHealthWarnings(String(brand.id), activeTypeface);
      return {
        branding: { id: String(brand.id), name: String(brand.name) },
        active: {
          version: activeVersion,
          hash: String(brand.hash ?? ''),
          variables: activeVariables,
          typeface: activeTypeface,
        },
        draft: {
          revision: draftRevision,
          variables: draftVariables,
          typeface: draftTypeface,
          dirty: {
            colours: this.snapshotKey(draftVariables) !== this.snapshotKey(activeVariables),
            typeface: this.snapshotKey(draftTypeface) !== this.snapshotKey(activeTypeface),
          },
        },
        versions,
        limits: {
          faceMaxBytes: getBrandingPositiveInt('typefaceFaceMaxBytes', BRANDING_TYPEFACE_FACE_MAX_BYTES),
          familyMaxBytes: getBrandingPositiveInt('typefaceFamilyMaxBytes', BRANDING_TYPEFACE_FAMILY_MAX_BYTES),
          historyMaxVersions: this.readHistoryMaxVersions(),
        },
        healthWarnings,
      };
    }

    /** Retained versions newest-first (no storage health reads). */
    public async listVersions(branding: string): Promise<BrandingVersionEntry[]> {
      const brand = await this.loadBrandOrThrow(branding);
      const histories = await this.listHistoriesAsc(String(brand.id));
      return this.buildVersionEntries(brand, histories);
    }

    /**
     * Advisory active-asset health; config retrieval never fails on storage errors.
     * Missing objects are reported via a cheap existence probe; only faces that
     * exist pay for a full read plus hash verification (corruption check).
     */
    private async activeHealthWarnings(
      brandingId: string,
      activeTypeface: BrandingTypefaceState
    ): Promise<BrandingHealthWarning[]> {
      const warnings: BrandingHealthWarning[] = [];
      for (const face of orderedTypefaceFaces(activeTypeface)) {
        if (!(await BrandingTypefaceService.faceExists(brandingId, face.sha256))) {
          sails.log.warn(
            `BrandingService active typeface health: brand ${brandingId} slot ${face.slot} face-unavailable`
          );
          warnings.push({ code: 'face-unavailable', slot: face.slot, sha256: face.sha256 });
          continue;
        }
        try {
          await BrandingTypefaceService.readFace(brandingId, face.sha256);
        } catch (error) {
          const code = (error as { code?: string })?.code === 'typeface-corrupt' ? 'face-corrupt' : 'face-unavailable';
          sails.log.warn(`BrandingService active typeface health: brand ${brandingId} slot ${face.slot} ${code}`);
          warnings.push({ code, slot: face.slot, sha256: face.sha256 });
        }
      }
      return warnings;
    }

    private requireDraftRevision(brand: BrandingConfigAttributes, expectedDraftRevision?: number): number {
      const current = typeof brand.draftRevision === 'number' ? brand.draftRevision : 0;
      if (expectedDraftRevision === undefined || expectedDraftRevision !== current) {
        throw this.conflictError(brand);
      }
      return current;
    }

    private requireCounters(
      brand: BrandingConfigAttributes,
      expectedVersion?: number,
      expectedDraftRevision?: number
    ): void {
      const current = this.brandCounters(brand);
      if (
        expectedVersion === undefined ||
        expectedVersion !== current.version ||
        expectedDraftRevision === undefined ||
        expectedDraftRevision !== current.draftRevision
      ) {
        throw this.conflictError(brand);
      }
    }

    private async conditionalDraftUpdate(
      brand: BrandingConfigAttributes,
      patch: Record<string, unknown>
    ): Promise<BrandingConfigAttributes> {
      const current = typeof brand.draftRevision === 'number' ? brand.draftRevision : 0;
      const updated = await BrandingConfig.updateOne({ id: brand.id, draftRevision: current }).set({
        ...patch,
        draftRevision: current + 1,
      });
      if (!updated) {
        const reread = await this.loadBrandOrThrow(String(brand.name));
        throw this.conflictError(reread);
      }
      return updated;
    }

    /** Save colour draft; typeface draft is preserved untouched. */
    public async saveDraft(input: {
      branding: string;
      variables: Record<string, string>;
      expectedDraftRevision?: number;
      actor?: unknown;
    }): Promise<BrandingAdminState> {
      const brand = await this.loadBrandOrThrow(input.branding);
      this.requireDraftRevision(brand, input.expectedDraftRevision);
      const normalized = BrandingThemeCssService.validateVariables(input.variables || {});
      await this.conditionalDraftUpdate(brand, { variables: normalized });
      return this.getAdminState(input.branding);
    }

    /** Stage one uploaded face and apply a single-slot draft mutation. */
    public async uploadTypefaceFace(input: {
      branding: string;
      slot: string;
      bytes: Buffer;
      originalFilename?: string;
      expectedDraftRevision?: number;
      actor?: unknown;
    }): Promise<BrandingAdminState> {
      if (!isBrandingTypefaceSlot(input.slot)) {
        throw this.codedError('branding-invalid', `Invalid typeface slot: ${String(input.slot)}`);
      }
      const brand = await this.loadBrandOrThrow(input.branding);
      this.requireDraftRevision(brand, input.expectedDraftRevision);
      const draft = this.draftTypefaceOf(brand);
      const base = { ...(draft.faces ?? {}) };
      const face = await BrandingTypefaceService.inspectAndStoreFace({
        brandingId: String(brand.id),
        slot: input.slot,
        bytes: input.bytes,
        originalFilename: input.originalFilename,
        existingFaces: orderedTypefaceFaces({ mode: 'custom', faces: base }),
      });
      base[input.slot] = face;
      await this.conditionalDraftUpdate(brand, { draftTypeface: { mode: 'custom', faces: base } });
      return this.getAdminState(input.branding);
    }

    /** Remove one draft face; the active typeface is untouched. */
    public async removeTypefaceFace(input: {
      branding: string;
      slot: string;
      expectedDraftRevision?: number;
      actor?: unknown;
    }): Promise<BrandingAdminState> {
      if (!isBrandingTypefaceSlot(input.slot)) {
        throw this.codedError('branding-invalid', `Invalid typeface slot: ${String(input.slot)}`);
      }
      const brand = await this.loadBrandOrThrow(input.branding);
      this.requireDraftRevision(brand, input.expectedDraftRevision);
      const draft = this.draftTypefaceOf(brand);
      if (draft.mode !== 'custom' || !draft.faces?.[input.slot]) {
        throw this.codedError('branding-face-not-found', `No draft face in slot: ${String(input.slot)}`);
      }
      const faces = { ...(draft.faces ?? {}) };
      delete faces[input.slot];
      const next: BrandingTypefaceState =
        Object.keys(faces).length === 0 ? { mode: 'default', faces: {} } : { mode: 'custom', faces };
      await this.conditionalDraftUpdate(brand, { draftTypeface: next });
      return this.getAdminState(input.branding);
    }

    /** Set the draft typeface to Default Typography; draft colours are preserved. */
    public async useDefaultTypography(input: {
      branding: string;
      expectedDraftRevision?: number;
      actor?: unknown;
    }): Promise<BrandingAdminState> {
      const brand = await this.loadBrandOrThrow(input.branding);
      this.requireDraftRevision(brand, input.expectedDraftRevision);
      await this.conditionalDraftUpdate(brand, { draftTypeface: { mode: 'default', faces: {} } });
      return this.getAdminState(input.branding);
    }

    /** Copy only the active typeface into the draft; draft colours are preserved. */
    public async revertTypefaceDraft(input: {
      branding: string;
      expectedDraftRevision?: number;
      actor?: unknown;
    }): Promise<BrandingAdminState> {
      const brand = await this.loadBrandOrThrow(input.branding);
      this.requireDraftRevision(brand, input.expectedDraftRevision);
      const histories = await this.listHistoriesAsc(String(brand.id));
      const { version: activeVersion } = this.brandCounters(brand);
      const activeRow = this.activeHistoryRow(histories, activeVersion);
      const activeTypeface = normalizeTypefaceState(brand.typeface ?? activeRow?.typeface ?? null);
      await this.conditionalDraftUpdate(brand, { draftTypeface: activeTypeface });
      return this.getAdminState(input.branding);
    }

    private previewUrl(branding: string, portal: string, token: string): string {
      return `/${branding}/${portal}/preview/${token}.css`;
    }

    /** Generate preview CSS for an exact draft revision (non-mutating). */
    public async preview(
      branding: string,
      portal: string,
      expectedDraftRevision?: number
    ): Promise<{ token: string; url: string; hash: string; revision: number }> {
      const brand = await this.loadBrandOrThrow(branding);
      const current = typeof brand.draftRevision === 'number' ? brand.draftRevision : 0;
      if (expectedDraftRevision === undefined || expectedDraftRevision !== current) {
        throw this.conflictError(brand);
      }
      const draftVariables = brand.variables ?? {};
      const draftTypeface = this.draftTypefaceOf(brand);
      const { css, hash } = BrandingThemeCssService.generate(draftVariables, {
        typeface: draftTypeface,
        brandName: String(brand.name),
      });
      const token = crypto.randomBytes(16).toString('hex');
      const name = `branding-preview:${token}`;
      const ts = Math.floor(Date.now() / 1000);
      await CacheEntry.create({ name, data: { css, branding, portal, hash, revision: current }, ts_added: ts });
      return { token, url: this.previewUrl(branding, portal, token), hash, revision: current };
    }

    /** Preview a retained version without mutating the draft. */
    public async previewVersion(input: {
      branding: string;
      portal: string;
      versionId: string;
    }): Promise<{ token: string; url: string; hash: string }> {
      const brand = await this.loadBrandOrThrow(input.branding);
      // Brand-scoped lookup: rows from another brand never match, so cross-brand
      // restores/previews are rejected as not-found.
      const histories = await this.listHistoriesAsc(String(brand.id));
      const row = histories.find(history => String(history.id) === String(input.versionId));
      if (!row) {
        throw this.codedError('history-not-found', `Version not found: ${input.versionId}`);
      }
      const variables = row.variables ?? {};
      const typeface = normalizeTypefaceState(row.typeface);
      const { css, hash } = BrandingThemeCssService.generate(variables, { typeface, brandName: String(brand.name) });
      const token = crypto.randomBytes(16).toString('hex');
      const ts = Math.floor(Date.now() / 1000);
      await CacheEntry.create({
        name: `branding-preview:${token}`,
        data: { css, branding: input.branding, portal: input.portal, hash, versionId: String(row.id) },
        ts_added: ts,
      });
      return { token, url: this.previewUrl(input.branding, input.portal, token), hash };
    }

    /** Fetch preview CSS (helper for tests); enforces TTL */
    public async fetchPreview(
      token: string
    ): Promise<{ css: string; branding: string; portal: string; hash: string; revision?: number; versionId?: string }> {
      const ttl = _.get(sails, 'config.branding.previewTtlSeconds', 300);
      const name = `branding-preview:${token}`;
      const entry = await CacheEntry.findOne({ name });
      if (!entry) throw new Error('preview-not-found');
      const age = Math.floor(Date.now() / 1000) - entry.ts_added;
      if (age > ttl) {
        await CacheEntry.destroy({ id: entry.id });
        throw new Error('preview-expired');
      }
      // Single-use: destroy after first successful fetch
      await CacheEntry.destroy({ id: entry.id });
      return entry.data as {
        css: string;
        branding: string;
        portal: string;
        hash: string;
        revision?: number;
        versionId?: string;
      };
    }

    private async buildPublishSnapshot(brand: BrandingConfigAttributes): Promise<{
      variables: Record<string, string>;
      typeface: BrandingTypefaceState;
      css: string;
      hash: string;
    }> {
      const variables = BrandingThemeCssService.validateVariables(brand.variables ?? {});
      const typeface = this.draftTypefaceOf(brand);
      if (!isPublishableTypefaceState(typeface)) {
        throw this.codedError('branding-invalid', 'A custom typeface cannot be published without a Regular face');
      }
      await BrandingTypefaceService.assertTypefaceAvailable(String(brand.id), typeface);
      const { css, hash } = BrandingThemeCssService.generate(variables, { typeface, brandName: String(brand.name) });
      return { variables, typeface, css, hash };
    }

    private async persistPublication(
      brand: BrandingConfigAttributes,
      historyValues: Partial<BrandingConfigHistoryAttributes>,
      snapshot: { css: string; hash: string; variables: Record<string, string>; typeface: BrandingTypefaceState },
      nextVersion: number
    ): Promise<void> {
      const { version: activeVersion, draftRevision } = this.brandCounters(brand);
      const datastore = typeof BrandingConfig.getDatastore === 'function' ? BrandingConfig.getDatastore() : undefined;
      await runWithOptionalTransaction(
        datastore,
        async connection => {
          const createQuery = BrandingConfigHistory.create(historyValues);
          let created: BrandingConfigHistoryAttributes | null = null;
          try {
            created = await (connection && typeof createQuery.usingConnection === 'function'
              ? createQuery.usingConnection(connection)
              : createQuery);
          } catch (error) {
            if (!this.isUniqueViolation(error)) {
              throw error;
            }
            const reread = await this.loadBrandOrThrow(String(brand.name));
            throw this.conflictError(reread);
          }
          let updated: BrandingConfigAttributes | null | undefined;
          try {
            const updateQuery = BrandingConfig.updateOne({
              id: brand.id,
              version: activeVersion,
              draftRevision,
            }).set({
              variables: snapshot.variables,
              css: snapshot.css,
              hash: snapshot.hash,
              version: nextVersion,
              typeface: snapshot.typeface,
              draftTypeface: snapshot.typeface,
              draftRevision: draftRevision + 1,
            });
            updated = await (connection && typeof updateQuery.usingConnection === 'function'
              ? updateQuery.usingConnection(connection)
              : updateQuery);
          } catch (error) {
            // Only adapter/Waterline validation failures certify non-application.
            // A transport timeout may occur after commit: retain its history.
            const code = (error as { code?: string }).code;
            if (
              !connection &&
              created?.id !== undefined &&
              ['E_INVALID_NEW_RECORD', 'E_INVALID_VALUES_TO_SET', 'E_USAGE', 'E_UNIQUE'].includes(code ?? '')
            ) {
              await BrandingConfigHistory.destroy({ id: created.id });
            }
            throw error;
          }
          if (!updated) {
            if (!connection && created && created.id !== undefined) {
              await BrandingConfigHistory.destroy({ id: created.id }).catch(() => undefined);
            }
            const reread = await this.loadBrandOrThrow(String(brand.name));
            throw this.conflictError(reread);
          }
        },
        { logger: sails.log }
      );
    }

    /** Publish the draft atomically; unchanged publishes are idempotent. */
    public async publish(
      branding: string,
      portal: string,
      actor: unknown,
      opts?: { expectedVersion?: number; expectedDraftRevision?: number }
    ): Promise<{ state: BrandingAdminState; version: number; hash: string; idempotent?: boolean }> {
      const brand = await this.loadBrandOrThrow(branding);
      this.requireCounters(brand, opts?.expectedVersion, opts?.expectedDraftRevision);
      const snapshot = await this.buildPublishSnapshot(brand);
      const { version: activeVersion } = this.brandCounters(brand);
      const histories = await this.listHistoriesAsc(String(brand.id));
      const activeRow = this.activeHistoryRow(histories, activeVersion);
      const activeVariables = activeRow?.variables ?? {};
      const activeTypeface = normalizeTypefaceState(brand.typeface ?? activeRow?.typeface ?? null);
      if (
        String(brand.hash ?? '') === snapshot.hash &&
        this.snapshotKey(orderedTypefaceFaces(snapshot.typeface).map(face => [face.slot, face.sha256])) ===
          this.snapshotKey(orderedTypefaceFaces(activeTypeface).map(face => [face.slot, face.sha256]))
      ) {
        if (
          this.snapshotKey(snapshot.typeface) !== this.snapshotKey(activeTypeface) ||
          this.snapshotKey(snapshot.variables) !== this.snapshotKey(activeVariables)
        ) {
          await this.conditionalDraftUpdate(brand, { variables: activeVariables, draftTypeface: activeTypeface });
        }
        // A previous write may have committed but lost its response before cache refresh.
        await this.pruneHistories(String(brand.id));
        await this.refreshBrandingCache(String(brand.id));
        const state = await this.getAdminState(branding);
        return { state, version: activeVersion, hash: String(brand.hash ?? ''), idempotent: true };
      }
      const maxVersion = histories.reduce((max, history) => Math.max(max, history.version), activeVersion);
      const nextVersion = maxVersion + 1;
      const attribution = this.extractActor(actor);
      const historyValues = {
        branding: brand.id,
        version: nextVersion,
        hash: snapshot.hash,
        css: snapshot.css,
        variables: snapshot.variables,
        typeface: snapshot.typeface,
        ...(attribution.actorId ? { actorId: attribution.actorId } : {}),
        ...(attribution.actorDisplayName ? { actorDisplayName: attribution.actorDisplayName } : {}),
      };
      await this.persistPublication(brand, historyValues, snapshot, nextVersion);
      await this.pruneSupersededAmbiguousHistories(String(brand.id), activeVersion, nextVersion, snapshot);
      await this.pruneHistories(String(brand.id));
      await this.refreshBrandingCache(String(brand.id));
      const state = await this.getAdminState(branding);
      return { state, version: nextVersion, hash: snapshot.hash };
    }

    /** Restore a retained version as a new monotonically increasing version. */
    public async restore(input: {
      branding: string;
      versionId: string;
      expectedVersion?: number;
      expectedDraftRevision?: number;
      actor?: unknown;
    }): Promise<{ state: BrandingAdminState; version: number; hash: string }> {
      const brand = await this.loadBrandOrThrow(input.branding);
      this.requireCounters(brand, input.expectedVersion, input.expectedDraftRevision);
      const histories = await this.listHistoriesAsc(String(brand.id));
      const row = histories.find(history => String(history.id) === String(input.versionId));
      if (!row) {
        throw this.codedError('history-not-found', `Version not found: ${input.versionId}`);
      }
      const { version: activeVersion } = this.brandCounters(brand);
      const variables = BrandingThemeCssService.validateVariables(row.variables ?? {});
      const typeface = normalizeTypefaceState(row.typeface);
      // Re-read and hash-check every face before any active mutation.
      await BrandingTypefaceService.assertTypefaceAvailable(String(brand.id), typeface);
      // Regenerate CSS from the historical snapshot rather than trusting stored CSS.
      const { css, hash } = BrandingThemeCssService.generate(variables, { typeface, brandName: String(brand.name) });
      const maxVersion = histories.reduce((max, history) => Math.max(max, history.version), activeVersion);
      const nextVersion = maxVersion + 1;
      const attribution = this.extractActor(input.actor);
      const historyValues = {
        branding: brand.id,
        version: nextVersion,
        hash,
        css,
        variables,
        typeface,
        restoredFromVersion: row.version,
        ...(attribution.actorId ? { actorId: attribution.actorId } : {}),
        ...(attribution.actorDisplayName ? { actorDisplayName: attribution.actorDisplayName } : {}),
      };
      await this.persistPublication(brand, historyValues, { css, hash, variables, typeface }, nextVersion);
      await this.pruneSupersededAmbiguousHistories(String(brand.id), activeVersion, nextVersion, {
        hash,
        typeface,
      });
      await this.pruneHistories(String(brand.id));
      await this.refreshBrandingCache(String(brand.id));
      const state = await this.getAdminState(input.branding);
      return { state, version: nextVersion, hash };
    }

    /**
     * Deprecated one-major-release alias with restore semantics.
     * Kept only for the compatibility route; new code must call restore.
     */
    public async rollback(
      versionId: string,
      actor: unknown,
      opts?: { branding?: string; expectedVersion?: number; expectedDraftRevision?: number }
    ): Promise<{ state: BrandingAdminState; version: number; hash: string }> {
      let branding = opts?.branding;
      if (!branding) {
        const row = await BrandingConfigHistory.findOne({
          id: versionId,
        });
        if (!row) {
          throw this.codedError('history-not-found', `Version not found: ${versionId}`);
        }
        const populated = row.branding;
        if (typeof populated === 'object' && populated !== null && populated.id !== undefined) {
          const brand = await BrandingConfig.findOne({ id: populated.id });
          if (!brand) {
            throw this.codedError('branding-not-found', `Brand not found for version: ${versionId}`);
          }
          branding = String(brand.name);
        } else {
          const brand = await BrandingConfig.findOne({ id: String(populated) });
          if (!brand) {
            throw this.codedError('branding-not-found', `Brand not found for version: ${versionId}`);
          }
          branding = String(brand.name);
        }
      }
      return this.restore({
        branding,
        versionId,
        expectedVersion: opts?.expectedVersion,
        expectedDraftRevision: opts?.expectedDraftRevision,
        actor,
      });
    }

    /** Retain only the newest configured history rows after a durable transition. */
    private async pruneHistories(brandingId: string): Promise<void> {
      const retain = this.readHistoryMaxVersions();
      const histories = (await BrandingConfigHistory.find({ branding: brandingId }).sort(
        'version DESC'
      )) as BrandingConfigHistoryAttributes[];
      for (const history of histories.slice(retain)) {
        await BrandingConfigHistory.destroy({ id: history.id });
        sails.log.verbose(`BrandingService pruned branding ${brandingId} version ${history.version}`);
      }
    }

    /**
     * Remove an ambiguous non-transactional attempt once a later publication
     * has committed the same snapshot. Such rows can sit above the active
     * version when an update response is lost and must not consume retention.
     */
    private async pruneSupersededAmbiguousHistories(
      brandingId: string,
      activeVersion: number,
      successfulVersion: number,
      snapshot: { hash: string; typeface: BrandingTypefaceState }
    ): Promise<void> {
      const successfulIdentity = this.publicationIdentity(snapshot.hash, snapshot.typeface);
      const histories = await this.listHistoriesAsc(brandingId);
      for (const history of histories) {
        if (
          history.version <= activeVersion ||
          history.version >= successfulVersion ||
          history.id === undefined ||
          history.id === null ||
          this.publicationIdentity(history.hash, history.typeface) !== successfulIdentity
        ) {
          continue;
        }
        await BrandingConfigHistory.destroy({ id: history.id });
        sails.log.verbose(
          `BrandingService removed superseded ambiguous publication for brand ${brandingId} version ${history.version}`
        );
      }
    }

    // ------------------------------------------------------------------
    // Page-rendering helpers for layouts (design.md sections 3.4, 9.1).
    // Synchronous reads of the in-memory brand cache so EJS layouts can
    // decide font inclusion without storage I/O. A missing or corrupt active
    // face never re-enables Google fonts here; the browser falls back via CSS
    // while the Admin state carries the health warning.
    // ------------------------------------------------------------------

    /** Regular-face public URL for an active custom typeface, else null. */
    public getActiveTypefaceFontInfo(brandingName: string): { regularUrl: string } | null {
      const brand = this.getBrand(brandingName);
      const typeface = normalizeTypefaceState(brand?.typeface);
      if (typeface.mode !== 'custom' || !typeface.faces?.regular) {
        return null;
      }
      return {
        regularUrl: BrandingTypefaceService.publicUrl(String(brand?.name), typeface.faces.regular.sha256),
      };
    }

    /** True when the resolved brand has an active custom typeface with a Regular face. */
    public hasActiveCustomTypeface(brandingName: string): boolean {
      return this.getActiveTypefaceFontInfo(brandingName) !== null;
    }

    /** Refresh a single branding record in the in-memory cache (this.brandings & availableBrandings) */
    public async refreshBrandingCache(id: string): Promise<BrandingModel | null> {
      const updated = (await BrandingConfig.findOne({ id }).populate('roles')) as BrandingModel | null;
      if (updated) {
        const idx = this.brandings.findIndex((b: BrandingModel) => b.id === id);
        if (idx >= 0) {
          this.brandings[idx] = updated;
        } else {
          this.brandings.push(updated);
        }
        this.availableBrandings = _.map(this.brandings, 'name');
      }
      return updated;
    }
  }
}

declare global {
  let BrandingService: Services.Branding;
}
