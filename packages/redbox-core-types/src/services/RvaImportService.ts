import axios, { AxiosInstance } from 'axios';
import {
  Configuration as RvaConfiguration,
  ResourcesApi,
  ServicesApi,
  Version as RvaVersion,
  Vocabulary as RvaVocabulary
} from '@researchdatabox/rva-registry-openapi-generated-node';
import { Services as services } from '../CoreService';
import { VocabularyAttributes } from '../waterline-models';
import { Services as VocabularyServiceModule } from './VocabularyService';



export namespace Services {
  interface RvaSearchResult {
    id: string;
    title: string;
    slug?: string;
    description?: string;
    owner?: string;
  }

  interface RvaVocabularyResponse {
    id?: number;
    slug?: string;
    title?: string;
    description?: string;
    owner?: string;
    version?: RvaVersion[];
  }

  interface RvaConceptNode {
    id?: string;
    iri?: string;
    identifier?: string;
    label?: string;
    prefLabel?: string;
    notation?: string;
    value?: string;
    children?: RvaConceptNode[];
  }

  export class RvaImport extends services.Core.Service {
    protected override _exportedMethods: string[] = [
      'searchRva',
      'importRvaVocabulary',
      'syncRvaVocabulary'
    ];

    private client: AxiosInstance | null = null;
    private configuration: RvaConfiguration | null = null;
    private resourcesClient: ResourcesApi | null = null;
    private servicesClient: ServicesApi | null = null;

    private get httpClient(): AxiosInstance {
      if (!this.client) {
        this.client = axios.create({ timeout: 15000 });
      }
      return this.client;
    }

    private get apiConfiguration(): RvaConfiguration {
      if (!this.configuration) {
        this.configuration = new RvaConfiguration({ basePath: this.getBaseUrl() });
      }
      return this.configuration;
    }

    private get resourcesApi(): ResourcesApi {
      if (!this.resourcesClient) {
        this.resourcesClient = new ResourcesApi(this.apiConfiguration, this.getBaseUrl(), this.httpClient);
      }
      return this.resourcesClient;
    }

    private get servicesApi(): ServicesApi {
      if (!this.servicesClient) {
        this.servicesClient = new ServicesApi(this.apiConfiguration, this.getBaseUrl(), this.httpClient);
      }
      return this.servicesClient;
    }


    public async searchRva(query: string): Promise<RvaSearchResult[]> {
      const search = String(query ?? '').trim();
      if (!search) {
        return [];
      }

      const filters = JSON.stringify({ q: search, pp: 20 });
      const response = await this.servicesApi.search(filters, { headers: { Accept: 'application/json' } });
      return this.extractSearchResults(response.data);
    }

    public async importRvaVocabulary(rvaId: string, versionId?: string, branding?: string): Promise<VocabularyAttributes> {
      const metadata = await this.getVocabularyById(rvaId);
      const selectedVersionId = versionId || this.selectVersionId(metadata.version);
      if (!selectedVersionId) {
        throw new Error(`Missing RVA version id for rvaId: ${rvaId}`);
      }
      const concepts = await this.getConceptTree(selectedVersionId);

     
      const vocabulary = await VocabularyService.create({
        name: String(metadata.title ?? metadata.slug ?? rvaId),
        slug: metadata.slug,
        description: metadata.description,
        owner: metadata.owner,
        source: 'rva',
        sourceId: String(metadata.id),
        sourceVersionId: selectedVersionId,
        lastSyncedAt: new Date().toISOString(),
        type: this.hasChildren(concepts) ? 'tree' : 'flat',
        branding: branding || String(sails.config.auth.defaultBrand || 'default'),
        entries: this.toVocabularyEntries(concepts)
      });

      return vocabulary;
    }

