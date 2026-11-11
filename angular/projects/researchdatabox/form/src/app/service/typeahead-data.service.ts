import { APP_BASE_HREF } from "@angular/common";
import { HttpClient, HttpErrorResponse } from "@angular/common/http";
import { Inject, Injectable } from "@angular/core";
import { firstValueFrom } from "rxjs";
import { get as _get } from "lodash-es";
import { ConfigService, HttpClientService, UtilityService } from "@researchdatabox/portal-ng-common";
import { NamedQueryLookupResult, TypeaheadOption } from "@researchdatabox/sails-ng-common";

export class TypeaheadLookupError extends Error {
    constructor(readonly misconfigured: boolean) { super('Lookup request failed'); }
}

type WrappedResponse<T> = { data?: T; meta?: Record<string, unknown> };

@Injectable({ providedIn: "root" })
export class TypeaheadDataService extends HttpClientService {
    // In-flight request dedup keyed per search method.
    // Only dedups *concurrent* identical lookups — once the request resolves, the entry is
    // removed so subsequent callers always re-fetch. This avoids serving stale results for
    // user-typed terms while still collapsing the burst of identical lookups that fire when
    // multiple typeahead instances on the same form initialise with the same stored value.
    private readonly namedQueryInFlight = new Map<string, Promise<NamedQueryLookupResult<TypeaheadOption>>>();
    private readonly inFlight = new Map<string, Promise<TypeaheadOption[]>>();

    constructor(
        @Inject(HttpClient) protected override http: HttpClient,
        @Inject(APP_BASE_HREF) public override rootContext: string,
        @Inject(UtilityService) protected override utilService: UtilityService,
        @Inject(ConfigService) protected override configService: ConfigService
    ) {
        super(http, rootContext, utilService, configService);
    }

    private dedupe(key: string, fetcher: () => Promise<TypeaheadOption[]>): Promise<TypeaheadOption[]> {
        const existing = this.inFlight.get(key);
        if (existing) {
            return existing;
        }
        const pending = fetcher();
        this.inFlight.set(key, pending);
        const cleanup = () => this.inFlight.delete(key);
        pending.then(cleanup, cleanup);
        return pending;
    }

    public override async waitForInit(): Promise<this> {
        await super.waitForInit();
        this.enableCsrfHeader();
        return this;
    }

    public async searchStatic(search: string, options: TypeaheadOption[], maxResults = 25): Promise<TypeaheadOption[]> {
        const term = String(search ?? "").trim().toLowerCase();
        const list = Array.isArray(options) ? options : [];
        const matches = !term
            ? list
            : list.filter((opt) => String(opt?.label ?? "").toLowerCase().includes(term) || String(opt?.value ?? "").toLowerCase().includes(term));
        return matches.slice(0, Math.max(maxResults, 1)).map((opt) => ({
            label: String(opt?.label ?? ""),
            value: String(opt?.value ?? ""),
            sourceType: opt?.sourceType ?? "static",
            historical: opt?.historical === true,
            disabled: opt?.disabled === true,
            raw: opt?.raw
        }));
    }

    public searchVocabularyEntries(vocabRef: string, search: string, limit = 25, offset = 0, includeHistoricalValues = false): Promise<TypeaheadOption[]> {
        const trimmedVocabRef = String(vocabRef ?? "").trim();
        if (!trimmedVocabRef) {
            return Promise.reject(new Error("vocabRef is required"));
        }
        const trimmedSearch = String(search ?? "");
        const key = `vocab|${trimmedVocabRef}|${trimmedSearch}|${limit}|${offset}|${includeHistoricalValues ? 1 : 0}`;
        return this.dedupe(key, () => this.fetchVocabularyEntries(trimmedVocabRef, trimmedSearch, limit, offset, includeHistoricalValues));
    }

