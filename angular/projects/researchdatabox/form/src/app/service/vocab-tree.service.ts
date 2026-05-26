import { APP_BASE_HREF } from "@angular/common";
import { HttpClient } from "@angular/common/http";
import { Inject, Injectable } from "@angular/core";
import { firstValueFrom } from "rxjs";
import { ConfigService, HttpClientService, UtilityService } from "@researchdatabox/portal-ng-common";
import { FormPrehydratePayload, FormPrehydrateRootKey } from "@researchdatabox/sails-ng-common";

export interface VocabTreeApiNode {
  id: string;
  label: string;
  value: string;
  notation?: string;
  parent?: string | null;
  hasChildren: boolean;
  disabled?: boolean;
  children?: VocabTreeApiNode[];
}

export interface VocabTreeChildrenResponse {
  data: VocabTreeApiNode[];
  partial?: boolean;
  meta: {
    vocabularyId: string;
    parentId: string | null;
    total: number;
  };
}

export interface VocabTreeExpandPathResponse {
  data: Record<string, VocabTreeApiNode[]>;
  meta: {
    vocabularyId: string;
    notations: string[];
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
      const response = await cached;
      if (!response.partial) {
        return response;
      }
      this.clearChildrenCacheEntry(trimmedVocabRef, trimmedParentId);
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

  public clearChildrenCacheEntry(vocabRef: string, parentId?: string): void {
    const trimmedVocabRef = String(vocabRef ?? "").trim();
    if (!trimmedVocabRef) {
      return;
    }
    const trimmedParentId = String(parentId ?? "").trim();
    this.childrenCache.delete(`${trimmedVocabRef}::${trimmedParentId}`);
  }

  public async expandPath(vocabRef: string, notations: string[]): Promise<VocabTreeExpandPathResponse> {
    const trimmedVocabRef = String(vocabRef ?? "").trim();
    if (!trimmedVocabRef) {
      throw new Error("vocabRef is required");
    }

    const normalizedNotations = Array.from(
      new Set(
        (notations ?? [])
          .map((notation) => String(notation ?? "").trim())
          .filter((notation) => notation.length > 0)
      )
    );
    if (normalizedNotations.length === 0) {
      throw new Error("notation is required");
    }

    await this.waitForInit();

    const url = `${this.brandingAndPortalUrl}/vocab/${encodeURIComponent(trimmedVocabRef)}/expandPath`;
    const response = await firstValueFrom(
      this.http.get<unknown>(url, {
        responseType: "json",
        observe: "body",
        context: this.httpContext,
        params: {
          notation: normalizedNotations.join(",")
        }
      })
    );

    const parsed = this.parseExpandPathResponse(response, trimmedVocabRef);
    this.seedExpandPathCache(trimmedVocabRef, parsed.data);
    return parsed;
  }

  public seedFromPayload(prehydrate?: FormPrehydratePayload): void {
    const vocabTrees = prehydrate?.vocabTrees ?? {};
    for (const [vocabRef, treePayload] of Object.entries(vocabTrees)) {
      const childrenByParentId = treePayload?.childrenByParentId ?? {};
      for (const [parentKey, response] of Object.entries(childrenByParentId)) {
        const parentId = parentKey === FormPrehydrateRootKey ? "" : parentKey;
        const cacheKey = `${String(vocabRef).trim()}::${parentId}`;
        if (this.isValidVocabTreeChildrenResponse(response)) {
          this.childrenCache.set(cacheKey, Promise.resolve(response));
        } else {
          console.warn(
            `Skipping invalid prehydrate vocab tree response for vocabRef=${String(vocabRef)} parentId=${String(parentKey)} (${FormPrehydrateRootKey})`
          );
        }
      }
    }
  }

  private parseExpandPathResponse(response: unknown, vocabRef: string): VocabTreeExpandPathResponse {
    if (!response || typeof response !== "object") {
      throw new Error("Unexpected response from vocabulary expandPath endpoint");
    }

    const candidate = response as Partial<VocabTreeExpandPathResponse> & {
      data?: unknown;
      meta?: { notations?: unknown; vocabularyId?: unknown };
    };

    const rawData = candidate.data ?? response;
    if (!rawData || typeof rawData !== "object" || Array.isArray(rawData)) {
      throw new Error("Unexpected response from vocabulary expandPath endpoint");
    }

    const data: Record<string, VocabTreeApiNode[]> = {};
    for (const [notation, nodes] of Object.entries(rawData as Record<string, unknown>)) {
      if (!Array.isArray(nodes)) {
        continue;
      }
      data[notation] = nodes
        .map((node) => this.normalizeNode(node))
        .filter((node): node is VocabTreeApiNode => !!node);
    }

    const metaNotations = Array.isArray(candidate.meta?.notations)
      ? candidate.meta!.notations.map((notation) => String(notation ?? "").trim()).filter((notation) => notation.length > 0)
      : Object.keys(data);
    const vocabularyId = typeof candidate.meta?.vocabularyId === "string" && candidate.meta.vocabularyId.trim()
      ? candidate.meta.vocabularyId.trim()
      : vocabRef;

    return {
      data,
      meta: {
        vocabularyId,
        notations: metaNotations
      }
    };
  }

  private normalizeNode(node: unknown): VocabTreeApiNode | null {
    if (!node || typeof node !== "object") {
      return null;
    }
    const candidate = node as Partial<VocabTreeApiNode>;
    const id = String(candidate.id ?? "").trim();
    if (!id) {
      return null;
    }
    const value = String(candidate.value ?? "").trim();
    const notation = value || String(candidate.notation ?? "").trim() || undefined;
    const children = Array.isArray(candidate.children)
      ? candidate.children.map((child) => this.normalizeNode(child)).filter((child): child is VocabTreeApiNode => !!child)
      : undefined;
    return {
      id,
      label: String(candidate.label ?? ""),
      value,
      notation,
      parent: candidate.parent === undefined || candidate.parent === null ? null : String(candidate.parent).trim() || null,
      hasChildren: candidate.hasChildren === true,
      disabled: candidate.disabled === true,
      children
    };
  }

  private seedExpandPathCache(vocabRef: string, chains: Record<string, VocabTreeApiNode[]>): void {
    const trimmedVocabRef = String(vocabRef ?? "").trim();
    if (!trimmedVocabRef) {
      return;
    }

    for (const chain of Object.values(chains)) {
      if (!Array.isArray(chain) || chain.length === 0) {
        continue;
      }
      let parentKey = "";
      for (const node of chain) {
        const cacheKey = `${trimmedVocabRef}::${parentKey}`;
        const existing = this.childrenCache.get(cacheKey);
        if (!existing) {
          const children = Array.isArray(node.children) ? node.children : [];
          const response: VocabTreeChildrenResponse = {
            data: children.length > 0 ? children : [node],
            partial: true,
            meta: {
              vocabularyId: trimmedVocabRef,
              parentId: parentKey || null,
              total: children.length > 0 ? children.length : 1
            }
          };
          this.childrenCache.set(cacheKey, Promise.resolve(response));
        }
        parentKey = node.id;
      }
    }
  }

  private isValidVocabTreeChildrenResponse(response: unknown): response is VocabTreeChildrenResponse {
    if (!response || typeof response !== "object") {
      return false;
    }
    const candidate = response as Partial<VocabTreeChildrenResponse>;
    if (candidate.partial !== undefined && typeof candidate.partial !== "boolean") {
      return false;
    }
    return Array.isArray(candidate.data)
      && !!candidate.meta
      && typeof candidate.meta.vocabularyId === "string"
      && ("parentId" in candidate.meta)
      && typeof candidate.meta.total === "number";
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

    if (this.isValidVocabTreeChildrenResponse(response)) {
      return response;
    }

    const wrapped = response as WrappedResponse;
    if (Array.isArray(wrapped?.data) && wrapped.meta) {
      return { data: wrapped.data, meta: wrapped.meta };
    }

    throw new Error("Unexpected response from vocabulary children endpoint");
  }
}
