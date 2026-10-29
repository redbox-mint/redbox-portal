import { RecordTableComponent } from './record-table.component';
import { RecordPropViewMetaDto } from '@researchdatabox/sails-ng-common';
import { LoggerService } from './logger.service';
import { UtilityService } from './utility.service';
import { HandlebarsTemplateService } from './handlebars-template.service';
import { TestBed } from '@angular/core/testing';

describe('RecordTableComponent multivalue columns', () => {
  let component: RecordTableComponent;
  const column = { property: 'metadata.funders', multivalue: true } as RecordPropViewMetaDto;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [RecordTableComponent],
      providers: [
        { provide: LoggerService, useValue: {} },
        { provide: UtilityService, useValue: {} },
        { provide: HandlebarsTemplateService, useValue: {} },
      ],
    }).overrideComponent(RecordTableComponent, { set: { template: '' } });
    component = TestBed.createComponent(RecordTableComponent).componentInstance;
  });

  for (const value of [undefined, null, {}, 42, []]) {
    it(`renders an empty cell for ${JSON.stringify(value)} so later report rows can render`, () => {
      expect(component.getColValue({ metadata: { funders: value } }, column)).toBe('');
      spyOn(component, 'getEntryValue').and.callFake((_row, _col, entry) => entry);
      expect(component.getColValue({ metadata: { funders: ['ARC'] } }, column)).toBe('ARC');
    });
  }

  it('renders each array item with its template context', () => {
    spyOn(component, 'getEntryValue').and.callFake((_row, _col, value) => `${value.title}; `);
    expect(component.getColValue({ metadata: { funders: [{ title: 'ARC' }, { title: 'NHMRC' }] } }, column))
      .toBe('ARC; NHMRC; ');
  });

  it('preserves legacy character iteration for string values', () => {
    spyOn(component, 'getEntryValue').and.callFake((_row, _col, value) => `[${value}]`);
    expect(component.getColValue({ metadata: { funders: 'AB' } }, column)).toBe('[A][B]');
  });
});