    private async fetchVocabularyEntries(vocabRef: string, search: string, limit: number, offset: number, includeHistoricalValues: boolean): Promise<TypeaheadOption[]> {
        await this.waitForInit();
        const url = `${this.brandingAndPortalUrl}/vocab/${encodeURIComponent(vocabRef)}/entries`;
        const params: Record<string, string> = {
            search,
            limit: String(limit),
            offset: String(offset)
        };
        if (includeHistoricalValues) {
            params["includeHistoricalValues"] = "true";
        }
        const response = await firstValueFrom(
            this.http.get<WrappedResponse<Array<Record<string, unknown>>> | Array<Record<string, unknown>>>(url, {
                responseType: "json",
                observe: "body",
                context: this.httpContext,
                params
            })
        );

        const records = this.unwrapArrayResponse(response);
        return records
            .map((entry) => ({
                label: String(entry?.["label"] ?? ""),
                value: String(entry?.["value"] ?? ""),
                sourceType: "vocabulary" as const,
                historical: entry?.["historical"] === true,
                raw: entry
            }))
            .filter((entry) => Boolean(entry.label || entry.value));
    }

    public searchNamedQuery(
        queryId: string,
        search: string,
        start = 0,
        rows = 25,
        labelField = "label",
        valueField = "value"
    ): Promise<TypeaheadOption[]> {
        // Keep the established database array API (including paging) for hooks and
        // legacy callers. The form uses the bounded metadata-aware method below.
        if (start === 0 && Number.isSafeInteger(rows) && rows >= 1 && rows <= 25)
            return this.searchNamedQueryLookup(queryId, search, start, rows, labelField, valueField).then(result => result.options);
        const id = String(queryId ?? "").trim();
        if (!id) return Promise.reject(new Error("queryId is required"));
        if (!String(search ?? "").trim()) return Promise.resolve([]);
        const label = String(labelField ?? "").trim() || "label";
        const value = String(valueField ?? "").trim() || "value";
        return this.dedupe(`namedQuery|${id}|${search}|${start}|${rows}|${label}|${value}`, () =>
            this.fetchNamedQuery(id, search, start, rows, label, value).then(result => result.options));
    }

    public searchNamedQueryLookup(
        queryId: string, search: string, start = 0, rows = 25, labelField = "label", valueField = "value"
    ): Promise<NamedQueryLookupResult<TypeaheadOption>> {
        const trimmedQueryId = String(queryId ?? "").trim();
        if (!trimmedQueryId) return Promise.reject(new Error("queryId is required"));
        if (start !== 0) return Promise.reject(new Error("Lookup offsets are unsupported"));
        if (!Number.isSafeInteger(rows) || rows < 1) return Promise.reject(new Error("Invalid lookup page size"));
        if (!String(search ?? "").trim()) return Promise.resolve({ options: [] });
        const limit = Math.min(rows, 25);
        const resolvedLabelField = String(labelField ?? "").trim() || "label";
        const resolvedValueField = String(valueField ?? "").trim() || "value";
        const key = JSON.stringify([trimmedQueryId, search, limit, resolvedLabelField, resolvedValueField]);
        const existing = this.namedQueryInFlight.get(key);
        if (existing) return existing;
        const pending = this.fetchNamedQuery(trimmedQueryId, search, 0, limit, resolvedLabelField, resolvedValueField).catch((error: unknown) => {
            if (error instanceof HttpErrorResponse) {
                const body: unknown = error.error;
                const codes = this.isObject(body) ? [body['message'], ...(Array.isArray(body['errors'])
                    ? body['errors'].map((item: unknown) => this.isObject(item) ? item['code'] : undefined) : [])] : [];
                const misconfigured = codes.some(code => typeof code === 'string' && [
                    'GRAPHQL_LOOKUP_CONFIG_INVALID', 'GRAPHQL_LOOKUP_UNSUPPORTED', 'GRAPHQL_DEFINITION_INVALID', 'GRAPHQL_VOCAB_MAPPING_UNSUPPORTED',
                    'query-vocab-invalid-config', 'query-vocab-not-configured'
                ].includes(code));
                throw new TypeaheadLookupError(misconfigured);
            }
            throw error;
        });
        this.namedQueryInFlight.set(key, pending);
        const cleanup = () => this.namedQueryInFlight.delete(key);
        pending.then(cleanup, cleanup);
        return pending;
    }

