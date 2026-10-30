import { CommonModule } from '@angular/common';
import { Directive, Input, Pipe, PipeTransform } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { ConfigService, LoggerService, RecordService, TranslationService, getStubConfigService, getStubTranslationService } from '@researchdatabox/portal-ng-common';
import { ExportJobDto } from '@researchdatabox/sails-ng-common';
import { ExportComponent } from './export.component';
import { ExportService } from './export.service';

@Pipe({ name: 'i18next', standalone: false })
class MockTranslationPipe implements PipeTransform {
  transform(key: string): string { return key; }
}

@Directive({ selector: '[bsDatepicker]', standalone: false })
class MockDatepickerDirective {
  @Input() bsConfig: unknown;
}

function job(overrides: Partial<ExportJobDto> = {}): ExportJobDto {
  return {
    id: 'export-1', recordType: 'rdmp', format: 'csv', modifiedBefore: null, modifiedAfter: null,
    status: 'queued', createdAt: '2026-10-30T00:00:00.000Z', startedAt: null, completedAt: null,
    expiresAt: null, filename: 'Plan - Exported Records.csv', byteLength: null, downloadUrl: null,
    errorCode: null, errorMessage: null, ...overrides
  };
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(complete => { resolve = complete; });
  return { promise, resolve };
}

