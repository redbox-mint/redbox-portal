import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { TranslationService } from '@researchdatabox/portal-ng-common';
import { GraphqlSchemaComponent } from './graphql-schema.component';

describe('GraphQL schema assistance', () => {
  let fixture: ComponentFixture<GraphqlSchemaComponent>;
  const sdl = `
    type Query {
      "Find research plans" records(first: Int, filter: PlanFilter): [R_researchPlan_abcdef]
      health: String
    }
    type R_researchPlan_abcdef { title: String }
    input PlanFilter { "Match a title" title: String, status: Status }
    enum Status { "Ready to use" ACTIVE DRAFT }
    scalar Timestamp
  `;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GraphqlSchemaComponent],
      providers: [{
        provide: TranslationService,
        useValue: { t: (key: string) => key, isInitializing: () => false, translationChanges$: of(undefined) },
      }],
    }).compileComponents();
    fixture = TestBed.createComponent(GraphqlSchemaComponent);
    fixture.componentRef.setInput('sdl', sdl);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('renders field descriptions, argument signatures and friendly type names without introspection types', () => {
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('ul')!.textContent).toContain('records(first: Int, filter: PlanFilter): [R_researchPlan_abcdef]');
    expect(element.querySelector('ul')!.textContent).toContain('Find research plans');
    expect(element.querySelector('ul')!.textContent).toContain('health: String');
    const names = Array.from(element.querySelectorAll('option')).map(option => option.textContent!.trim());
    expect(names).toContain('research Plan');
    expect(names.some(name => name.startsWith('__'))).toBeFalse();
    expect(element.querySelector('pre')!.textContent).toBe(sdl);
  });

  it('filters object fields case-insensitively using the rendered search control', async () => {
    const input = fixture.nativeElement.querySelector('input[type="search"]') as HTMLInputElement;
    input.value = 'RECORD';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('li').length).toBe(1);
    expect(fixture.nativeElement.querySelector('li').textContent).toContain('records');
    input.value = 'absent';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('li').length).toBe(0);
  });

  it('shows input fields and enum value descriptions when their type is selected', async () => {
    const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
    select.value = 'PlanFilter';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('ul').textContent).toContain('title: String');
    expect(fixture.nativeElement.querySelector('ul').textContent).toContain('Match a title');
    select.value = 'Status';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(Array.from(fixture.nativeElement.querySelectorAll('li code') as NodeListOf<HTMLElement>).map(node => node.textContent))
      .toEqual(['ACTIVE: ', 'DRAFT: ']);
    expect(fixture.nativeElement.querySelector('ul').textContent).toContain('Ready to use');
  });

  for (const type of ['Timestamp', 'Missing']) {
    it(`offers no invented fields for ${type}`, () => {
      fixture.componentInstance.typeName = type;
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelectorAll('li').length).toBe(0);
    });
  }

  it('clears obsolete types and fields when the supplied schema becomes invalid', () => {
    fixture.componentRef.setInput('sdl', 'type Query {');
    fixture.detectChanges();
    expect(fixture.componentInstance.schema).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('option').length).toBe(0);
    expect(fixture.nativeElement.querySelectorAll('li').length).toBe(0);
    expect(fixture.nativeElement.querySelector('pre').textContent).toBe('type Query {');
  });
});
