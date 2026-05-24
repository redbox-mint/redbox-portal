import { TestBed } from "@angular/core/testing";
import { RecordMetadataDisplayDataService } from "./record-metadata-display-data.service";
import { RecordService } from "@researchdatabox/portal-ng-common";

describe("RecordMetadataDisplayDataService", () => {
  let service: RecordMetadataDisplayDataService;
  let recordService: jasmine.SpyObj<RecordService>;

  beforeEach(() => {
    recordService = jasmine.createSpyObj<RecordService>("RecordService", ["waitForInit", "getRecordMeta"]);
    recordService.waitForInit.and.resolveTo(recordService);

    TestBed.configureTestingModule({
      providers: [
        RecordMetadataDisplayDataService,
        { provide: RecordService, useValue: recordService },
      ],
    });

    service = TestBed.inject(RecordMetadataDisplayDataService);
  });

  it("returns seeded metadata without calling live lookup", async () => {
    service.seedFromPayload({
      recordMetadata: {
        "oid-1": {
          oid: "oid-1",
          data: { title: "Seeded title" },
        },
      },
    });

    const result = await service.getRecordMetadata("oid-1");

    expect(result).toEqual({ oid: "oid-1", data: { title: "Seeded title" } });
    expect(recordService.waitForInit).not.toHaveBeenCalled();
    expect(recordService.getRecordMeta).not.toHaveBeenCalled();
  });

  it("returns seeded error entries without calling live lookup", async () => {
    service.seedFromPayload({
      recordMetadata: {
        "oid-1": {
          oid: "oid-1",
          error: true,
        },
      },
    });

    const result = await service.getRecordMetadata("oid-1");

    expect(result).toEqual({ oid: "oid-1", error: true });
    expect(recordService.getRecordMeta).not.toHaveBeenCalled();
  });

  it("falls back to RecordService.getRecordMeta when prehydrate is absent", async () => {
    recordService.getRecordMeta.and.resolveTo({ data: { title: "Live title" }, meta: { oid: "oid-live" } } as never);

    const result = await service.getRecordMetadata("oid-live");

    expect(recordService.waitForInit).toHaveBeenCalled();
    expect(recordService.getRecordMeta).toHaveBeenCalledWith("oid-live");
    expect(result).toEqual({ oid: "oid-live", data: { title: "Live title" } });
  });

  it("deduplicates concurrent live lookups", async () => {
    let resolveRequest!: (value: unknown) => void;
    recordService.getRecordMeta.and.returnValue(new Promise((resolve) => {
      resolveRequest = resolve;
    }) as Promise<any>);

    const p1 = service.getRecordMetadata("oid-live");
    const p2 = service.getRecordMetadata("oid-live");
    resolveRequest({ data: { title: "Live title" } });

    const [r1, r2] = await Promise.all([p1, p2]);

    expect(recordService.getRecordMeta).toHaveBeenCalledTimes(1);
    expect(r1).toEqual({ oid: "oid-live", data: { title: "Live title" } });
    expect(r2).toEqual({ oid: "oid-live", data: { title: "Live title" } });
  });

  it("does not cache live lookup failures permanently", async () => {
    recordService.getRecordMeta.and.rejectWith(new Error("boom"));

    await expectAsync(service.getRecordMetadata("oid-live")).toBeRejectedWithError("boom");

    recordService.getRecordMeta.and.resolveTo({ title: "Recovered" } as never);
    const result = await service.getRecordMetadata("oid-live");

    expect(recordService.getRecordMeta).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ oid: "oid-live", data: { title: "Recovered" } });
  });
});
