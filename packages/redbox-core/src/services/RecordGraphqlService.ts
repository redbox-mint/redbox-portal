import { printSchema } from 'graphql';
import { Services as services } from '../CoreService';
import { recordGraphql, validateRecordGraphqlConfig, type RecordGraphqlConfig } from '../config/recordGraphql.config';
import { recordSchema } from '../config/recordSchema.config';
import { formatRecordFormFingerprint } from '../RecordFormFingerprint';
import {
  RecordContractCompiler,
  type ContractJsonObject,
  type RecordContract,
  type RecordContractContributorRegistry,
  type RecordContractRegistrationIssue,
} from '../record-contract';
import { configuredReadContracts, type ReadContractCandidate } from '../record-graphql/read-contract';
import { createRecordYoga, QUERY_LIMITS } from '../record-graphql/schema';
import { isObject } from '../record-graphql/renderer';
import type { ReadCaller, ReadPorts } from '../record-graphql/read-record';

export interface RecordGraphqlDependencies extends ReadPorts {
  readonly getConfig: () => RecordGraphqlConfig;
  readonly getCandidates: (caller: ReadCaller) => Promise<readonly ReadContractCandidate[]>;
  readonly getReusableDefinitions: () => typeof sails.config.reusableFormDefinitions;
  readonly getContributorRegistry: () => RecordContractContributorRegistry | undefined;
  readonly getContributorRegistrationIssues: () => readonly RecordContractRegistrationIssue[];
}

type ReadSchema = ReturnType<typeof createRecordYoga>;
interface CacheEntry {
  readonly registry: RecordContractContributorRegistry;
  readonly schema: Promise<ReadSchema>;
  pending: boolean;
}

export interface RecordGraphqlResponse {
  readonly status: number;
  readonly data: ContractJsonObject;
}

export function graphqlFailure(status: number, code: string, message: string): RecordGraphqlResponse {
  return { status, data: { errors: [{ message, extensions: { code } }] } };
}

export namespace Services {
  export class RecordGraphql extends services.Core.Service {
    protected _exportedMethods = ['init', 'execute', 'describeReadSchema'];
    private readonly cache = new Map<string, CacheEntry>();
    private readonly dependencies: RecordGraphqlDependencies;

    constructor(dependencies: Partial<RecordGraphqlDependencies> = {}) {
      super();
      this.dependencies = {
        getConfig: () => sails.config.recordGraphql ?? recordGraphql,
        getCandidates: caller => configuredReadContracts(caller.brand),
        getReusableDefinitions: () => sails.config.reusableFormDefinitions,
        getContributorRegistry: () => undefined,
        getContributorRegistrationIssues: () => [],
        getRecord: oid => RecordsService.getMeta(oid),
        hasViewAccess: (caller, record) =>
          RecordsService.hasViewAccess(caller.brand, caller.user, caller.roles, record),
        ...dependencies,
      };
    }

    public init(): void {
      /* Configuration and contributor discovery are read at request time. */
    }

    /** Private service tooling for integration owners; no HTTP schema-discovery route. */
    public async describeReadSchema(caller: ReadCaller): Promise<string> {
      return printSchema((await this.resolveReadSchema(caller)).schema);
    }

    public async execute(caller: ReadCaller, body: unknown): Promise<RecordGraphqlResponse> {
      if (!isObject(caller.user) || typeof caller.user.username !== 'string') {
        return graphqlFailure(401, 'UNAUTHENTICATED', 'Authentication is required.');
      }
      if (!isObject(body) || typeof body.query !== 'string') {
        return graphqlFailure(400, 'INVALID_REQUEST', 'A JSON GraphQL query is required.');
      }
      let serialized: string;
      try {
        serialized = JSON.stringify(body);
      } catch {
        return graphqlFailure(400, 'INVALID_REQUEST', 'A JSON GraphQL query is required.');
      }
      if (Buffer.byteLength(serialized) > QUERY_LIMITS.bytes) {
        return graphqlFailure(413, 'QUERY_LIMIT', 'Request exceeds the byte bound.');
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = Date.now() + QUERY_LIMITS.timeoutMs;
      try {
        const work = async (): Promise<RecordGraphqlResponse> => {
          const { yoga } = await this.resolveReadSchema(caller);
          if (Date.now() >= deadline) return graphqlFailure(503, 'QUERY_TIMEOUT', 'Read query timed out.');
          // Sails has consumed the HTTP body. Rebuild a bounded fetch request for Yoga.
          const response = await yoga.fetch(
            'http://redbox.internal/graphql',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Accept: 'application/graphql-response+json' },
              body: serialized,
            },
            { caller, deadline }
          );
          const result = await response.text();
          if (Buffer.byteLength(result) > QUERY_LIMITS.responseBytes) {
            return graphqlFailure(413, 'QUERY_LIMIT', 'Response exceeds the byte bound.');
          }
          const data: ContractJsonObject = JSON.parse(result);
          return { status: response.status, data };
        };
        return await Promise.race([
          work(),
          new Promise<RecordGraphqlResponse>(resolve => {
            timer = setTimeout(
              () => resolve(graphqlFailure(503, 'QUERY_TIMEOUT', 'Read query timed out.')),
              QUERY_LIMITS.timeoutMs
            );
          }),
        ]);
      } catch {
        return graphqlFailure(503, 'UNAVAILABLE', 'Record GraphQL is unavailable.');
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    }

