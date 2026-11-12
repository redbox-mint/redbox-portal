import { NamedQueryNameFieldComponent, AdminTabsDirective } from '@researchdatabox/portal-ng-common';
import { QueryAssistanceModule } from '../query-assistance.module';
import {
  TranslationService as AssistanceTranslationService,
  FieldTreeComponent,
  SchemaTargetSelectorComponent,
} from '@researchdatabox/portal-ng-common';
import { of } from 'rxjs';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Pipe, PipeTransform, NO_ERRORS_SCHEMA } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NqDetailComponent } from './nq-detail.component';
import { NamedQueryDatabaseDefinition as NamedQueryDefinition } from '../named-query-api.service';

@Pipe({ name: 'i18next', standalone: false })
class I18NextPipeStub implements PipeTransform {
  transform(value: string): string {
    return value;
  }
}

describe('NqDetailComponent', () => {
  let fixture: ComponentFixture<NqDetailComponent>;
  let component: NqDetailComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [NqDetailComponent, I18NextPipeStub],
      providers: [
        {
          provide: AssistanceTranslationService,
          useValue: { t: (v: string) => v, isInitializing: () => false, translationChanges$: of(undefined) },
        },
      ],
      imports: [NamedQueryNameFieldComponent, AdminTabsDirective, QueryAssistanceModule, FieldTreeComponent, SchemaTargetSelectorComponent, FormsModule],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(NqDetailComponent);
    component = fixture.componentInstance;
    component.draft = {
      name: 'q1',
      collectionName: 'c1',
      mongoQuery: { a: 1 },
      queryParams: { p: { type: 'string', path: 'path', whenUndefined: 'ignore' } },
      resultObjectMapping: { r: 'v' },
      sort: [{ field: 'ASC' }],
      relatedRecordFilters: [{ collectionName: 'c', mongoQuery: {}, localField: 'l', foreignField: 'f' }],
    } as NamedQueryDefinition;
  });

  it('moves focus and selection with arrow keys, Home and End', () => {
    fixture.detectChanges();
    const tabs = Array.from(fixture.nativeElement.querySelectorAll('[role="tab"]')) as HTMLButtonElement[];
    expect(tabs.map(tab => tab.tabIndex)).toEqual([0, -1, -1, -1, -1]);
    tabs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    fixture.detectChanges();
    expect(component.activeTab).toBe('sort');
    expect(document.activeElement).toBe(tabs[4]);
    tabs[4].dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    tabs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();
    expect(component.activeTab).toBe('mongo');
    const panel = fixture.nativeElement.querySelector('#' + tabs[1].getAttribute('aria-controls'));
    expect(panel.hidden).toBeFalse();
    expect(panel.getAttribute('aria-labelledby')).toBe(tabs[1].id);
  });

  it('sets active tab' , () => {
    expect(component.activeTab).toBe('basics');
    component.setTab('mongo');
    expect(component.activeTab).toBe('mongo');
  });

  it('computes paramCount', () => {
    expect(component.paramCount).toBe(1);
    component.draft = { ...component.draft, queryParams: {} };
    expect(component.paramCount).toBe(0);
  });

  it('computes mappingCount', () => {
    expect(component.mappingCount).toBe(1);
    component.draft = { ...component.draft, resultObjectMapping: {} };
    expect(component.mappingCount).toBe(0);
  });

  it('computes mongoKeyCount', () => {
    expect(component.mongoKeyCount).toBe(1);
    component.draft = { ...component.draft, mongoQuery: {} };
    expect(component.mongoKeyCount).toBe(0);
  });

  it('computes sortCount', () => {
    expect(component.sortCount).toBe(1);
    component.draft = { ...component.draft, sort: [] };
    expect(component.sortCount).toBe(0);
  });

  it('computes filterCount', () => {
    expect(component.filterCount).toBe(1);
    component.draft = { ...component.draft, relatedRecordFilters: [] };
    expect(component.filterCount).toBe(0);
  });

  it('handles missing draft properties', () => {
    component.draft = {
      name: 'q',
      collectionName: 'c',
      mongoQuery: {},
      queryParams: undefined as any,
      resultObjectMapping: undefined as any,
    };
    expect(component.paramCount).toBe(0);
    expect(component.mappingCount).toBe(0);
    expect(component.mongoKeyCount).toBe(0);

    component.draft = {
      name: 'q',
      collectionName: 'c',
      mongoQuery: {},
      queryParams: {},
      resultObjectMapping: {},
      sort: undefined,
      relatedRecordFilters: undefined,
    };
    expect(component.sortCount).toBe(0);
    expect(component.filterCount).toBe(0);
  });
  it('shows the Used by section with links when editing an existing query', () => {
    component.isNew = false;
    component.brandingAndPortalUrl = '/brand/portal';
    component.draft.usedBy = [{ type: 'dashboard', name: 'Party · Draft', path: '/admin/dashboard-config#target=party' }];
    fixture.detectChanges();
    const section = fixture.nativeElement.querySelector('[aria-labelledby="nq-used-by-title"]');
    expect(section.textContent).toContain('Party · Draft');
    expect(section.querySelector('a').getAttribute('href')).toBe('/brand/portal/admin/dashboard-config#target=party');
    component.isNew = true;
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[aria-labelledby="nq-used-by-title"]')).toBeNull();
  });

});
