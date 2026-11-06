import { Subject } from 'rxjs';
import { AdminDiscardDialogComponent, AdminCountPipe, AdminModalDirective } from '@researchdatabox/portal-ng-common';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { Pipe, PipeTransform } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { CdkTrapFocus, A11yModule } from '@angular/cdk/a11y';
import { FormsModule } from '@angular/forms';
import { LoggerService, TranslationService } from '@researchdatabox/portal-ng-common';
import { ReportConfigComponent } from './report-config.component';
import { ReportConfigService } from './report-config.service';

@Pipe({ name: 'i18next', standalone: false })
class MockI18NextPipe implements PipeTransform {
  transform(value: string): string {
    return value;
  }
}

describe('ReportConfigComponent', () => {
  let component: ReportConfigComponent;
  let fixture: ComponentFixture<ReportConfigComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ReportConfigComponent, MockI18NextPipe],
      imports: [AdminDiscardDialogComponent, AdminModalDirective, AdminCountPipe, FormsModule, HttpClientTestingModule, A11yModule],
      providers: [
        { provide: LoggerService, useValue: { error: () => undefined, warn: () => undefined } },
        { provide: TranslationService, useValue: { isInitializing: () => false, translationChanges$: new Subject<void>(), t: (key: string) => key, isReady: true, init: () => Promise.resolve(), waitForInit: () => Promise.resolve() } },
        {
          provide: ReportConfigService,
          useValue: {
            waitForInit: () => Promise.resolve(),
            list: () => Promise.resolve([
              { name: 'db', title: 'Database', reportSource: 'database', databaseQuery: { queryName: 'listRDMPRecords' }, readOnly: false, columns: [{ label: 'A', property: 'a' }], filter: [{ type: 'text', paramName: 'p', property: 'a', message: '' }], canEdit: true, canDelete: true, canPreview: true },
              { name: 'db2', title: 'Database 2', reportSource: 'database', databaseQuery: { queryName: 'listRDMPRecords' }, readOnly: false, columns: [], filter: [], canEdit: true, canDelete: true, canPreview: true },
              { name: 'solr', title: 'Solr', reportSource: 'solr', readOnly: true, columns: [], filter: [], canEdit: false, canDelete: false, canPreview: false }
            ]),
            listNamedQueries: () => Promise.resolve([{ name: 'listRDMPRecords' }]),
            preview: () => Promise.resolve({ total: 0 })
          }
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ReportConfigComponent);
    component = fixture.componentInstance;
  });

  for (const kind of ['filter', 'column'] as const) {
    it(`focuses the next ${kind}, then previous, then Add after row removal`, async () => {
      fixture.detectChanges(); await component.waitForInit(); fixture.detectChanges();
      component.editReport(component.reports[0]); fixture.detectChanges(); await fixture.whenStable();
      const add = () => kind === 'filter' ? component.addFilter() : component.addColumn();
      const remove = (index: number) => kind === 'filter' ? component.removeFilter(index) : component.removeColumn(index);
      const controls = () => [...fixture.nativeElement.querySelectorAll(`[data-report-row="${kind}"]`)].map((row: any) => row.querySelector('input,select'));
      add(); add(); fixture.detectChanges();
      remove(1); fixture.detectChanges(); await fixture.whenStable();
      await new Promise(resolve => setTimeout(resolve));
      expect(document.activeElement).toBe(controls()[1]);
      remove(1); fixture.detectChanges(); await fixture.whenStable();
      await new Promise(resolve => setTimeout(resolve));
      expect(document.activeElement).toBe(controls()[0]);
      remove(0); fixture.detectChanges(); await fixture.whenStable();
      await new Promise(resolve => setTimeout(resolve));
      expect(document.activeElement?.id).toBe(`report-add-${kind}`);
    });
  }

  it('starts deletion on Cancel and restores the overflow trigger after closing', async () => {
    fixture.detectChanges();
    await component.waitForInit(); await fixture.whenStable(); fixture.detectChanges();
    const menu: HTMLDetailsElement = fixture.nativeElement.querySelector('details.rb-admin-overflow');
    const trigger = menu.querySelector('summary')!;
    menu.open = true;
    const remove = menu.querySelector<HTMLButtonElement>('.btn-outline-danger')!;
    remove.focus(); remove.click(); fixture.detectChanges(); await fixture.whenStable();
    const cancel: HTMLButtonElement = fixture.nativeElement.querySelector('.modal-footer [cdkFocusInitial]');
    expect(document.activeElement).toBe(cancel);
    cancel.click(); fixture.detectChanges(); await fixture.whenStable();
    expect(document.activeElement).toBe(trigger);
    expect(menu.open).toBeFalse();
  });

  it('focuses the first editable field and isolates page chrome for create and edit', async () => {
    fixture.detectChanges(); await component.waitForInit(); fixture.detectChanges();
    const chrome = document.createElement('button'); document.body.append(chrome);
    try {
      component.createReport(); fixture.detectChanges(); await fixture.whenStable();
      expect(document.activeElement?.id).toBe('report-name');
      expect(chrome.inert).toBeTrue();
      component.cancelEdit(); fixture.detectChanges(); await fixture.whenStable();
      expect(chrome.inert).toBeFalse();
      component.editReport(component.reports[0]); fixture.detectChanges(); await fixture.whenStable();
      expect(document.activeElement?.id).toBe('report-title');
    } finally { fixture.destroy(); chrome.remove(); }
  });

  it('shows initialization failure with a retry control instead of an empty page', async () => {
    spyOn(TestBed.inject(ReportConfigService), 'list').and.rejectWith(new Error('offline'));
    fixture.detectChanges();
    await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Unable to load data');
    expect(fixture.nativeElement.querySelector('[role="alert"] button').textContent).toContain('admin-config-retry');
  });

  it('locks saving fields and dismissal, rejects duplicate saves and preserves a replacement editor', async () => {
    fixture.detectChanges(); await component.waitForInit(); fixture.detectChanges();
    const service = TestBed.inject(ReportConfigService);
    let finish!: () => void;
    const create = jasmine.createSpy().and.returnValue(new Promise<void>(resolve => finish = resolve));
    (service as any).create = create;
    component.createReport(); fixture.detectChanges(); await fixture.whenStable();
    const saving = component.saveReport(); fixture.detectChanges();
    const original = component.selectedReport;
    component.cancelEdit(); component.createReport();
    expect(component.selectedReport).toBe(original);
    expect(fixture.nativeElement.querySelector('#report-title').matches(':disabled')).toBeTrue();
    expect(fixture.nativeElement.querySelector('.report-config-modal .btn-close').disabled).toBeTrue();
    expect(fixture.nativeElement.querySelector('.modal-footer [role="status"]').textContent).toContain('admin-config-saving');
    await component.saveReport(); expect(create).toHaveBeenCalledTimes(1);
    const replacement = { ...original!, name: 'replacement' };
    component.selectedReport = replacement;
    finish(); await saving;
    expect(component.selectedReport).toBe(replacement);
    expect(component.isSaving).toBeFalse();
  });

  it('keeps a failed delete open, blocks dismissal and duplicate requests, then permits retry', async () => {
    await component.loadReports();
    const report = component.reports[0]; component.requestDelete(report);
    let fail!: (error: Error) => void;
    const remove = jasmine.createSpy().and.returnValue(new Promise<void>((resolve, reject) => fail = reject));
    (TestBed.inject(ReportConfigService) as any).delete = remove;
    const deleting = component.deleteReport(report);
    component.cancelDelete(); await component.deleteReport(report);
    expect(component.pendingDelete).toBe(report); expect(remove).toHaveBeenCalledTimes(1);
    fail(new Error('offline')); await deleting;
    expect(component.pendingDelete).toBe(report); expect(component.isDeleting).toBeFalse();
    expect(component.errorMessage).toBe('offline');
    remove.and.resolveTo({}); await component.deleteReport(report);
    expect(component.pendingDelete).toBeNull();
  });

  it('keeps the count announcement mounted at zero and focus in the search field', async () => {
    fixture.detectChanges(); await component.waitForInit(); fixture.detectChanges();
    const live = fixture.nativeElement.querySelector('.card-header [role="status"]');
    const input = fixture.nativeElement.querySelector('#report-search'); input.focus();
    input.value = 'unmatched'; input.dispatchEvent(new Event('input')); fixture.detectChanges(); await fixture.whenStable();
    expect(component.filteredReports.length).toBe(0);
    expect(fixture.nativeElement.querySelector('.card-header [role="status"]')).toBe(live);
    expect(live.getAttribute('aria-live')).toBe('polite'); expect(document.activeElement).toBe(input);
  });

  it('filters reports by source and marks Solr reports read only', async () => {
    await component.loadReports();
    component.searchText = 'solr';
    component.applyFilter();

    expect(component.filteredReports.length).toBe(1);
    expect(component.filteredReports[0].readOnly).toBeTrue();
  });

  it('requires confirmation before deleting and retains read-only restrictions', async () => {
    const service = TestBed.inject(ReportConfigService);
    const remove = jasmine.createSpy().and.resolveTo({});
    (service as any).delete = remove;
    await component.loadReports();
    const report = component.reports[0];
    await component.deleteReport(report);
    expect(remove).not.toHaveBeenCalled();
    component.requestDelete(report);
    component.cancelDelete();
    expect(remove).not.toHaveBeenCalled();
    component.requestDelete(component.reports[2]);
    await component.deleteReport(component.reports[2]);
    expect(remove).not.toHaveBeenCalled();
    component.requestDelete(report);
    await component.deleteReport(report);
    expect(remove).toHaveBeenCalledWith('db');
    expect(component.pendingDelete).toBeNull();
  });

  it('computes source summary counts', async () => {
    await component.loadReports();

    expect(component.totalReports).toBe(3);
    expect(component.databaseReports).toBe(2);
    expect(component.solrReports).toBe(1);
  });

  it('filters by the source toggle', async () => {
    await component.loadReports();

    component.setSourceFilter('solr');
    expect(component.filteredReports.length).toBe(1);
    expect(component.filteredReports[0].reportSource).toBe('solr');

    component.setSourceFilter('database');
    expect(component.filteredReports.length).toBe(2);

    component.setSourceFilter('all');
    expect(component.filteredReports.length).toBe(3);
  });

  it('loads named queries non-fatally', async () => {
    await component.loadNamedQueries();
    expect(component.namedQueries.length).toBe(1);
    expect(component.namedQueries[0].name).toBe('listRDMPRecords');
  });

  it('passes filter values when previewing a report', async () => {
    const report = { name: 'db', title: 'Database', reportSource: 'database', databaseQuery: { queryName: 'listRDMPRecords' }, readOnly: false, columns: [], filter: [], canEdit: true, canDelete: true, canPreview: true } as any;
    const service = TestBed.inject(ReportConfigService);
    spyOn(service, 'preview').and.resolveTo({ total: 0 } as any);
    component.selectedReport = report;
    component.previewFilterValues = { title: 'draft', dateRange_fromDate: '2026-01-01' };

    await component.previewReport();

    expect(service.preview).toHaveBeenCalledWith(report, component.previewFilterValues);
  });
  it('replaces filtered empty table headers with a working clear-filters action', async () => {
    fixture.detectChanges();
    await component.waitForInit();
    component.searchText = 'no-match-123';
    component.applyFilter();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('thead')).toBeNull();
    const empty = fixture.nativeElement.querySelector('.rb-admin-empty');
    expect(empty.textContent).toContain('admin-no-filter-results');
    empty.querySelector('button').click();
    fixture.detectChanges();
    expect(component.searchText).toBe('');
    expect(fixture.nativeElement.querySelector('thead')).toBeTruthy();
  });

  it('closes pristine editors and confirms dirty dismissal without losing the draft', async () => {
    fixture.detectChanges(); await component.waitForInit();
    component.createReport(); component.cancelEdit();
    expect(component.selectedReport).toBeNull();
    component.editReport(component.reports[0]); fixture.detectChanges(); await fixture.whenStable();
    component.selectedReport!.title = 'Unsaved title';
    component.cancelEdit(); fixture.detectChanges(); await fixture.whenStable();
    expect(component.confirmDiscard).toBeTrue();
    expect(component.selectedReport!.title).toBe('Unsaved title');
    const confirm = fixture.nativeElement.querySelector('rb-admin-discard-dialog');
    const traps = fixture.debugElement.queryAll(By.directive(CdkTrapFocus)).map(el => el.injector.get(CdkTrapFocus));
    expect(traps.filter(trap => trap.enabled).length).toBe(1);
    expect(fixture.nativeElement.querySelector('[aria-labelledby="report-editor-title"]')?.inert).toBeTrue();
    expect(document.activeElement).toBe(confirm.querySelector('[cdkFocusInitial]'));
    confirm.querySelector('[cdkFocusInitial]').click(); fixture.detectChanges(); await fixture.whenStable();
    expect(component.confirmDiscard).toBeFalse();
    expect(document.activeElement?.id).toBe('report-title');
    expect(traps[0].enabled).toBeTrue();
    expect(component.selectedReport!.title).toBe('Unsaved title');
    component.cancelEdit(); fixture.detectChanges(); await fixture.whenStable();
    fixture.nativeElement.querySelector('rb-admin-discard-dialog [role=alertdialog]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges(); await fixture.whenStable();
    expect(component.confirmDiscard).toBeFalse();
    expect(component.selectedReport!.title).toBe('Unsaved title');
    component.cancelEdit(); component.cancelEdit(true);
    expect(component.selectedReport).toBeNull();
  });
});
