import { HttpClientTestingModule } from '@angular/common/http/testing';
import { Pipe, PipeTransform } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
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
      imports: [FormsModule, HttpClientTestingModule],
      providers: [
        { provide: LoggerService, useValue: { error: () => undefined, warn: () => undefined } },
        { provide: TranslationService, useValue: { isReady: true, init: () => Promise.resolve() } },
        {
          provide: ReportConfigService,
          useValue: {
            list: () => Promise.resolve([
              { name: 'db', title: 'Database', reportSource: 'database', readOnly: false, columns: [{ label: 'A', property: 'a' }], filter: [{ type: 'text', paramName: 'p', property: 'a', message: '' }], canEdit: true, canDelete: true, canPreview: true },
              { name: 'db2', title: 'Database 2', reportSource: 'database', readOnly: false, columns: [], filter: [], canEdit: true, canDelete: true, canPreview: true },
              { name: 'solr', title: 'Solr', reportSource: 'solr', readOnly: true, columns: [], filter: [], canEdit: false, canDelete: false, canPreview: false }
            ]),
            listNamedQueries: () => Promise.resolve([{ name: 'listRDMPRecords' }])
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
});
