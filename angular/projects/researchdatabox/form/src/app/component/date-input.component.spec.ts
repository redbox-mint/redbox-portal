import { FormConfig } from '@researchdatabox/sails-ng-common';
import { DateInputComponent } from './date-input.component';
import { createFormAndWaitForReady, createTestbedModule } from '../helpers.spec';
import { BsDatepickerModule } from 'ngx-bootstrap/datepicker';
import { TestBed } from '@angular/core/testing';

describe('DateInputComponent', () => {
  beforeEach(async () => {
    await createTestbedModule([
      DateInputComponent,
    ],[],[BsDatepickerModule.forRoot()]);
  });

  it('should create component', () => {
    const fixture = TestBed.createComponent(DateInputComponent);
    const component = fixture.componentInstance;
    expect(component).toBeDefined();
    
    const input = fixture.nativeElement.querySelector('input');
    expect(input.disabled).toBeFalse();
    expect(input.readOnly).toBeFalse();
  });

  it('should render Date input component', async () => {
    const formConfig: FormConfig = {
      debugValue: true,
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: 'redbox-form form',
      componentDefinitions: [
        {
          name: 'date_test',
          model: {
            class: 'DateInputModel',
            config: {
              defaultValue: '10/08/2025'
            },
          },
          component: {
            class: 'DateInputComponent',
            config: {
            },
          },
        },
      ],
    };

    const {fixture} = await createFormAndWaitForReady(formConfig);
    const compiled = fixture.nativeElement as HTMLElement;
    const inputElement = compiled.querySelector('input[type="text"]');
    expect((inputElement as HTMLInputElement).value).toEqual('10/08/2025');
  });

  it('should have bsDatepicker directive', () => {
    const fixture = TestBed.createComponent(DateInputComponent);
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('input');
    expect(input.hasAttribute('bsdatepicker')).toBeTrue();
  });

  it('should update date format from config', () => {
    const fixture = TestBed.createComponent(DateInputComponent);
    const component = fixture.componentInstance;
    component.setDateFormat('YYYY-MM-DD');
    fixture.detectChanges();

    expect(component.bsConfig.dateInputFormat).toBe('YYYY-MM-DD');
  });

  it('should set placeholder and tooltip', () => {
    const fixture = TestBed.createComponent(DateInputComponent);
    const component = fixture.componentInstance;
    component.placeholder = 'YYYY-MM-DD';
    component.tooltip = 'Select a date';
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('input');
    expect(input.getAttribute('placeholder')).toBe('YYYY-MM-DD');
    expect(input.getAttribute('title')).toBe('Select a date');
  });
});


