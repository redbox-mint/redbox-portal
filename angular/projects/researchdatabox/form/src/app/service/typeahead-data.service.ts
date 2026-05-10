import { APP_BASE_HREF } from "@angular/common";
import { HttpClient } from "@angular/common/http";
import { Inject, Injectable } from "@angular/core";
import { firstValueFrom } from "rxjs";
import { get as _get } from "lodash-es";
import { ConfigService, HttpClientService, UtilityService } from "@researchdatabox/portal-ng-common";
import { FormPrehydratePayload, TypeaheadOption } from "@researchdatabox/sails-ng-common";

type WrappedResponse<T> = { data?: T };

@Injectable({ providedIn: "root" })
export class TypeaheadDataService extends HttpClientService {
    // In-flight request dedup keyed per search method.
    // Only dedups *concurrent* identical lookups — once the request resolves, the entry is
    // removed so subsequent callers always re-fetch. This avoids serving stale results for
    // user-typed terms while still collapsing the burst of identical lookups that fire when
    // multiple typeahead instances on the same form initialise with the same stored value.
    private readonly inFlight = new Map<string, Promise<TypeaheadOption[]>>();
    private readonly prehydratedLabels = new Map<string, TypeaheadOption>();

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
        const prehydrated = this.prehydratedLabels.get(this.getVocabularyPrehydrateKey(trimmedVocabRef, "label", "value", trimmedSearch))
            ?? this.prehydratedLabels.get(this.getVocabularyPrehydrateKey(trimmedVocabRef, "label", "identifier", trimmedSearch));
        if (offset === 0 && trimmedSearch && prehydrated && (prehydrated.value === trimmedSearch || prehydrated.label === trimmedSearch)) {
            return Promise.resolve([prehydrated]);
        }
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
        const trimmedQueryId = String(queryId ?? "").trim();
        if (!trimmedQueryId) {
            return Promise.reject(new Error("queryId is required"));
        }
        const trimmedSearch = String(search ?? "");
        const resolvedLabelField = String(labelField ?? "").trim() || "label";
        const resolvedValueField = String(valueField ?? "").trim() || "value";
        const prehydrated = this.prehydratedLabels.get(this.getNamedQueryPrehydrateKey(trimmedQueryId, resolvedLabelField, resolvedValueField, trimmedSearch));
        if (start === 0 && trimmedSearch && prehydrated && (prehydrated.value === trimmedSearch || prehydrated.label === trimmedSearch)) {
            return Promise.resolve([prehydrated]);
        }
        const key = `namedQuery|${trimmedQueryId}|${trimmedSearch}|${start}|${rows}|${resolvedLabelField}|${resolvedValueField}`;
        return this.dedupe(key, () => this.fetchNamedQuery(trimmedQueryId, trimmedSearch, start, rows, resolvedLabelField, resolvedValueField));
    }

    public seedFromPayload(prehydrate?: FormPrehydratePayload): void {
        const labels = prehydrate?.typeaheadLabels ?? {};
        for (const [key, option] of Object.entries(labels)) {
            if (!option) {
                continue;
            }
            this.prehydratedLabels.set(key, option);
        }
    }

    private async fetchNamedQuery(
        queryId: string,
        search: string,
        start: number,
        rows: number,
        labelField: string,
        valueField: string
    ): Promise<TypeaheadOption[]> {
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

        const records = this.extractNamedQueryRecords(response);
        return records
            .map((record) => {
                const label = this.getPathValue(record, labelField);
                const value = this.getPathValue(record, valueField);
                return {
                    label: String(label ?? ""),
                    value: String(value ?? label ?? ""),
                    sourceType: "namedQuery" as const,
                    raw: record
                };
            })
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

    private getNamedQueryPrehydrateKey(queryId: string, labelField: string, valueField: string, storedValue: string): string {
        return `namedQuery:${queryId}:${labelField}:${valueField}:${storedValue}`;
    }

    private getVocabularyPrehydrateKey(vocabRef: string, labelField: string, valueField: string, storedValue: string): string {
        return `vocabulary:${vocabRef}:${labelField}:${valueField}:${storedValue}`;
    }
}