    private async fetchNamedQuery(
        queryId: string,
        search: string,
        start: number,
        rows: number,
        labelField: string,
        valueField: string
    ): Promise<NamedQueryLookupResult<TypeaheadOption>> {
        await this.waitForInit();
        const url = `${this.brandingAndPortalUrl}/query/vocab/${encodeURIComponent(queryId)}`;
        const response = await firstValueFrom(
            this.http.get<WrappedResponse<unknown> | unknown>(url, {
                responseType: "json",
                observe: "body",
                context: this.httpContext,
                params: {
                    search,
                    start: String(start),
                    rows: String(rows)
                }
            })
        );

        const root = (response as WrappedResponse<unknown>)?.data ?? response;
        if (this.isObject(root) && Object.hasOwn(root, 'errors')) throw new Error('Lookup response contains errors');
        if (this.isObject(root) && root['source'] === 'graphql') {
            const pageRows = Math.min(rows, 25);
            const summary = root['summary'];
            const pagination = root['pagination'];
            const records = root['records'];
            if (!this.isObject(summary) || summary['numFound'] !== null || summary['start'] !== 0 || summary['page'] !== 1 ||
                !this.isObject(pagination) || pagination['mode'] !== 'firstPage' || typeof pagination['hasNextPage'] !== 'boolean' ||
                !Array.isArray(records) || records.length > pageRows || (pagination['hasNextPage'] && records.length !== pageRows)) {
                throw new Error('Invalid GraphQL lookup response');
            }
            const options = records.map((record: unknown): TypeaheadOption => {
                if (!this.isObject(record) || typeof record['oid'] !== 'string' || !record['oid'].trim() ||
                    typeof record['title'] !== 'string' || !record['title'].trim()) throw new Error('Invalid GraphQL lookup row');
                // GraphQL uses the validated shared wrapper; legacy path defaults do not invent IDs from labels.
                const label = labelField === 'label' ? record['title'] : this.getPathValue(record, labelField);
                const value = valueField === 'value' ? record['oid'] : this.getPathValue(record, valueField);
                if (typeof label !== 'string' || !label.trim() || typeof value !== 'string' || !value.trim())
                    throw new Error('Invalid GraphQL lookup mapping');
                return { label, value, sourceType: 'namedQuery', raw: record };
            });
            return { options, source: 'graphql', summary: { numFound: null, start: 0, page: 1 },
                pagination: { mode: 'firstPage', hasNextPage: pagination['hasNextPage'] } };
        }
        if (this.isObject(root) && root['source'] !== undefined && root['source'] !== 'database')
            throw new Error('Unsupported lookup source');
        const options = this.extractNamedQueryRecords(response)
            .map((record) => {
                const label = this.getPathValue(record, labelField);
                const value = this.getPathValue(record, valueField);
                return { label: String(label ?? ""), value: String(value ?? label ?? ""), sourceType: "namedQuery" as const, raw: record };
            })
            .filter((entry) => Boolean(entry.label || entry.value));
        return { options };
    }

    private isObject(value: unknown): value is Record<string, unknown> {
        return value !== null && typeof value === 'object' && !Array.isArray(value);
    }

    public async searchService(
        serviceId: string,
        search: string,
        start = 0,
        rows = 25
    ): Promise<TypeaheadOption[]> {
        await this.waitForInit();
        const trimmedServiceId = String(serviceId ?? "").trim();
        if (!trimmedServiceId) {
            throw new Error("serviceId is required");
        }

        const url = `${this.brandingAndPortalUrl}/service/vocab/${encodeURIComponent(trimmedServiceId)}`;
        const response = await firstValueFrom(
            this.http.post<WrappedResponse<Array<Record<string, unknown>>> | Array<Record<string, unknown>>>(url, {
                search: String(search ?? ""),
                start,
                rows
            }, {
                responseType: "json",
                observe: "body",
                context: this.httpContext
            })
        );

        const records = this.unwrapArrayResponse(response);
        return records
            .map((record) => ({
                label: String(record?.["label"] ?? ""),
                value: String(record?.["value"] ?? ""),
                sourceType: "service" as const,
                historical: record?.["historical"] === true,
                disabled: record?.["disabled"] === true,
                raw: record?.["raw"] ?? record
            }))
            .filter((entry) => Boolean(entry.label || entry.value));
    }

