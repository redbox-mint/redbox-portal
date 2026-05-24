import { Injectable, Injector, inject } from "@angular/core";
import { cloneDeep as _cloneDeep } from "lodash-es";
import { RecordService } from "@researchdatabox/portal-ng-common";
import { FormPrehydratePayload, FormPrehydrateRecordMetadataItem } from "@researchdatabox/sails-ng-common";

@Injectable({ providedIn: "root" })
export class RecordMetadataDisplayDataService {
  private readonly cache = new Map<string, FormPrehydrateRecordMetadataItem>();
  private readonly inFlight = new Map<string, Promise<FormPrehydrateRecordMetadataItem>>();
  private readonly injector = inject(Injector);

  public seedFromPayload(prehydrate?: FormPrehydratePayload): void {
    const recordMetadata = prehydrate?.recordMetadata ?? {};
    for (const [rawOid, item] of Object.entries(recordMetadata)) {
      const oid = String(rawOid ?? "").trim();
      if (!oid || !this.isValidRecordMetadataItem(item, oid)) {
        continue;
      }
      if (item.error === true) {
        this.cache.set(oid, { oid, error: true });
        continue;
      }
      this.cache.set(oid, {
        oid,
        data: this.cloneData(item.data),
      });
    }
  }

  public async getRecordMetadata(oid: string): Promise<FormPrehydrateRecordMetadataItem> {
    const trimmedOid = String(oid ?? "").trim();
    if (!trimmedOid) {
      throw new Error("oid is required");
    }

    const cached = this.cache.get(trimmedOid);
    if (cached) {
      return this.cloneItem(cached);
    }

    const existing = this.inFlight.get(trimmedOid);
    if (existing) {
      return existing;
    }

    const pending = this.fetchRecordMetadata(trimmedOid)
      .finally(() => {
        this.inFlight.delete(trimmedOid);
      });
    this.inFlight.set(trimmedOid, pending);
    return pending;
  }

  private async fetchRecordMetadata(oid: string): Promise<FormPrehydrateRecordMetadataItem> {
    try {
      const recordService = this.getRecordService();
      await recordService.waitForInit();
      const response = await recordService.getRecordMeta(oid);
      const normalized = this.normalizeLiveResponse(oid, response);
      this.cache.set(oid, normalized);
      return this.cloneItem(normalized);
    } catch (error) {
      throw error;
    }
  }

  private normalizeLiveResponse(oid: string, response: unknown): FormPrehydrateRecordMetadataItem {
    if (!response || typeof response !== "object" || Array.isArray(response)) {
      return { oid, data: {} };
    }

    const candidate = response as { data?: unknown };
    const data = candidate.data && typeof candidate.data === "object" && !Array.isArray(candidate.data)
      ? candidate.data as Record<string, unknown>
      : response as Record<string, unknown>;

    return {
      oid,
      data: this.cloneData(data),
    };
  }

  private isValidRecordMetadataItem(item: unknown, expectedOid: string): item is FormPrehydrateRecordMetadataItem {
    if (!item || typeof item !== "object") {
      return false;
    }
    const candidate = item as Partial<FormPrehydrateRecordMetadataItem>;
    return String(candidate.oid ?? "").trim() === expectedOid;
  }

  private cloneItem(item: FormPrehydrateRecordMetadataItem): FormPrehydrateRecordMetadataItem {
    return item.error === true
      ? { oid: item.oid, error: true }
      : { oid: item.oid, data: this.cloneData(item.data) };
  }

  private cloneData(data: unknown): Record<string, unknown> {
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return {};
    }
    return _cloneDeep(data as Record<string, unknown>);
  }

  private getRecordService(): RecordService {
    const recordService = this.injector.get(RecordService, null);
    if (!recordService) {
      throw new Error("RecordService is required for live record metadata lookups");
    }
    return recordService;
  }
}
