import axios, { AxiosInstance } from 'axios';
import { Services as services } from '../CoreService';
import { Services as VocabularyServiceModule } from './VocabularyService';
import { VocabularyAttributes } from '../waterline-models';

type VocabularyServiceApi = {
  create: VocabularyServiceModule.Vocabulary['create'];
  upsertEntries: VocabularyServiceModule.Vocabulary['upsertEntries'];
};

export namespace Services {
  interface RvaSearchResult {
    id: string;
    title: string;
    slug?: string;
    description?: string;
    owner?: string;
  }

  interface RvaVocabularyResponse {
    id: string;
    slug?: string;
    title?: string;
    description?: string;
    owner?: string;
    version?: Array<Record<string, unknown>>;
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

    private get api(): AxiosInstance {
      if (!this.client) {
        const baseUrl = this.getBaseUrl();
        this.client = axios.create({ baseURL: baseUrl, timeout: 15000 });
      }
      return this.client;
    }

    public async searchRva(query: string): Promise<RvaSearchResult[]> {
      const search = String(query ?? '').trim();
      if (!search) {
        return [];
      }

      const response = await this.api.get('/search', { params: { q: search } });
      const records = this.asArray(response.data);
      return records.map((record) => ({
        id: String(record.id ?? ''),
        title: String(record.title ?? record.name ?? ''),
        slug: record.slug ? String(record.slug) : undefined,
        description: record.description ? String(record.description) : undefined,
        owner: record.owner ? String(record.owner) : undefined
      })).filter(record => !!record.id);
    }

    public async importRvaVocabulary(rvaId: string, versionId?: string, branding?: string): Promise<VocabularyAttributes> {
      const metadata = await this.getVocabularyById(rvaId);
      const selectedVersionId = versionId || this.selectVersionId(metadata.version);
      const concepts = await this.getConceptTree(selectedVersionId);

      const vocabularyService = this.getVocabularyService();
      const vocabulary = await vocabularyService.create({
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
      const concepts = await this.getConceptTree(selectedVersionId);
      const entries = this.toVocabularyEntries(concepts);

      const vocabularyService = this.getVocabularyService();
      const counters = await vocabularyService.upsertEntries(String(vocabulary.id), entries);
      const lastSyncedAt = new Date().toISOString();

      await Vocabulary.updateOne({ id: vocabulary.id }).set({
        sourceVersionId: selectedVersionId,
        lastSyncedAt,
        name: String(metadata.title ?? vocabulary.name),
        description: metadata.description ?? vocabulary.description,
        owner: metadata.owner ?? vocabulary.owner
      });

      return {
        ...counters,
        lastSyncedAt
      };
    }

    private getVocabularyService(): VocabularyServiceApi {
      return sails.services['vocabularyservice'] as Sails.DynamicService & VocabularyServiceApi;
    }

    private getBaseUrl(): string {
      const configValue = _.get(sails.config, 'vocab.rva.baseUrl', 'https://vocabs.ardc.edu.au/repository/api/rva');
      return String(configValue).replace(/\/$/, '');
    }

    private asArray(data: unknown): Record<string, unknown>[] {
      if (Array.isArray(data)) {
        return data as Record<string, unknown>[];
      }
      if (data && typeof data === 'object') {
        const obj = data as Record<string, unknown>;
        if (Array.isArray(obj.items)) {
          return obj.items as Record<string, unknown>[];
        }
        if (Array.isArray(obj.results)) {
          return obj.results as Record<string, unknown>[];
        }
      }
      return [];
    }

    private async getVocabularyById(rvaId: string): Promise<RvaVocabularyResponse> {
      const response = await this.api.get(`/vocabulary/${encodeURIComponent(rvaId)}`, {
        params: {
          includeVersions: true,
          includeAccessPoints: true,
          includeRelatedEntitiesAndVocabularies: true,
          includeLanguageList: true
        }
      });
      return response.data as RvaVocabularyResponse;
    }

    private async getConceptTree(versionId: string): Promise<RvaConceptNode[]> {
      const response = await this.api.get(`/version/${encodeURIComponent(versionId)}/concept-tree`);
      const body = response.data as Record<string, unknown>;
      if (Array.isArray(body)) {
        return body as RvaConceptNode[];
      }
      if (Array.isArray(body.concepts)) {
        return body.concepts as RvaConceptNode[];
      }
      if (Array.isArray(body.items)) {
        return body.items as RvaConceptNode[];
      }
      return [];
    }

    private selectVersionId(versions: Array<Record<string, unknown>> | undefined): string {
      const list = versions ?? [];
      if (list.length === 0) {
        return '';
      }
      const current = list.find(item => String(item.status ?? '').toLowerCase() === 'current');
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
