import { APP_BASE_HREF } from "@angular/common";
import { HttpClient } from "@angular/common/http";
import { Inject, Injectable } from "@angular/core";
import { firstValueFrom } from "rxjs";
import { ConfigService, HttpClientService, UtilityService } from "@researchdatabox/portal-ng-common";

export interface VocabTreeApiNode {
  id: string;
  label: string;
  value: string;
  notation?: string;
  parent?: string | null;
  hasChildren: boolean;
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
    await this.waitForInit();
    const trimmedVocabRef = String(vocabRef ?? "").trim();
    if (!trimmedVocabRef) {
      throw new Error("vocabRef is required");
    }

    const url = `${this.brandingAndPortalUrl}/vocab/${encodeURIComponent(trimmedVocabRef)}/children`;
    const params: Record<string, string> = {};
    const trimmedParentId = String(parentId ?? "").trim();
    if (trimmedParentId) {
      params["parentId"] = trimmedParentId;
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
          vocabularyId: trimmedVocabRef,
          parentId: trimmedParentId || null,
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