    public async syncRvaVocabulary(vocabularyId: string, versionId?: string): Promise<{ updated: number; created: number; skipped: number; lastSyncedAt: string }> {
      const vocabulary = await Vocabulary.findOne({ id: vocabularyId });
      if (!vocabulary) {
        throw new Error('Vocabulary not found');
      }
      if (String(vocabulary.source) !== 'rva' || !vocabulary.sourceId) {
        throw new Error('Vocabulary is not an RVA imported vocabulary');
      }

      const metadata = await this.getVocabularyById(String(vocabulary.sourceId));
      const selectedVersionId = versionId || this.selectVersionId(metadata.version);
      if (!selectedVersionId) {
        throw new Error(`Missing RVA version id for rvaId: ${vocabulary.sourceId}`);
      }
      const concepts = await this.getConceptTree(selectedVersionId);
      const entries = this.toVocabularyEntries(concepts);

      const lastSyncedAt = new Date().toISOString();

      const counters = await this.runInTransaction(async (connection) => {
        const results = await VocabularyService.upsertEntries(String(vocabulary.id), entries, connection);
        const updater = Vocabulary.updateOne({ id: vocabulary.id }).set({
          sourceVersionId: selectedVersionId,
          lastSyncedAt,
          name: String(metadata.title ?? vocabulary.name),
          description: metadata.description ?? vocabulary.description,
          owner: metadata.owner ?? vocabulary.owner
        });
        try {
          const updaterWithConnection = updater as unknown as { usingConnection?: (db: unknown) => Promise<void> };
          if (connection && typeof updaterWithConnection.usingConnection === 'function') {
            await updaterWithConnection.usingConnection(connection);
          } else {
            await updater;
          }
        } catch (error) {
          if (!connection) {
            sails.log?.error?.('RVA sync failed after entry upsert; retry may be required.', error);
            throw new Error(`Sync failed after updating entries: ${String(error)}`);
          }
          throw error;
        }
        return results;
      });

      return {
        ...counters,
        lastSyncedAt
      };
    }


    private async runInTransaction<T>(work: (connection?: unknown) => Promise<T>): Promise<T> {
      const datastore = Vocabulary.getDatastore();
      if (datastore?.transaction) {
        try {
          return await datastore.transaction(async (db: unknown) => work(db));
        } catch (error) {
          const message = String((error as Error)?.message ?? error);
          if (message.includes('transactional') && message.includes('adapter')) {
            sails.log?.warn?.('Transactions are not supported by this datastore adapter. Falling back to non-transactional execution.');
            return work(undefined);
          }
          throw error;
        }
      }
      return work(undefined);
    }

    private getBaseUrl(): string {
      const configValue = _.get(sails.config, 'vocab.rva.baseUrl', 'https://vocabs.ardc.edu.au/registry');
      const normalized = String(configValue).replace(/\/$/, '');
      if (normalized.endsWith('/repository/api/rva')) {
        return normalized.replace(/\/repository\/api\/rva$/, '/registry');
      }
      return normalized;
    }

    private extractSearchResults(data: unknown): RvaSearchResult[] {
      const body = this.asRecord(data);
      const response = this.asRecord(body?.response);
      const docs = Array.isArray(response?.docs) ? response.docs : [];

      return docs.map((doc) => {
        const record = this.asRecord(doc);
        const id = this.asString(record?.id) ?? '';
        const title = this.asString(record?.title) ?? this.asString(record?.name) ?? '';
        return {
          id,
          title,
          slug: this.asString(record?.slug),
          description: this.asString(record?.description),
          owner: this.asString(record?.owner)
        };
      }).filter((record) => record.id.length > 0);
    }

    private asString(value: unknown): string | undefined {
      if (typeof value === 'string') {
        return value;
      }
      if (typeof value === 'number') {
        return String(value);
      }
      if (Array.isArray(value)) {
        return this.asString(value[0]);
      }
      return undefined;
    }

    private asRecord(value: unknown): Record<string, unknown> | null {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, unknown>;
      }
      return null;
    }

    private async getVocabularyById(rvaId: string): Promise<RvaVocabularyResponse> {
      const id = this.parseIdAsNumber(rvaId, 'vocabulary');
      const response = await this.resourcesApi.getVocabularyById(
        id,
        true,
        true,
        true,
        true,
        { headers: { Accept: 'application/json' } }
      );
      return response.data as RvaVocabulary;
    }

