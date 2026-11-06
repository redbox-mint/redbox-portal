import { AdminCountPipe } from '@researchdatabox/portal-ng-common';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { Pipe, PipeTransform } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { A11yModule } from '@angular/cdk/a11y';
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
      imports: [AdminCountPipe, FormsModule, HttpClientTestingModule, A11yModule],
      providers: [
        { provide: LoggerService, useValue: { error: () => undefined, warn: () => undefined } },
        { provide: TranslationService, useValue: { t: (key: string) => key, isReady: true, init: () => Promise.resolve(), waitForInit: () => Promise.resolve() } },
        {
          provide: ReportConfigService,
          useValue: {
            waitForInit: () => Promise.resolve(),
            list: () => Promise.resolve([
              { name: 'db', title: 'Database', reportSource: 'database', readOnly: false, columns: [{ label: 'A', property: 'a' }], filter: [{ type: 'text', paramName: 'p', property: 'a', message: '' }], canEdit: true, canDelete: true, canPreview: true },
              { name: 'db2', title: 'Database 2', reportSource: 'database', readOnly: false, columns: [], filter: [], canEdit: true, canDelete: true, canPreview: true },
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
    const report = { name: 'db', title: 'Database', reportSource: 'database', readOnly: false, columns: [], filter: [], canEdit: true, canDelete: true, canPreview: true } as any;
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

});
