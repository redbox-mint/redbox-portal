import { Pipe, PipeTransform } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { FieldPickerComponent } from './field-picker.component';

@Pipe({ name: 'i18next', standalone: false })
class I18NextPipeStub implements PipeTransform {
  transform(key: string, options?: any) { return options ? `${key}:${options.recordType}${options.stage}` : key; }
}

describe('FieldPickerComponent', () => {
  let fixture: ComponentFixture<FieldPickerComponent>;
  beforeEach(async () => {
    await TestBed.configureTestingModule({ declarations: [FieldPickerComponent, I18NextPipeStub], imports: [FormsModule] }).compileComponents();
    fixture = TestBed.createComponent(FieldPickerComponent);
    fixture.componentInstance.catalogue = { recordType: 'rdmp', workflowStage: 'draft', fields: [{ path: 'metadata.title', label: 'Title', type: 'string', repeated: false, source: 'schema' }], openPrefixes: [], status: 'complete' };
    fixture.detectChanges();
  });

  it('returns keyboard option focus to the input after choosing a field', async () => {
    const component = fixture.componentInstance;
    component.open = true; fixture.detectChanges();
    const option: HTMLButtonElement = fixture.nativeElement.querySelector('[role=option]');
    option.focus();
    option.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    option.click(); fixture.detectChanges(); await fixture.whenStable();
    expect(component.value).toBe('metadata.title');
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('input'));
    expect(component.open).toBeFalse();
  });

  it('selects with ArrowDown and Enter while retaining combobox focus', () => {
    const input: HTMLInputElement = fixture.nativeElement.querySelector('input');
    input.focus();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    fixture.detectChanges();
    expect(fixture.componentInstance.value).toBe('metadata.title');
    expect(document.activeElement).toBe(input);
    expect(input.getAttribute('aria-activedescendant')).toBeNull();
  });

  it('translates the unknown-field warning with record type and stage', () => {
    fixture.componentInstance.value = 'metadata.typo'; fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.dc-field-hint').textContent).toContain('admin-dashboard-unknown-field:rdmp (draft)');
  });
});