    private async getConceptTree(versionId: string): Promise<RvaConceptNode[]> {
      const id = this.parseIdAsNumber(versionId, 'version');
      try {
        const response = await this.resourcesApi.getVersionArtefactConceptTree(id, {
          headers: { Accept: 'text/plain' }
        });
        return this.parseConceptTreeResponse(response.data);
      } catch (error) {
        if (!axios.isAxiosError(error) || error.response?.status !== 406) {
          throw error;
        }

        const fallbackResponse = await this.httpClient.get(
          `${this.getLegacyBaseUrl()}/version/${encodeURIComponent(String(id))}/concept-tree`
        );
        return this.parseConceptTreeResponse(fallbackResponse.data);
      }
    }

    private getLegacyBaseUrl(): string {
      const configured = String(_.get(sails.config, 'vocab.rva.baseUrl', 'https://vocabs.ardc.edu.au/registry')).replace(/\/$/, '');
      if (configured.endsWith('/repository/api/rva')) {
        return configured;
      }
      if (configured.endsWith('/registry')) {
        return configured.replace(/\/registry$/, '/repository/api/rva');
      }
      return `${configured}/repository/api/rva`;
    }

    private parseConceptTreeResponse(data: unknown): RvaConceptNode[] {
      if (Array.isArray(data)) {
        return data as RvaConceptNode[];
      }

      let body = data;
      if (typeof data === 'string') {
        try {
          body = JSON.parse(data);
        } catch (_error) {
          return [];
        }
      }

      if (Array.isArray(body)) {
        return body as RvaConceptNode[];
      }

      const record = this.asRecord(body);
      if (!record) {
        return [];
      }

      if (Array.isArray(record.concepts)) {
        return record.concepts as RvaConceptNode[];
      }
      if (Array.isArray(record.forest)) {
        return record.forest as RvaConceptNode[];
      }
      if (Array.isArray(record.items)) {
        return record.items as RvaConceptNode[];
      }
      if (Array.isArray(record.children)) {
        return record.children as RvaConceptNode[];
      }
      return [];
    }

    private parseIdAsNumber(value: string, label: string): number {
      const parsed = Number.parseInt(String(value), 10);
      if (!Number.isFinite(parsed)) {
        throw new Error(`Invalid RVA ${label} id: ${value}`);
      }
      return parsed;
    }

    private selectVersionId(versions: RvaVersion[] | undefined): string {
      const list = versions ?? [];
      if (list.length === 0) {
        return '';
      }
      const current = list.find((item) => String(item.status ?? '').toLowerCase() === 'current');
      if (current?.id) {
        return String(current.id);
      }

      const sorted = [...list].sort((a, b) => {
        const aDate = Date.parse(String(a['release-date'] ?? '1970-01-01'));
        const bDate = Date.parse(String(b['release-date'] ?? '1970-01-01'));
        return bDate - aDate;
      });
      return String(sorted[0].id ?? '');
    }

    private hasChildren(nodes: RvaConceptNode[]): boolean {
      return nodes.some(node => Array.isArray(node.children) && node.children.length > 0);
    }

    private toVocabularyEntries(nodes: RvaConceptNode[], parentId: string | null = null, path: string = 'root'): VocabularyServiceModule.VocabularyEntryInput[] {
      const mapped: VocabularyServiceModule.VocabularyEntryInput[] = [];
      nodes.forEach((node, index) => {
        const id = `${path}-${index}`;
        mapped.push({
          id,
          parent: parentId ?? undefined,
          label: String(node.label ?? node.prefLabel ?? node.id ?? node.iri ?? ''),
          value: String(node.notation ?? node.value ?? node.identifier ?? node.iri ?? node.id ?? ''),
          identifier: String(node.identifier ?? node.iri ?? node.id ?? ''),
          order: index
        });

        if (Array.isArray(node.children) && node.children.length > 0) {
          mapped.push(...this.toVocabularyEntries(node.children, id, id));
        }
      });
      return mapped;
    }
  }
}

declare global {
  let RvaImportService: Services.RvaImport;
}
