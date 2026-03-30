import { APP_BASE_HREF } from "@angular/common";
import { HttpClientTestingModule, HttpTestingController } from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { ConfigService } from "./config.service";
import { getStubConfigService } from "./helper.spec";
import { LoggerService } from "./logger.service";
import { RecordService } from "./record.service";
import { UtilityService } from "./utility.service";

describe("RecordService", () => {
  let httpTestingController: HttpTestingController;
  let recordService: RecordService;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        {
          provide: APP_BASE_HREF,
          useValue: "base"
        },
        {
          provide: ConfigService,
          useValue: getStubConfigService()
        },
        LoggerService,
        UtilityService,
        RecordService
      ]
    });

    httpTestingController = TestBed.inject(HttpTestingController);
    recordService = TestBed.inject(RecordService);

    await recordService.waitForInit();
  });

  afterEach(() => {
    httpTestingController.verify();
  });

  it("unwraps attachment responses from the backend data envelope", async () => {
    const attachmentsPromise = recordService.getAttachments("oid-123");

    const request = httpTestingController.expectOne(`${recordService.brandingAndPortalUrl}/record/oid-123/attachments`);
    expect(request.request.method).toBe("GET");
    request.flush({
      data: [
        { label: "rdmp-pdf-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-1.pdf", dateUpdated: "2024-03-01T09:00:00Z" }
      ]
    });

    await expectAsync(attachmentsPromise).toBeResolvedTo([
      { label: "rdmp-pdf-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-1.pdf", dateUpdated: "2024-03-01T09:00:00Z" }
    ]);
  });

  it("accepts attachment responses returned as a raw array", async () => {
    const attachmentsPromise = recordService.getAttachments("oid-456");

    const request = httpTestingController.expectOne(`${recordService.brandingAndPortalUrl}/record/oid-456/attachments`);
    expect(request.request.method).toBe("GET");
    request.flush([
      { label: "rdmp-pdf-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb-2.pdf", dateUpdated: "2024-03-02T09:00:00Z" }
    ]);

    await expectAsync(attachmentsPromise).toBeResolvedTo([
      { label: "rdmp-pdf-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb-2.pdf", dateUpdated: "2024-03-02T09:00:00Z" }
    ]);
  });
});
