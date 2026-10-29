import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TranslationService } from '@researchdatabox/portal-ng-common';
import { of } from 'rxjs';
import { QueryAssistanceModule, QueryTypedValueComponent } from './query-assistance.module';

describe('Named query typed parameter inputs', () => {
  let fixture: ComponentFixture<QueryTypedValueComponent>;
  let component: QueryTypedValueComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QueryAssistanceModule],
      providers: [{
        provide: TranslationService,
        useValue: { t: (key: string) => key, isInitializing: () => false, translationChanges$: of(undefined) },
      }],
    }).compileComponents();
    fixture = TestBed.createComponent(QueryTypedValueComponent);
    component = fixture.componentInstance;
  });

  for (const type of ['object', 'array', 'number', 'boolean', 'date']) {
    it(`passes ${type} template input unchanged for server-side transformation before coercion`, async () => {
      fixture.componentRef.setInput('type', type);
      fixture.componentRef.setInput('template', type === 'object' ? '{"name":"{{value}}"}' : '{{value}}');
      fixture.componentRef.setInput('format', 'days');
      fixture.componentRef.setInput('queryType', '>=');
      const emitted = spyOn(component.valueChange, 'emit');
      fixture.detectChanges();
      await fixture.whenStable();
      expect(emitted).not.toHaveBeenCalled();
      const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
      expect(input.type).toBe('text');
      const rawInput = type === 'boolean' ? 'false' : 'Alice';
      input.value = rawInput;
      input.dispatchEvent(new Event('input'));
      await fixture.whenStable();
      expect(emitted).toHaveBeenCalledWith(rawInput);
      expect(component.error).toBeFalse();
    });
  }

  it('only offers numeric day offsets with a date operator and passes ISO dates through', async () => {
    fixture.componentRef.setInput('type', 'date');
    fixture.componentRef.setInput('format', 'days');
    fixture.componentRef.setInput('value', '2016-10-25T12:30:51.151+10:00');
    const emitted = spyOn(component.valueChange, 'emit');
    fixture.detectChanges();
    await fixture.whenStable();
    let input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    expect(input.type).toBe('text');
    expect(input.value).toBe('2016-10-25T12:30:51.151+10:00');
    expect(emitted).not.toHaveBeenCalled();
    fixture.componentRef.setInput('queryType', '>=');
    fixture.componentRef.setInput('value', -7);
    fixture.detectChanges();
    await fixture.whenStable();
    input = fixture.nativeElement.querySelector('input');
    expect(input.type).toBe('number');
    input.value = '-3';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(emitted).toHaveBeenCalledWith('-3');
    fixture.componentRef.setInput('format', 'ISODate');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('input').type).toBe('text');
  });

  it('emits recovered validity after the parameter type changes', () => {
    fixture.componentRef.setInput('type', 'object');
    fixture.detectChanges();
    fixture.debugElement.query(By.css('textarea')).triggerEventHandler('ngModelChange', '{ unfinished');
    const validity = spyOn(component.validityChange, 'emit');
    fixture.componentRef.setInput('type', 'string');
    fixture.detectChanges();
    expect(validity).toHaveBeenCalledWith(true);
    expect(component.error).toBeFalse();
    expect(fixture.nativeElement.querySelector('textarea')).toBeNull();
  });

  it('retains invalid default text when only its accessible label changes', () => {
    fixture.componentRef.setInput('type', 'object');
    fixture.detectChanges();
    fixture.debugElement.query(By.css('textarea')).triggerEventHandler('ngModelChange', '{ unfinished');
    const validity = spyOn(component.validityChange, 'emit');
    fixture.componentRef.setInput('label', 'Default value: renamed');
    fixture.detectChanges();
    expect(component.jsonValue).toBe('{ unfinished');
    expect(component.error).toBeTrue();
    expect(validity).not.toHaveBeenCalled();
  });

  it('explicitly unsets invalid JSON and reports recovered validity', () => {
    fixture.componentRef.setInput('type', 'object');
    fixture.detectChanges();
    fixture.debugElement.query(By.css('textarea')).triggerEventHandler('ngModelChange', '{ unfinished');
    const validity = spyOn(component.validityChange, 'emit');
    const emitted = spyOn(component.valueChange, 'emit');
    fixture.nativeElement.querySelector('.nq-unset-value').click();
    fixture.detectChanges();
    expect(validity).toHaveBeenCalledWith(true);
    expect(emitted).toHaveBeenCalledWith(undefined);
    expect(component.jsonValue).toBe('');
    expect(component.error).toBeFalse();
  });
});