    private async resolveReadSchema(caller: ReadCaller): Promise<ReadSchema> {
      const config = this.dependencies.getConfig();
      validateRecordGraphqlConfig(config);
      if (!config.enabled) {
        this.cache.clear();
        throw new Error('Record GraphQL is disabled.');
      }
      while (this.cache.size > config.cacheEntries) {
        const evict = [...this.cache].find(([, entry]) => !entry.pending);
        if (!evict) throw new Error('Read schema compilation capacity exceeds configured capacity.');
        this.cache.delete(evict[0]);
      }
      const registry = this.dependencies.getContributorRegistry();
      if (!registry || this.dependencies.getContributorRegistrationIssues().length) {
        this.cache.clear();
        throw new Error('Record contributors are unavailable.');
      }
      // Reload the scoped configuration on every request, so administrative edits
      // and hook changes cannot leave a cached schema stale until a TTL expires.
      const candidates = await this.dependencies.getCandidates(caller);
      if (candidates.length > config.maxVariants) throw new Error('Read variants exceed their bound.');
      const reusableFormDefinitions = this.dependencies.getReusableDefinitions();
      const fingerprint = formatRecordFormFingerprint({ candidates, reusableFormDefinitions });
      if (!fingerprint) throw new Error('Read configuration exceeds its fingerprint bound.');
      const key = JSON.stringify([caller.brand.id, caller.brand.name, caller.portal, fingerprint]);
      const cached = this.cache.get(key);
      if (cached?.registry === registry) {
        this.cache.delete(key);
        this.cache.set(key, cached);
        return cached.schema;
      }
      if (cached?.pending) throw new Error('Read contributor configuration changed during compilation.');
      if (cached && !cached.pending) this.cache.delete(key);
      // Pending builds count towards the capacity and cannot be evicted to start
      // unbounded parallel compilations. Record values are never cached here.
      while (this.cache.size >= config.cacheEntries) {
        const evict = [...this.cache].find(([, entry]) => !entry.pending);
        if (!evict) throw new Error('Read schema compilation capacity is exhausted.');
        this.cache.delete(evict[0]);
      }
      const entry: CacheEntry = {
        registry,
        pending: true,
        schema: this.compileReadSchema(caller, candidates, reusableFormDefinitions, registry, fingerprint),
      };
      this.cache.set(key, entry);
      try {
        return await entry.schema;
      } catch (error) {
        if (this.cache.get(key) === entry) this.cache.delete(key);
        throw error;
      } finally {
        entry.pending = false;
      }
    }

    private async compileReadSchema(
      caller: ReadCaller,
      candidates: readonly ReadContractCandidate[],
      reusableFormDefinitions: typeof sails.config.reusableFormDefinitions,
      registry: RecordContractContributorRegistry,
      fingerprint: string
    ): Promise<ReadSchema> {
      const compiler = new RecordContractCompiler(registry, recordSchema.limits);
      const deadline = Date.now() + QUERY_LIMITS.timeoutMs;
      const contracts: RecordContract[] = [];
      for (const candidate of candidates) {
        if (Date.now() > deadline) throw new Error('Read compilation timed out.');
        const result = await compiler.compile({
          form: candidate.configuration,
          reusableFormDefinitions,
          fieldMode: 'read',
          context: {
            brand: caller.brand.name,
            portal: caller.portal,
            recordType: candidate.recordType,
            workflowStep: candidate.workflowStep,
            form: candidate.form,
            // The shared compiler's context describes validation vocabulary.
            // No write resolver, edit filtering, validator or enforcement is used.
            kind: 'update',
            operation: 'strict-all',
            unknownProperties: 'allow',
            enforcement: 'shadow',
          },
        });
        if (result.kind !== 'compiled') throw new Error('Read contract compilation failed.');
        contracts.push(result.contract);
      }
      if (formatRecordFormFingerprint({ candidates, reusableFormDefinitions }) !== fingerprint) {
        throw new Error('Read configuration changed during compilation.');
      }
      return createRecordYoga(contracts, this.dependencies);
    }
  }
}

declare global {
  var RecordGraphqlService: Services.RecordGraphql;
}
