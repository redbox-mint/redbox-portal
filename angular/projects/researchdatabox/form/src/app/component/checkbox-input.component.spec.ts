import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl } from '@angular/forms';
import { CheckboxInputComponent, CheckboxInputModel, CheckboxOption } from './checkbox-input.component';
import { FormFieldCompMapEntry, LoggerService } from '@researchdatabox/portal-ng-common';
import { CheckboxInputComponentConfig } from '@researchdatabox/sails-ng-common';

describe('CheckboxInputComponent', () => {
  let component: CheckboxInputComponent;
  let fixture: ComponentFixture<CheckboxInputComponent>;
  let mockLoggerService: jasmine.SpyObj<LoggerService>;

  const mockOptions: CheckboxOption[] = [
    { label: 'Option 1', value: 'option1' },
    { label: 'Option 2', value: 'option2' },
    { label: 'Option 3', value: 'option3' }
  ];

  beforeEach(async () => {
    mockLoggerService = jasmine.createSpyObj('LoggerService', ['debug', 'info', 'error']);

    await TestBed.configureTestingModule({
      declarations: [CheckboxInputComponent],
      providers: [
        { provide: LoggerService, useValue: mockLoggerService }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(CheckboxInputComponent);
    component = fixture.componentInstance;
  });

  beforeEach(() => {
    // Setup basic component properties
    component.options = mockOptions;
    component.model = new CheckboxInputModel({
      class: 'CheckboxInputModel',
      config: { defaultValue: '' }
    });
    component.model.formControl = new FormControl('');
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('Component Initialization', () => {
    it('should initialize with default properties', () => {
      expect(component.multipleValues).toBeFalse();
      expect(component.tooltip).toBe('');
      expect(component.placeholder).toBe('');
      expect(component.options).toEqual([]);
    });

    it('should set properties from component map entry', () => {
      const mockConfig = new CheckboxInputComponentConfig();
      mockConfig.multipleValues = true;
      mockConfig.tooltip = 'Test tooltip';
      mockConfig.placeholder = 'Test placeholder';
      mockConfig.options = mockOptions;

      const mockMapEntry: Partial<FormFieldCompMapEntry> = {
        compConfigJson: {
          name: 'test-checkbox',
          component: {
            class: 'CheckboxInputComponent',
            config: mockConfig
          }
        }
      };

      component.setPropertiesFromComponentMapEntry(mockMapEntry as FormFieldCompMapEntry);

      expect(component.multipleValues).toBeTrue();
      expect(component.options).toEqual(mockOptions);
    });
  });

  describe('Single Value Mode', () => {
    beforeEach(() => {
      component.multipleValues = false;
      component.options = mockOptions;
      fixture.detectChanges();
    });

    it('should check if option is selected in single value mode', () => {
      component.model!.formControl!.setValue('option1');
      
      expect(component.isOptionSelected('option1')).toBeTrue();
      expect(component.isOptionSelected('option2')).toBeFalse();
    });

    it('should handle option change in single value mode - selecting option', () => {
      component.onOptionChange(true, 'option1');
      
      expect(component.formControl.value).toBe('option1');
      expect(component.formControl.dirty).toBeTrue();
      expect(component.formControl.touched).toBeTrue();
    });

    it('should handle option change in single value mode - deselecting option', () => {
      component.model!.formControl!.setValue('option1');
      component.onOptionChange(false, 'option1');
      
      expect(component.formControl.value).toBe('');
    });

    it('should render checkboxes for single value mode', () => {
      const checkboxes = fixture.nativeElement.querySelectorAll('input[type="checkbox"]');
      expect(checkboxes.length).toBe(3);
    });

    it('should check correct checkbox in single value mode', () => {
      component.model!.formControl!.setValue('option2');
      fixture.detectChanges();
      
      const checkboxes = fixture.nativeElement.querySelectorAll('input[type="checkbox"]');
      expect(checkboxes[0].checked).toBeFalse();
      expect(checkboxes[1].checked).toBeTrue();
      expect(checkboxes[2].checked).toBeFalse();
    });
  });

  describe('Multiple Values Mode', () => {
    beforeEach(() => {
      component.multipleValues = true;
      component.options = mockOptions;
      fixture.detectChanges();
    });

    it('should check if option is selected in multiple values mode', () => {
      component.model!.formControl!.setValue(['option1', 'option3']);
      
      expect(component.isOptionSelected('option1')).toBeTrue();
      expect(component.isOptionSelected('option2')).toBeFalse();
      expect(component.isOptionSelected('option3')).toBeTrue();
    });

    it('should handle adding option in multiple values mode', () => {
      component.model!.formControl!.setValue(['option1']);
      component.onOptionChange(true, 'option2');
      
      expect(component.formControl.value).toEqual(['option1', 'option2']);
    });

    it('should handle removing option in multiple values mode', () => {
      component.model!.formControl!.setValue(['option1', 'option2', 'option3']);
      component.onOptionChange(false, 'option2');
      
      expect(component.formControl.value).toEqual(['option1', 'option3']);
    });

    it('should handle empty array in multiple values mode', () => {
      component.model!.formControl!.setValue([]);
      component.onOptionChange(true, 'option1');
      
      expect(component.formControl.value).toEqual(['option1']);
    });

    it('should handle non-array value in multiple values mode', () => {
      component.model!.formControl!.setValue('option1');
      component.onOptionChange(true, 'option2');
      
      expect(component.formControl.value).toEqual(['option2']);
    });

    it('should not add duplicate values in multiple values mode', () => {
      component.model!.formControl!.setValue(['option1', 'option2']);
      component.onOptionChange(true, 'option1'); // Try to add duplicate
      
      expect(component.formControl.value).toEqual(['option1', 'option2']);
    });

    it('should check multiple checkboxes in multiple values mode', () => {
      component.model!.formControl!.setValue(['option1', 'option3']);
      fixture.detectChanges();
      
      const checkboxes = fixture.nativeElement.querySelectorAll('input[type="checkbox"]');
      expect(checkboxes[0].checked).toBeTrue();
      expect(checkboxes[1].checked).toBeFalse();
      expect(checkboxes[2].checked).toBeTrue();
    });
  });

  describe('Template Rendering', () => {
    beforeEach(() => {
      component.options = mockOptions;
      component.name = 'test-checkbox';
      component.tooltip = 'Test tooltip';
      fixture.detectChanges();
    });

    it('should render labels with correct text', () => {
      const labels = fixture.nativeElement.querySelectorAll('label.form-check-label');
      expect(labels.length).toBe(3);
      expect(labels[0].textContent).toBe('Option 1');
      expect(labels[1].textContent).toBe('Option 2');
      expect(labels[2].textContent).toBe('Option 3');
    });

    it('should set correct id and for attributes', () => {
      const inputs = fixture.nativeElement.querySelectorAll('input[type="checkbox"]');
      const labels = fixture.nativeElement.querySelectorAll('label.form-check-label');
      
      expect(inputs[0].id).toBe('test-checkbox-option1');
      expect(inputs[1].id).toBe('test-checkbox-option2');
      expect(inputs[2].id).toBe('test-checkbox-option3');
      
      expect(labels[0].getAttribute('for')).toBe('test-checkbox-option1');
      expect(labels[1].getAttribute('for')).toBe('test-checkbox-option2');
      expect(labels[2].getAttribute('for')).toBe('test-checkbox-option3');
    });

    it('should set tooltip title attribute', () => {
      const inputs = fixture.nativeElement.querySelectorAll('input[type="checkbox"]');
      inputs.forEach((input: HTMLInputElement) => {
        expect(input.title).toBe('Test tooltip');
      });
    });

    it('should handle disabled options', () => {
      component.options = [
        { label: 'Enabled Option', value: 'enabled' },
        { label: 'Disabled Option', value: 'disabled', disabled: true }
      ];
      fixture.detectChanges();
      
      const inputs = fixture.nativeElement.querySelectorAll('input[type="checkbox"]');
      expect(inputs[0].disabled).toBeFalse();
      expect(inputs[1].disabled).toBeTrue();
    });
  });

  describe('Form Integration', () => {
    it('should mark form control as dirty and touched on change', () => {
      component.options = mockOptions;
      const formControl = component.model!.formControl!;
      spyOn(formControl, 'markAsDirty');
      spyOn(formControl, 'markAsTouched');
      
      component.onOptionChange(true, 'option1');
      
      expect(formControl.markAsDirty).toHaveBeenCalled();
      expect(formControl.markAsTouched).toHaveBeenCalled();
    });

    it('should handle required validation', () => {
      component.model!.validators = [{ name: 'required' }];
      expect(component.isRequired).toBeTrue();
    });

    it('should handle form control validation state', () => {
      const formControl = component.model!.formControl!;
      formControl.setErrors(null);
      expect(component.isValid).toBeTrue();
      
      formControl.setErrors({ required: true });
      expect(component.isValid).toBeFalse();
    });
  });

  describe('Edge Cases', () => {
    it('should handle undefined form control value', () => {
      component.model!.formControl!.setValue(undefined);
      
      expect(component.isOptionSelected('option1')).toBeFalse();
    });

    it('should handle null form control value', () => {
      component.model!.formControl!.setValue(null);
      
      expect(component.isOptionSelected('option1')).toBeFalse();
    });

    it('should handle empty string form control value in single mode', () => {
      component.multipleValues = false;
      component.model!.formControl!.setValue('');
      
      expect(component.isOptionSelected('option1')).toBeFalse();
    });

    it('should handle empty array form control value in multiple mode', () => {
      component.multipleValues = true;
      component.model!.formControl!.setValue([]);
      
      expect(component.isOptionSelected('option1')).toBeFalse();
    });
  });
});
