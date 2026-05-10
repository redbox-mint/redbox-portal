import { APP_BASE_HREF } from "@angular/common";
import { HttpClient } from "@angular/common/http";
import { Inject, Injectable } from "@angular/core";
import { firstValueFrom } from "rxjs";
import { ConfigService, HttpClientService, UtilityService } from "@researchdatabox/portal-ng-common";
import { FormPrehydratePayload, FormPrehydrateRootKey, VocabTreeChildrenResponse as SharedVocabTreeChildrenResponse } from "@researchdatabox/sails-ng-common";

export interface VocabTreeApiNode {
  id: string;
  label: string;
  value: string;
  notation?: string;
  parent?: string | null;
  hasChildren: boolean;
  disabled?: boolean;
}

export interface VocabTreeChildrenResponse {
  data: VocabTreeApiNode[];
  meta: {
    vocabularyId: string;
    parentId: string | null;
    total: number;
  };
}

type WrappedResponse = { data?: VocabTreeApiNode[]; meta?: VocabTreeChildrenResponse["meta"] };
type ApiResponse = VocabTreeChildrenResponse | WrappedResponse | VocabTreeApiNode[];

@Injectable({ providedIn: "root" })
export class VocabTreeService extends HttpClientService {
  // Vocab taxonomies are static for the lifetime of a form session, so we cache resolved
  // children responses indefinitely and dedupe concurrent requests for the same key.
  // Cleared by clearCache() if a caller ever needs to force a refresh.
  private readonly childrenCache = new Map<string, Promise<VocabTreeChildrenResponse>>();

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

  public async getChildren(vocabRef: string, parentId?: string): Promise<VocabTreeChildrenResponse> {
    const trimmedVocabRef = String(vocabRef ?? "").trim();
    if (!trimmedVocabRef) {
      throw new Error("vocabRef is required");
    }
    const trimmedParentId = String(parentId ?? "").trim();
    const cacheKey = `${trimmedVocabRef}::${trimmedParentId}`;

    const cached = this.childrenCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const pending = this.fetchChildren(trimmedVocabRef, trimmedParentId);
    this.childrenCache.set(cacheKey, pending);
    // Drop the cached promise on failure so the next caller gets a fresh attempt.
    pending.catch(() => this.childrenCache.delete(cacheKey));
    return pending;
  }

  public clearCache(): void {
    this.childrenCache.clear();
  }

  public seedFromPayload(prehydrate?: FormPrehydratePayload): void {
    const vocabTrees = prehydrate?.vocabTrees ?? {};
    for (const [vocabRef, treePayload] of Object.entries(vocabTrees)) {
      const childrenByParentId = treePayload?.childrenByParentId ?? {};
      for (const [parentKey, response] of Object.entries(childrenByParentId)) {
        const parentId = parentKey === FormPrehydrateRootKey ? "" : parentKey;
        const cacheKey = `${String(vocabRef).trim()}::${parentId}`;
        this.childrenCache.set(cacheKey, Promise.resolve(response as SharedVocabTreeChildrenResponse as VocabTreeChildrenResponse));
      }
    }
  }

  private async fetchChildren(vocabRef: string, parentId: string): Promise<VocabTreeChildrenResponse> {
    await this.waitForInit();

    const url = `${this.brandingAndPortalUrl}/vocab/${encodeURIComponent(vocabRef)}/children`;
    const params: Record<string, string> = {};
    if (parentId) {
      params["parentId"] = parentId;
    }

    const response = await firstValueFrom(
      this.http.get<ApiResponse>(url, {
        responseType: "json",
        observe: "body",
        context: this.httpContext,
        params
      })
    );

    if (Array.isArray(response)) {
      return {
        data: response,
        meta: {
          vocabularyId: vocabRef,
          parentId: parentId || null,
          total: response.length
        }
      };
    }

    if (Array.isArray((response as VocabTreeChildrenResponse).data) && (response as VocabTreeChildrenResponse).meta) {
      return response as VocabTreeChildrenResponse;
    }

    const wrapped = response as WrappedResponse;
    if (Array.isArray(wrapped?.data) && wrapped.meta) {
      return { data: wrapped.data, meta: wrapped.meta };
    }

    throw new Error("Unexpected response from vocabulary children endpoint");
  }
}
