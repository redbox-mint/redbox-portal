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

  it("unwraps record audit tab responses", async () => {
    const auditPromise = recordService.getRecordAuditTab("oid-789");

    const request = httpTestingController.expectOne(`${recordService.brandingAndPortalUrl}/record/viewAudit/oid-789/audit`);
    expect(request.request.method).toBe("GET");
    request.flush({
      data: {
        summary: { returnedCount: 1 },
        rawAuditUrl: "/default/rdmp/api/records/audit/oid-789",
        records: [{ id: "audit-1", action: "updated" }]
      }
    });

    await expectAsync(auditPromise).toBeResolvedTo({
      summary: { returnedCount: 1 },
      rawAuditUrl: "/default/rdmp/api/records/audit/oid-789",
      records: [{ id: "audit-1", action: "updated" }]
    } as any);
  });

  it("accepts record audit tab responses returned without the data envelope", async () => {
    const auditPromise = recordService.getRecordAuditTab("oid-790");

    const request = httpTestingController.expectOne(`${recordService.brandingAndPortalUrl}/record/viewAudit/oid-790/audit`);
    expect(request.request.method).toBe("GET");
    request.flush({
      summary: { returnedCount: 1 },
      rawAuditUrl: "/default/rdmp/api/records/audit/oid-790",
      records: [{ id: "audit-2", action: "created" }]
    });

    await expectAsync(auditPromise).toBeResolvedTo({
      summary: { returnedCount: 1 },
      rawAuditUrl: "/default/rdmp/api/records/audit/oid-790",
      records: [{ id: "audit-2", action: "created" }]
    } as any);
  });

  it("includes filter query parameters for record audit requests", async () => {
    const auditPromise = recordService.getRecordAuditTab("oid-791", {
      dateFrom: "2026-03-01",
      dateTo: "2026-03-31",
      action: "updated",
      workflowState: "Draft"
    });

    const request = httpTestingController.expectOne(req =>
      req.url === `${recordService.brandingAndPortalUrl}/record/viewAudit/oid-791/audit` &&
      req.params.get("dateFrom") === "2026-03-01" &&
      req.params.get("dateTo") === "2026-03-31" &&
      req.params.get("action") === "updated" &&
      req.params.get("workflowState") === "Draft"
    );
    expect(request.request.method).toBe("GET");
    request.flush({
      data: {
        summary: { returnedCount: 0 },
        rawAuditUrl: "/default/rdmp/api/records/audit/oid-791",
        records: []
      }
    });

    await expectAsync(auditPromise).toBeResolvedTo({
      summary: { returnedCount: 0 },
      rawAuditUrl: "/default/rdmp/api/records/audit/oid-791",
      records: []
    } as any);
  });

  it("unwraps record permissions responses", async () => {
    const permissionsPromise = recordService.getRecordPermissionsTab("oid-321");

    const request = httpTestingController.expectOne(`${recordService.brandingAndPortalUrl}/record/viewAudit/oid-321/permissions`);
    expect(request.request.method).toBe("GET");
    request.flush({
      data: {
        edit: [{ username: "editor", name: "Editor", email: "editor@example.com" }],
        view: [],
        editPending: ["pending-editor"],
        viewPending: [],
        editRoles: ["Admin"],
        viewRoles: ["Researcher"]
      }
    });

    await expectAsync(permissionsPromise).toBeResolvedTo({
      edit: [{ username: "editor", name: "Editor", email: "editor@example.com" }],
      view: [],
      editPending: ["pending-editor"],
      viewPending: [],
      editRoles: ["Admin"],
      viewRoles: ["Researcher"]
    });
  });

  it("accepts record permissions responses returned without the data envelope", async () => {
    const permissionsPromise = recordService.getRecordPermissionsTab("oid-322");

    const request = httpTestingController.expectOne(`${recordService.brandingAndPortalUrl}/record/viewAudit/oid-322/permissions`);
    expect(request.request.method).toBe("GET");
    request.flush({
      edit: [{ username: "editor", name: "Editor", email: "editor@example.com" }],
      view: [],
      editPending: ["pending-editor"],
      viewPending: [],
      editRoles: ["Admin"],
      viewRoles: ["Researcher"]
    });

    await expectAsync(permissionsPromise).toBeResolvedTo({
      edit: [{ username: "editor", name: "Editor", email: "editor@example.com" }],
      view: [],
      editPending: ["pending-editor"],
      viewPending: [],
      editRoles: ["Admin"],
      viewRoles: ["Researcher"]
    });
  });

  it("includes paging query parameters for integration audit requests", async () => {
    const integrationPromise = recordService.getRecordIntegrationAuditTab("oid-654", {
      page: 2,
      pageSize: 15,
      status: "success",
      integrationName: "figshare",
      dateFrom: "2026-01-01",
      dateTo: "2026-01-31"
    });

    const request = httpTestingController.expectOne(req =>
      req.url === `${recordService.brandingAndPortalUrl}/record/viewAudit/oid-654/integration-audit` &&
      req.params.get("page") === "2" &&
      req.params.get("pageSize") === "15" &&
      req.params.get("status") === "success" &&
      req.params.get("integrationName") === "figshare" &&
      req.params.get("dateFrom") === "2026-01-01" &&
      req.params.get("dateTo") === "2026-01-31"
    );
    expect(request.request.method).toBe("GET");
    request.flush({
      data: {
        summary: { numFound: 3, page: 2, pageSize: 15, totalPages: 1 },
        records: [{
          id: "trace-1",
          traceId: "trace-1",
          startedAt: "2026-01-01T00:00:00Z",
          status: "success",
          actions: ["publish"],
          eventCount: 1,
          events: [{ id: "integration-1", redboxOid: "oid-654", startedAt: "2026-01-01T00:00:00Z", status: "success", integrationAction: "publish", traceId: "trace-1", spanId: "span-1", depth: 0, hasChildren: false }]
        }]
      }
    });

    await expectAsync(integrationPromise).toBeResolvedTo({
      summary: { numFound: 3, page: 2, pageSize: 15, totalPages: 1 },
      records: [{
        id: "trace-1",
        traceId: "trace-1",
        startedAt: "2026-01-01T00:00:00Z",
        status: "success",
        actions: ["publish"],
        eventCount: 1,
        events: [{ id: "integration-1", redboxOid: "oid-654", startedAt: "2026-01-01T00:00:00Z", status: "success", integrationAction: "publish", traceId: "trace-1", spanId: "span-1", depth: 0, hasChildren: false }]
      }]
    } as any);
  });

  it("accepts integration audit responses returned without the data envelope", async () => {
    const integrationPromise = recordService.getRecordIntegrationAuditTab("oid-655");

    const request = httpTestingController.expectOne(req =>
      req.url === `${recordService.brandingAndPortalUrl}/record/viewAudit/oid-655/integration-audit`
    );
    expect(request.request.method).toBe("GET");
    request.flush({
      summary: { numFound: 1, page: 1, pageSize: 20, totalPages: 1 },
      records: [{
        id: "trace-2",
        traceId: "trace-2",
        startedAt: "2026-01-01T00:00:00Z",
        status: "success",
        actions: ["publish"],
        eventCount: 1,
        events: [{ id: "integration-2", redboxOid: "oid-655", startedAt: "2026-01-01T00:00:00Z", status: "success", integrationAction: "publish", traceId: "trace-2", spanId: "span-2", depth: 0, hasChildren: false }]
      }]
    });

    await expectAsync(integrationPromise).toBeResolvedTo({
      summary: { numFound: 1, page: 1, pageSize: 20, totalPages: 1 },
      records: [{
        id: "trace-2",
        traceId: "trace-2",
        startedAt: "2026-01-01T00:00:00Z",
        status: "success",
        actions: ["publish"],
        eventCount: 1,
        events: [{ id: "integration-2", redboxOid: "oid-655", startedAt: "2026-01-01T00:00:00Z", status: "success", integrationAction: "publish", traceId: "trace-2", spanId: "span-2", depth: 0, hasChildren: false }]
      }]
    } as any);
  });
});