    public searchExternal(
        provider: string,
        search: string,
        resultArrayProperty = "",
        labelField = "label",
        valueField = "value"
    ): Promise<TypeaheadOption[]> {
        const trimmedProvider = String(provider ?? "").trim();
        if (!trimmedProvider) {
            return Promise.reject(new Error("provider is required"));
        }
        const trimmedSearch = String(search ?? "");
        const trimmedResultArrayProperty = String(resultArrayProperty ?? "").trim();
        const resolvedLabelField = String(labelField ?? "").trim() || "label";
        const resolvedValueField = String(valueField ?? "").trim() || "value";
        const key = `external|${trimmedProvider}|${trimmedSearch}|${trimmedResultArrayProperty}|${resolvedLabelField}|${resolvedValueField}`;
        return this.dedupe(key, () => this.fetchExternal(trimmedProvider, trimmedSearch, trimmedResultArrayProperty, resolvedLabelField, resolvedValueField));
    }

    private async fetchExternal(
        provider: string,
        search: string,
        resultArrayProperty: string,
        labelField: string,
        valueField: string
    ): Promise<TypeaheadOption[]> {
        await this.waitForInit();
        const url = `${this.brandingAndPortalUrl}/external/vocab/${encodeURIComponent(provider)}`;
        const response = await firstValueFrom(
            this.http.post<WrappedResponse<unknown> | unknown>(url, {
                options: {
                    query: search
                }
            }, {
                responseType: "json",
                observe: "body",
                context: this.httpContext
            })
        );

        const records = this.extractExternalRecords(response, resultArrayProperty);
        return records
            .map((record) => {
                const label = this.getPathValue(record, labelField);
                const value = this.getPathValue(record, valueField);
                return {
                    label: String(label ?? ""),
                    value: String(value ?? label ?? ""),
                    sourceType: "external" as const,
                    raw: record
                };
            })
            .filter((entry) => Boolean(entry.label || entry.value));
    }

    private unwrapArrayResponse(response: WrappedResponse<Array<Record<string, unknown>>> | Array<Record<string, unknown>>): Array<Record<string, unknown>> {
        if (Array.isArray(response)) {
            return response;
        }
        return Array.isArray(response?.data) ? response.data : [];
    }

    private extractNamedQueryRecords(response: WrappedResponse<unknown> | unknown): Array<Record<string, unknown>> {
        const root = (response as WrappedResponse<unknown>)?.data ?? response;
        if (Array.isArray(root)) {
            return root as Array<Record<string, unknown>>;
        }
        if (Array.isArray((root as { records?: unknown[] })?.records)) {
            return (root as { records: Array<Record<string, unknown>> }).records;
        }
        if (Array.isArray((root as { response?: { docs?: unknown[] } })?.response?.docs)) {
            return ((root as { response: { docs: Array<Record<string, unknown>> } }).response.docs) ?? [];
        }
        return [];
    }

    private extractExternalRecords(response: WrappedResponse<unknown> | unknown, resultArrayProperty: string): Array<Record<string, unknown>> {
        const root = (response as WrappedResponse<unknown>)?.data ?? response;
        if (Array.isArray(root)) {
            return root as Array<Record<string, unknown>>;
        }
        const propertyPath = String(resultArrayProperty ?? "").trim();
        if (propertyPath) {
            const nested = this.getPathValue(root, propertyPath);
            if (Array.isArray(nested)) {
                return nested as Array<Record<string, unknown>>;
            }
        }
        return [];
    }

    private getPathValue(record: unknown, path: string): unknown {
        if (!path) {
            return undefined;
        }
        return _get(record, path);
    }
}
