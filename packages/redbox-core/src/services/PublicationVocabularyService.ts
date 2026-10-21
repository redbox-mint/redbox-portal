import { firstValueFrom } from 'rxjs';
import { Services as services } from '../CoreService';
import type { Db } from 'mongodb';
import { PublicationVocabularyStore } from './publication-vocabulary/store';
import { convertPublicationVocabulary, vocabularyEntries } from './publication-vocabulary/conversion';
import {
  PublicationVocabularyError,
  isPublicationVocabularyAdministrationEnabled,
} from './publication-vocabulary/contracts';
import type {
  PublicationVocabularyActor,
  PublicationSourceImport,
  PublicationVocabularyResolveInput,
  PublicationCrosswalkMapping,
} from './publication-vocabulary/contracts';
import { legacyFigshareResolution } from './figshare-v2/vocabulary-adapter';
import { figshareVocabularyCatalogue } from './publication-vocabulary/figshare-source';
import { resolveFigshareVocabularyConfig } from './figshare-v2/config';

export namespace Services {
  /** Shared vocabulary administration is separately gated from publication processing. @internal */
  export class PublicationVocabulary extends services.Core.Service {
    protected override _exportedMethods = [
      'listSources',
      'administrationCapabilities',
      'sourceHistory',
      'listLocalEntries',
      'listTargets',
      'importSource',
      'importFigshare',
      'listCrosswalks',
      'getCrosswalk',
      'createCrosswalk',
      'saveMappings',
      'approveCrosswalk',
      'resolve',
      'approvedRevision',
      'legacyResolve',
      'snapshot',
      'resolveFrozenReference',
      'converted',
      'convert',
    ];
    protected getStore(): PublicationVocabularyStore {
      const db: Db = PublicationSync.getDatastore().manager;
      if (!Object.is(Vocabulary.getDatastore().manager, db))
        throw new PublicationVocabularyError('Vocabulary conversion requires one Mongo datastore', 409);
      return new PublicationVocabularyStore(db);
    }
    private async administrator(ctx: PublicationVocabularyActor): Promise<void> {
      if (!isPublicationVocabularyAdministrationEnabled(sails.config.vocab?.publicationAdministrationEnabled))
        throw new PublicationVocabularyError('Shared publication vocabulary administration is disabled', 404);
      const user = await firstValueFrom(UsersService.getUserWithUsername(ctx.userId));
      const roles =
        user?.roles?.filter(role => {
          const brand: unknown = role.branding;
          return (
            (typeof brand === 'string'
              ? brand
              : brand && typeof brand === 'object'
                ? Reflect.get(brand, 'id')
                : undefined) === ctx.brandId
          );
        }) ?? [];
      if (
        !BrandingService.getBrandById(ctx.brandId) ||
        !user ||
        user.disabled ||
        user.loginDisabled ||
        user.effectiveLoginDisabled ||
        !RolesService.getAdminFromRoles(roles)
      )
        throw new PublicationVocabularyError('A current administrator for this brand is required', 403);
    }
    private async active(ctx: PublicationVocabularyActor): Promise<PublicationVocabularyStore> {
      await this.administrator(ctx);
      const store = this.getStore();
      if ((await store.control(ctx.brandId))?.state !== 'committed')
        throw new PublicationVocabularyError(
          'Convert and verify this brand vocabulary before using shared administration',
          409
        );
      return store;
    }
    public async converted(brandId: string): Promise<boolean> {
      return (await this.getStore().control(brandId))?.state === 'committed';
    }
    public async convert(options: {
      brandId: string;
      username: string;
      apply?: boolean;
      reason?: string;
      parameters?: Record<string, unknown>;
    }): Promise<unknown> {
      // The queue-disabled CLI loads services without running application bootstrap.
      if (
        isPublicationVocabularyAdministrationEnabled(sails.config.vocab?.publicationAdministrationEnabled) &&
        !BrandingService.getBrandById(options.brandId)
      )
        await firstValueFrom(BrandingService.loadAvailableBrands(undefined));
      await this.administrator({ brandId: options.brandId, userId: options.username });
      const parameters = options.parameters ?? {};
      const settledWriterIds = parameters.settledWriterIds;
      if (
        settledWriterIds !== undefined &&
        (!Array.isArray(settledWriterIds) || !settledWriterIds.every((id): id is string => typeof id === 'string'))
      )
        throw new PublicationVocabularyError('settledWriterIds must be an array of admission IDs');
      return convertPublicationVocabulary(this.getStore().db, {
        ...options,
        actor: options.username,
        ...(Array.isArray(settledWriterIds) ? { settledWriterIds } : {}),
        settlementEvidence:
          typeof parameters.settlementEvidence === 'string' ? parameters.settlementEvidence : undefined,
        confirmLegacyWritersStopped: parameters.confirmLegacyWritersStopped === true,
      });
    }
    public async listSources(ctx: PublicationVocabularyActor) {
      const store = await this.active(ctx);
      return store.sources
        .find({ brandId: ctx.brandId }, { projection: { _id: 0, legacy: 0, terms: 0, imports: 0 } })
        .sort({ displayName: 1 })
        .toArray();
    }
    public async administrationCapabilities(ctx: PublicationVocabularyActor) {
      await this.active(ctx);
      const brand = BrandingService.getBrandById(ctx.brandId);
      const config = resolveFigshareVocabularyConfig(brand.name);
      const figshareScopes: Array<'public' | 'account'> = config ? ['public'] : [];
      if (config && (config.runtime.mode === 'fixture' || config.connection.token?.trim()))
        figshareScopes.push('account');
      return { snapshotImport: true, figshareScopes, editMappings: true, approve: true };
    }
    public async sourceHistory(id: string, ctx: PublicationVocabularyActor) {
      const source = await (await this.active(ctx)).source(ctx.brandId, id);
      // Preserve original import attribution without exposing raw legacy/import payloads.
      return source.imports.map(({ id, at, actor, digest }) => ({ id, at, actor, digest }));
    }
    public async listLocalEntries(
      id: string,
      query: { q?: string; offset?: number; limit?: number },
      ctx: PublicationVocabularyActor
    ) {
      const store = await this.active(ctx);
      const crosswalk = await store.crosswalk(ctx.brandId, id);
      await store.assertLocalVocabulary(ctx.brandId, crosswalk.localVocabularyId);
      const search = (query.q ?? '').trim().toLowerCase();
      const entries = (await vocabularyEntries(store.db, crosswalk.localVocabularyId)).filter(
        entry => !search || `${entry.label} ${entry.value} ${entry.codes.join(' ')}`.toLowerCase().includes(search)
      );
      const offset = Math.max(0, Math.floor(Number(query.offset) || 0));
      const limit = Math.min(200, Math.max(1, Math.floor(Number(query.limit) || 50)));
      return { data: entries.slice(offset, offset + limit), meta: { total: entries.length, limit, offset } };
    }
    public async listTargets(
      id: string,
      query: { q?: string; includeHistorical?: boolean; offset?: number; limit?: number },
      ctx: PublicationVocabularyActor
    ) {
      const source = await (await this.active(ctx)).source(ctx.brandId, id);
      const offset = Math.max(0, Math.floor(Number(query.offset) || 0));
      const limit = Math.min(200, Math.max(1, Math.floor(Number(query.limit) || 50)));
      const search = (query.q ?? '').trim().toLowerCase();
      const terms = source.terms.filter(
        term =>
          (query.includeHistorical || !term.historical) &&
          (!search || `${term.label} ${term.sourceId} ${term.value}`.toLowerCase().includes(search))
      );
      return {
        data: terms.slice(offset, offset + limit).map(({ evidence: _evidence, ...term }) => term),
        meta: { total: terms.length, limit, offset },
      };
    }
    public async importSource(input: PublicationSourceImport, ctx: PublicationVocabularyActor) {
      const store = await this.active(ctx);
      if (input.provider === 'figshare' || input.namespace.startsWith('figshare:'))
        throw new PublicationVocabularyError('Use the configured Figshare catalogue import');
      return store.importSource(input, ctx);
    }
    public async importFigshare(
      input: { scope: 'public' | 'account'; taxonomyId: string; expectedVersion?: number; importId: string },
      ctx: PublicationVocabularyActor
    ) {
      const store = await this.active(ctx);
      const catalogue = await figshareVocabularyCatalogue(ctx.brandId, input.scope, input.taxonomyId);
      const existing = await store.sources.findOne({
        brandId: ctx.brandId,
        provider: 'figshare',
        scope: input.scope,
        catalogueId: input.taxonomyId,
      });
      return store.importSource(
        {
          ...catalogue,
          ...(existing ? { id: existing.id } : {}),
          importId: input.importId,
          expectedVersion: input.expectedVersion,
        },
        ctx
      );
    }
    public async listCrosswalks(ctx: PublicationVocabularyActor) {
      return (await this.active(ctx)).crosswalks
        .find({ brandId: ctx.brandId }, { projection: { _id: 0, legacy: 0, revisions: 0 } })
        .sort({ name: 1 })
        .toArray();
    }
    public async getCrosswalk(id: string, ctx: PublicationVocabularyActor) {
      return (await this.active(ctx)).crosswalk(ctx.brandId, id);
    }
    public async createCrosswalk(
      input: {
        name: string;
        sourceId: string;
        localVocabularyId: string;
        normalizer?: 'exact-v1' | 'figshare-code-v1';
      },
      ctx: PublicationVocabularyActor
    ) {
      const store = await this.active(ctx);
      await store.assertLocalVocabulary(ctx.brandId, input.localVocabularyId);
      return store.createCrosswalk(input, ctx);
    }
    public async saveMappings(
      id: string,
      input: { version: number; mappings: PublicationCrosswalkMapping[] },
      ctx: PublicationVocabularyActor
    ) {
      const store = await this.active(ctx);
      const crosswalk = await store.crosswalk(ctx.brandId, id);
      await store.assertLocalVocabulary(ctx.brandId, crosswalk.localVocabularyId);
      return store.saveMappings(id, input, await vocabularyEntries(store.db, crosswalk.localVocabularyId), ctx);
    }
    public async approveCrosswalk(id: string, version: number, ctx: PublicationVocabularyActor) {
      const store = await this.active(ctx);
      const crosswalk = await store.crosswalk(ctx.brandId, id);
      await store.assertLocalVocabulary(ctx.brandId, crosswalk.localVocabularyId);
      return store.approve(id, version, await vocabularyEntries(store.db, crosswalk.localVocabularyId), ctx);
    }
    public async resolve(input: PublicationVocabularyResolveInput) {
      if (!(await this.converted(input.brandId)))
        throw new PublicationVocabularyError('Shared vocabulary conversion is not committed', 409);
      return this.getStore().resolve(input);
    }
    /** A source adapter may pin this snapshot using the PUB-04 source-preparation contract. */
    public async snapshot(input: {
      brandId: string;
      crosswalkId: string;
      sourceVocabularyId: string;
    }): Promise<import('./publication/source').PublicationCrosswalkSnapshot> {
      const revisionId = await this.approvedRevision(input.brandId, input.crosswalkId, input.sourceVocabularyId);
      if (!revisionId) throw new PublicationVocabularyError('Shared crosswalk conversion is not committed', 409);
      const store = this.getStore();
      const row = await store.crosswalk(input.brandId, input.crosswalkId);
      if ((await store.source(input.brandId, row.sourceId)).archived)
        throw new PublicationVocabularyError('Source is archived', 409);
      const revision = row.revisions.find(item => String(item.revision) === revisionId);
      if (!revision?.approvedAt || !revision.approvedBy)
        throw new PublicationVocabularyError('Crosswalk has no matching approval snapshot', 409);
      return {
        brandId: input.brandId,
        crosswalkId: input.crosswalkId,
        revisionId,
        value: JSON.parse(JSON.stringify(revision)),
      };
    }
    public async resolveFrozenReference(
      reference: { brandId: string; crosswalkId: string; revisionId: string },
      codes: string[],
      outputs: PublicationVocabularyResolveInput['outputs'] = 'targetId'
    ) {
      const revision = Number(reference.revisionId);
      if (!Number.isSafeInteger(revision) || revision < 1 || String(revision) !== reference.revisionId)
        throw new PublicationVocabularyError('Invalid frozen crosswalk revision');
      const row = await this.getStore().crosswalk(reference.brandId, reference.crosswalkId);
      return this.resolve({
        brandId: reference.brandId,
        crosswalkId: reference.crosswalkId,
        sourceVocabularyId: row.localVocabularyId,
        revision,
        codes,
        outputs,
      });
    }
    public async approvedRevision(
      brandId: string,
      crosswalkId: string,
      sourceVocabularyId: string
    ): Promise<string | null> {
      if (!(await this.converted(brandId))) return null;
      const row = await this.getStore().crosswalk(brandId, crosswalkId);
      if (row.localVocabularyId !== sourceVocabularyId || !row.approvedRevision || row.status === 'archived')
        throw new PublicationVocabularyError('Crosswalk has no matching approved revision', 409);
      return String(row.approvedRevision);
    }
    public async legacyResolve(input: {
      brandId: string;
      crosswalkId: string;
      sourceVocabularyId: string;
      codes: string[];
      outputs: string;
      revision?: number;
    }) {
      if (!(await this.converted(input.brandId))) return null;
      const row = await this.getStore().crosswalk(input.brandId, input.crosswalkId);
      const source = await this.getStore().source(input.brandId, row.sourceId);
      if (source.provider !== 'figshare')
        throw new PublicationVocabularyError('Legacy Figshare binding requires a Figshare source');
      return legacyFigshareResolution(
        await this.resolve({ ...input, outputs: 'targetId' }),
        input.outputs || 'categoryId'
      );
    }
  }
}
declare global {
  const PublicationVocabularyService: Services.PublicationVocabulary;
}