describe('ExportComponent', () => {
  let fixture: ComponentFixture<ExportComponent>;
  let component: ExportComponent;
  let service: jasmine.SpyObj<ExportService>;
  const baseUrl = '/context/default/rdmp';
  let configService: ReturnType<typeof getStubConfigService> & { refreshConfig: jasmine.Spy };
  let records: { brandingAndPortalUrl: string; waitForInit: () => Promise<void>; getAllTypes: jasmine.Spy };

  beforeEach(async () => {
    configService = { ...getStubConfigService(), refreshConfig: jasmine.createSpy('refreshConfig').and.resolveTo({}) };
    records = {
      brandingAndPortalUrl: baseUrl,
      waitForInit: async () => undefined,
      getAllTypes: jasmine.createSpy('getAllTypes').and.resolveTo([{ name: 'rdmp' }, { name: 'dataRecord' }])
    };
    service = jasmine.createSpyObj<ExportService>('ExportService', ['waitForInit', 'list', 'create', 'get', 'remove', 'downloadUrl']);
    service.waitForInit.and.resolveTo(service);
    service.list.and.resolveTo([]);
    service.create.and.resolveTo(job());
    service.remove.and.resolveTo();
    service.downloadUrl.and.callFake(item => item.status === 'ready' && item.downloadUrl && Date.parse(item.expiresAt ?? '') > Date.now()
      ? `${baseUrl}/export/jobs/${encodeURIComponent(item.id)}/download` : null);
    await TestBed.configureTestingModule({
      declarations: [ExportComponent, MockTranslationPipe, MockDatepickerDirective],
      imports: [CommonModule, FormsModule],
      providers: [
        { provide: ConfigService, useValue: configService },
        { provide: RecordService, useValue: records },
        { provide: TranslationService, useValue: getStubTranslationService() },
        { provide: LoggerService, useValue: { debug: () => undefined } },
        { provide: ExportService, useValue: service }
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(ExportComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => fixture.destroy());

  function initialize(): void {
    fixture.detectChanges();
    flushMicrotasks();
    fixture.detectChanges();
  }

  it('restores recent jobs and prepares CSV instead of opening a download request', fakeAsync(() => {
    service.list.and.resolveTo([job({ id: 'older', status: 'failed' })]);
    initialize();
    component.window = { open: jasmine.createSpy('open') };
    void component.download();
    flushMicrotasks();
    fixture.detectChanges();
    expect(service.create).toHaveBeenCalledWith({ format: 'csv', recType: 'rdmp' });
    expect(component.jobs.map(item => item.id)).toEqual(['export-1', 'older']);
    expect(component.window.open).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('export-status-queued');
    fixture.destroy();
  }));

  it('normalizes inclusive day bounds without changing the date picker models', fakeAsync(() => {
    initialize();
    const after = new Date(2026, 0, 20, 12, 15, 30);
    const before = new Date(2026, 0, 21, 9, 20, 10);
    const expectedAfter = new Date(after); expectedAfter.setHours(0, 0, 0, 0);
    const expectedBefore = new Date(before); expectedBefore.setHours(23, 59, 59, 999);
    component.modAfter = after;
    component.modBefore = before;
    void component.download(); flushMicrotasks();
    expect(service.create).toHaveBeenCalledWith({ format: 'csv', recType: 'rdmp', after: expectedAfter.toISOString(), before: expectedBefore.toISOString() });
    expect(component.modAfter).toBe(after);
    expect(component.modBefore).toBe(before);
    expect(after.getHours()).toBe(12);
    expect(before.getHours()).toBe(9);
    fixture.destroy();
  }));

  it('rejects invalid and reversed bounds before submitting or opening a window', fakeAsync(() => {
    initialize();
    component.modAfter = new Date(NaN);
    void component.download(); flushMicrotasks();
    expect(component.submissionErrorKey).toBe('export-invalid-date');
    component.modAfter = '31/02/2026';
    void component.download(); flushMicrotasks();
    expect(component.submissionErrorKey).toBe('export-invalid-date');
    component.modAfter = new Date(2026, 5, 2);
    component.modBefore = new Date(2026, 5, 1);
    void component.download(); flushMicrotasks();
    expect(component.submissionErrorKey).toBe('export-invalid-range');
    expect(service.create).not.toHaveBeenCalled();
    fixture.destroy();
  }));

  it('preserves direct JSON downloads and encodes query values', fakeAsync(() => {
    initialize();
    const open = jasmine.createSpy('open');
    component.window = { open };
    component.setExportFormat('json');
    component.record_type = 'record & + # Ω';
    component.modAfter = new Date(2026, 0, 20);
    void component.download(); flushMicrotasks();
    const url = new URL(open.calls.mostRecent().args[0], 'https://portal.example');
    expect(url.pathname).toBe(`${baseUrl}/export/record/download/json`);
    expect(url.searchParams.get('recType')).toBe('record & + # Ω');
    expect(url.searchParams.get('after')).toBe(new Date(2026, 0, 20).toISOString());
    expect(url.searchParams.get('before')).toBe('');
    expect(open.calls.mostRecent().args[1]).toBe('_blank');
    expect(service.create).not.toHaveBeenCalled();
    fixture.destroy();
  }));

  it('prevents duplicate preparation while acceptance is pending', fakeAsync(() => {
    initialize();
    const accepted = deferred<ExportJobDto>();
    service.create.and.returnValue(accepted.promise);
    void component.download(); flushMicrotasks();
    void component.download(); flushMicrotasks();
    fixture.detectChanges();
    expect(component.createPending).toBeTrue();
    expect(service.create).toHaveBeenCalledTimes(1);
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button.btn-primary');
    expect(button.disabled).toBeTrue();
    accepted.resolve(job()); flushMicrotasks();
    expect(component.createPending).toBeFalse();
    fixture.destroy();
  }));

  it('polls active work without overlapping reads and stops when it becomes terminal', fakeAsync(() => {
    service.list.and.resolveTo([job()]);
    initialize();
    const pending = deferred<ExportJobDto[]>();
    service.list.and.returnValue(pending.promise);
    tick(3000);
    expect(service.list).toHaveBeenCalledTimes(2);
    tick(15000);
    void component.refreshJobs(); flushMicrotasks();
    expect(service.list).toHaveBeenCalledTimes(2);
    pending.resolve([job({ status: 'failed' })]); flushMicrotasks();
    tick(15000);
    expect(service.list).toHaveBeenCalledTimes(2);
    fixture.destroy();
  }));

  it('shows a normal ready-file link and wakes at expiry to remove it', fakeAsync(() => {
    const expiry = new Date(Date.now() + 10000).toISOString();
    service.list.and.resolveTo([job({ status: 'ready', downloadUrl: 'export/jobs/export-1/download', expiresAt: expiry })]);
    initialize();
    const link: HTMLAnchorElement = fixture.nativeElement.querySelector('a[download]');
    expect(link.getAttribute('href')).toBe(`${baseUrl}/export/jobs/export-1/download`);
    expect(link.getAttribute('download')).toBe('Plan - Exported Records.csv');
    tick(3000);
    expect(service.list).toHaveBeenCalledTimes(1);
    service.list.and.resolveTo([job({ status: 'expired', expiresAt: expiry })]);
    tick(7001); flushMicrotasks(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('a[download]')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('export-status-expired');
    fixture.destroy();
  }));

  it('continues status polling after a temporary failure without creating another export', fakeAsync(() => {
    service.list.and.resolveTo([job({ status: 'running' })]);
    initialize();
    service.list.and.rejectWith({ status: 503 });
    tick(3000); flushMicrotasks();
    expect(component.jobsErrorKey).toBe('export-load-error');
    expect(component.jobs[0].status).toBe('running');
    service.list.and.resolveTo([job({ status: 'failed' })]);
    tick(3000); flushMicrotasks();
    expect(component.jobsErrorKey).toBe('');
    expect(component.jobs[0].status).toBe('failed');
    expect(service.create).not.toHaveBeenCalled();
    fixture.destroy();
  }));

  it('stops automatic polling after access is denied and allows explicit refresh recovery', fakeAsync(() => {
    service.list.and.resolveTo([job()]);
    initialize();
    service.list.and.rejectWith({ status: 403 });
    tick(3000); flushMicrotasks();
    expect(component.jobsErrorKey).toBe('export-session-error');
    tick(9000);
    expect(service.list).toHaveBeenCalledTimes(2);
    service.list.and.resolveTo([job({ status: 'failed' })]);
    void component.refreshJobs(); flushMicrotasks();
    expect(component.jobsErrorKey).toBe('');
    expect(service.list).toHaveBeenCalledTimes(3);
    fixture.destroy();
  }));

  it('retries a failed export using its original options rather than the current form', fakeAsync(() => {
    initialize();
    component.record_type = 'dataRecord';
    component.modBefore = new Date(2026, 5, 1);
    void component.prepareAgain(job({ status: 'failed', modifiedAfter: '2026-01-01T00:00:00.000Z' }));
    flushMicrotasks();
    expect(service.create).toHaveBeenCalledWith({ format: 'csv', recType: 'rdmp', after: '2026-01-01T00:00:00.000Z' });
    fixture.destroy();
  }));

  it('warns about an ambiguous submission failure and recovers the accepted job by refreshing', fakeAsync(() => {
    initialize();
    service.create.and.rejectWith({ status: 0 });
    void component.download(); flushMicrotasks();
    expect(component.submissionErrorKey).toBe('export-submit-error');
    expect(component.createPending).toBeFalse();
    service.list.and.resolveTo([job({ status: 'failed' })]);
    void component.refreshJobs(); flushMicrotasks();
    expect(component.jobs[0].id).toBe('export-1');
    expect(service.create).toHaveBeenCalledTimes(1);
    fixture.destroy();
  }));

  it('does not let an older status read overwrite a newly accepted export', fakeAsync(() => {
    initialize();
    const olderRead = deferred<ExportJobDto[]>();
    service.list.and.returnValue(olderRead.promise);
    void component.refreshJobs();
    void component.download(); flushMicrotasks();
    expect(service.create).not.toHaveBeenCalled();
    olderRead.resolve([]); flushMicrotasks();
    expect(service.create).toHaveBeenCalledTimes(1);
    expect(component.jobs[0].id).toBe('export-1');
    fixture.destroy();
  }));

  it('offers deletion only for ready, failed and expired exports', fakeAsync(() => {
    const expiry = new Date(Date.now() + 10000).toISOString();
    service.list.and.resolveTo([
      job({ id: 'queued' }), job({ id: 'running', status: 'running' }),
      job({ id: 'ready', status: 'ready', expiresAt: expiry, downloadUrl: 'download' }),
      job({ id: 'failed', status: 'failed' }), job({ id: 'expired', status: 'expired' })
    ]);
    initialize();
    const rows: HTMLTableRowElement[] = Array.from(fixture.nativeElement.querySelectorAll('tbody tr'));
    expect(rows.map(row => !!row.querySelector('button.btn-outline-danger'))).toEqual([false, false, true, true, true]);
    void component.deleteJob(component.jobs[0]);
    void component.deleteJob(component.jobs[1]);
    flushMicrotasks();
    expect(service.remove).not.toHaveBeenCalled();
    fixture.destroy();
  }));

  it('disables conflicting actions while deleting and removes only the selected export', fakeAsync(() => {
    service.list.and.resolveTo([job({ status: 'ready', expiresAt: new Date(Date.now() + 10000).toISOString(), downloadUrl: 'download' }), job({ id: 'other', status: 'failed' })]);
    initialize();
    const deleted = deferred<void>();
    service.remove.and.returnValue(deleted.promise);
    const selected = component.jobs[0];
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button.btn-outline-danger');
    button.click(); flushMicrotasks(); fixture.detectChanges();
    expect(service.remove).toHaveBeenCalledOnceWith('export-1');
    expect(button.disabled).toBeTrue();
    expect(button.textContent).toContain('export-deleting');
    expect(fixture.nativeElement.querySelector('a[download]')).toBeNull();
    const prepare: HTMLButtonElement = fixture.nativeElement.querySelector('button.btn-primary');
    expect(prepare.disabled).toBeTrue();
    void component.deleteJob(selected);
    void component.deleteJob(component.jobs[1]);
    void component.download();
    void component.prepareAgain(component.jobs[1]);
    void component.refreshJobs();
    tick(15000); flushMicrotasks();
    expect(service.remove).toHaveBeenCalledTimes(1);
    expect(service.create).not.toHaveBeenCalled();
    expect(service.list).toHaveBeenCalledTimes(1);
    deleted.resolve(); flushMicrotasks(); fixture.detectChanges();
    expect(component.jobs.map(item => item.id)).toEqual(['other']);
    expect(component.deletePendingId).toBeNull();
    expect(prepare.disabled).toBeFalse();
    expect(fixture.nativeElement.textContent).not.toContain('export-deleting');
    fixture.destroy();
  }));

  it('keeps the export on deletion failure, shows recovery and allows retry', fakeAsync(() => {
    service.list.and.resolveTo([job({ status: 'failed' })]);
    initialize();
    service.remove.and.rejectWith({ status: 503 });
    void component.deleteJob(component.jobs[0]); flushMicrotasks(); fixture.detectChanges();
    expect(component.jobs.length).toBe(1);
    expect(component.deletePendingId).toBeNull();
    expect(fixture.nativeElement.querySelector('.alert-danger').textContent).toContain('export-delete-error');
    service.remove.and.resolveTo();
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button.btn-outline-danger');
    expect(button.disabled).toBeFalse();
    button.click(); flushMicrotasks(); fixture.detectChanges();
    expect(component.jobs).toEqual([]);
    expect(component.deleteErrorKey).toBe('');
    expect(fixture.nativeElement.querySelector('.alert-danger')).toBeNull();
    fixture.destroy();
  }));

  it('shows the session recovery message when deletion is denied', fakeAsync(() => {
    service.list.and.resolveTo([job({ status: 'failed' })]);
    initialize();
    service.remove.and.rejectWith({ status: 403 });
    void component.deleteJob(component.jobs[0]); flushMicrotasks(); fixture.detectChanges();
    expect(component.deleteErrorKey).toBe('export-session-error');
    expect(component.jobs.length).toBe(1);
    fixture.destroy();
  }));

  it('finishes an older status read before deleting so it cannot restore the export', fakeAsync(() => {
    const selected = job({ status: 'failed' });
    service.list.and.resolveTo([selected]);
    initialize();
    const olderRead = deferred<ExportJobDto[]>();
    service.list.and.returnValue(olderRead.promise);
    void component.refreshJobs();
    void component.deleteJob(selected); flushMicrotasks();
    expect(service.remove).not.toHaveBeenCalled();
    olderRead.resolve([selected, job({ id: 'other', status: 'failed' })]); flushMicrotasks();
    expect(service.remove).toHaveBeenCalledOnceWith(selected.id);
    expect(component.jobs.map(item => item.id)).toEqual(['other']);
    fixture.destroy();
  }));

  it('does not delete after destruction while waiting for an older status read', fakeAsync(() => {
    const selected = job({ status: 'failed' });
    service.list.and.resolveTo([selected]);
    initialize();
    const olderRead = deferred<ExportJobDto[]>();
    service.list.and.returnValue(olderRead.promise);
    void component.refreshJobs();
    void component.deleteJob(selected); flushMicrotasks();
    fixture.destroy();
    olderRead.resolve([]); flushMicrotasks(); tick(15000);
    expect(service.remove).not.toHaveBeenCalled();
    expect(component.jobs).toEqual([selected]);
    expect(service.list).toHaveBeenCalledTimes(2);
  }));

  it('ignores a deletion response after destruction and schedules no more polling', fakeAsync(() => {
    const selected = job({ status: 'failed' });
    service.list.and.resolveTo([selected, job({ id: 'active' })]);
    initialize();
    const deleted = deferred<void>();
    service.remove.and.returnValue(deleted.promise);
    void component.deleteJob(selected); flushMicrotasks();
    expect(service.remove).toHaveBeenCalledTimes(1);
    fixture.destroy();
    deleted.resolve(); flushMicrotasks(); tick(15000);
    expect(component.jobs.map(item => item.id)).toEqual(['export-1', 'active']);
    expect(service.list).toHaveBeenCalledTimes(1);
  }));

  it('cancels timers and ignores an in-flight status response after destruction', fakeAsync(() => {
    service.list.and.resolveTo([job()]);
    initialize();
    const pending = deferred<ExportJobDto[]>();
    service.list.and.returnValue(pending.promise);
    tick(3000);
    fixture.destroy();
    pending.resolve([job({ status: 'failed' })]); flushMicrotasks();
    tick(9000);
    expect(component.jobs[0].status).toBe('queued');
    expect(service.list).toHaveBeenCalledTimes(2);
  }));

  it('keeps the initial load retry path when record types cannot be read', fakeAsync(() => {
    records.getAllTypes.and.rejectWith({ status: 403 });
    const waiting = expectAsync(component.waitForInit()).toBeRejected();
    fixture.detectChanges(); flushMicrotasks();
    void waiting;
    expect(component.loadPending).toBeFalse();
    expect(component.loadError).toContain('Sign in again');
    records.getAllTypes.and.resolveTo([{ name: 'rdmp' }]);
    void component.retryLoad(); flushMicrotasks();
    expect(component.loadError).toBe('');
    expect(configService.refreshConfig).toHaveBeenCalled();
    fixture.destroy();
  }));
  it('renders a status badge per job and shows the empty state without jobs', fakeAsync(() => {
    initialize();
    expect(fixture.nativeElement.querySelector('.ex-empty')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('table')).toBeNull();
    component.jobs = [job({ id: 'q' }), job({ id: 'f', status: 'failed' })];
    fixture.detectChanges();
    const badges: HTMLElement[] = Array.from(fixture.nativeElement.querySelectorAll('tbody .badge'));
    expect(badges.map(badge => badge.className)).toEqual([
      jasmine.stringContaining('bg-secondary-subtle'),
      jasmine.stringContaining('bg-danger-subtle')
    ]);
    expect(badges[0].querySelector('.fa-spin')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.ex-empty')).toBeNull();
    fixture.destroy();
  }));

  it('reports active jobs only while exports are queued or running', () => {
    component.jobs = [job({ status: 'ready' }), job({ id: 'x', status: 'failed' })];
    expect(component.hasActiveJobs()).toBeFalse();
    component.jobs = [job({ status: 'running' })];
    expect(component.hasActiveJobs()).toBeTrue();
  });

  it('formats prepared file sizes for display', () => {
    expect(component.formatSize(null)).toBe('');
    expect(component.formatSize(512)).toBe('512 B');
    expect(component.formatSize(1536)).toBe('1.5 KB');
    expect(component.formatSize(482113)).toBe('471 KB');
    expect(component.formatSize(3.4 * 1024 * 1024)).toBe('3.4 MB');
  });

  it('hides the format choice when only one format is configured', fakeAsync(() => {
    configService.getConfig = jasmine.createSpy('getConfig').and.resolveTo({ app: { export: { exportFormatTypes: [{ name: 'CSV', id: 'csv' }] } } });
    initialize();
    expect(fixture.nativeElement.querySelector('input[name="export-format-radio"]')).toBeNull();
    expect(component.getSelectedFormatName()).toBe('CSV');
    fixture.destroy();
  }));
  it('treats date fields cleared in the date picker as no date bound', fakeAsync(() => {
    initialize();
    component.modAfter = undefined;
    component.modBefore = undefined;
    void component.download(); flushMicrotasks();
    expect(component.submissionErrorKey).toBe('');
    expect(service.create).toHaveBeenCalledWith({ format: 'csv', recType: 'rdmp' });
    fixture.destroy();
  }));
});
