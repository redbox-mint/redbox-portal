import {APP_BASE_HREF} from "@angular/common";
import {HttpClient} from "@angular/common/http";
import {Inject, Injectable} from "@angular/core";
import {firstValueFrom} from "rxjs";
import {get as _get} from "lodash-es";
import {ConfigService, HttpClientService, UtilityService} from "@researchdatabox/portal-ng-common";
import {TypeaheadOption} from "@researchdatabox/sails-ng-common";

type WrappedResponse<T> = { data?: T };

@Injectable({providedIn: "root"})
export class TypeaheadDataService extends HttpClientService {
    constructor(
        @Inject(HttpClient) protected override http: HttpClient,
        @Inject(APP_BASE_HREF) public override rootContext: string,
        @Inject(UtilityService) protected override utilService: UtilityService,
        @Inject(ConfigService) protected override configService: ConfigService
    ) {
        super(http, rootContext, utilService, configService);
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
            raw: opt?.raw
        }));
    }

    public async searchVocabularyEntries(vocabRef: string, search: string, limit = 25, offset = 0): Promise<TypeaheadOption[]> {
        await this.waitForInit();
        const trimmedVocabRef = String(vocabRef ?? "").trim();
        if (!trimmedVocabRef) {
            throw new Error("vocabRef is required");
        }

        const url = `${this.brandingAndPortalUrl}/vocab/${encodeURIComponent(trimmedVocabRef)}/entries`;
        const response = await firstValueFrom(
            this.http.get<WrappedResponse<Array<Record<string, unknown>>> | Array<Record<string, unknown>>>(url, {
                responseType: "json",
                observe: "body",
                context: this.httpContext,
                params: {
                    search: String(search ?? ""),
                    limit: String(limit),
                    offset: String(offset)
                }
            })
        );

        const records = this.unwrapArrayResponse(response);
        return records
            .map((entry) => ({
                label: String(entry?.["label"] ?? ""),
                value: String(entry?.["value"] ?? ""),
                sourceType: "vocabulary" as const,
                raw: entry
            }))
            .filter((entry) => Boolean(entry.label || entry.value));
    }

    public async searchNamedQuery(
        queryId: string,
        search: string,
        start = 0,
        rows = 25,
        labelField = "label",
        valueField = "value"
    ): Promise<TypeaheadOption[]> {
        await this.waitForInit();
        const trimmedQueryId = String(queryId ?? "").trim();
        if (!trimmedQueryId) {
            throw new Error("queryId is required");
        }

        const url = `${this.brandingAndPortalUrl}/query/vocab/${encodeURIComponent(trimmedQueryId)}`;
        const response = await firstValueFrom(
            this.http.get<WrappedResponse<unknown> | unknown>(url, {
                responseType: "json",
                observe: "body",
                context: this.httpContext,
                params: {
                    search: String(search ?? ""),
                    start: String(start),
                    rows: String(rows)
                }
            })
        );

        const records = this.extractNamedQueryRecords(response);
        const resolvedLabelField = String(labelField ?? "").trim() || "label";
        const resolvedValueField = String(valueField ?? "").trim() || "value";
        return records
            .map((record) => {
                const label = this.getPathValue(record, resolvedLabelField);
                const value = this.getPathValue(record, resolvedValueField);
                return {
                    label: String(label ?? ""),
                    value: String(value ?? label ?? ""),
                    sourceType: "namedQuery" as const,
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

    private getPathValue(record: unknown, path: string): unknown {
        if (!path) {
            return undefined;
        }
        return _get(record, path);
    }
}
