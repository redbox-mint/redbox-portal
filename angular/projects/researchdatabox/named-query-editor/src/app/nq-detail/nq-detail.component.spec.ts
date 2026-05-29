import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Pipe, PipeTransform, NO_ERRORS_SCHEMA } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NqDetailComponent } from './nq-detail.component';
import { NamedQueryDefinition } from '../named-query-api.service';

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
      imports: [FormsModule],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    fixture = TestBed.createComponent(NqDetailComponent);
    component = fixture.componentInstance;
    component.draft = {
      name: 'q1',
      collectionName: 'c1',
      mongoQuery: { a: 1 },
      queryParams: { p: { type: 'string', path: 'path', whenUndefined: 'ignore' } },
      resultObjectMapping: { r: 'v' },
      sort: [{ createdAt: 'ASC' }],
      relatedRecordFilters: [{ collectionName: 'c', mongoQuery: {}, localField: 'l', foreignField: 'f' }]
    } as NamedQueryDefinition;
  });

  it('sets active tab', () => {
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
    component.draft = { name: 'q', collectionName: 'c', mongoQuery: {}, queryParams: undefined as any, resultObjectMapping: undefined as any };
    expect(component.paramCount).toBe(0);
    expect(component.mappingCount).toBe(0);
    expect(component.mongoKeyCount).toBe(0);

    component.draft = { name: 'q', collectionName: 'c', mongoQuery: {}, queryParams: {}, resultObjectMapping: {}, sort: undefined, relatedRecordFilters: undefined };
    expect(component.sortCount).toBe(0);
    expect(component.filterCount).toBe(0);
  });
});
