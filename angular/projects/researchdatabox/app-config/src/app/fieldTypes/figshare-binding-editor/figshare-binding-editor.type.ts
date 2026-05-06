import { Component, OnInit } from '@angular/core';
import { FieldType, FieldTypeConfig } from '@ngx-formly/core';

type BindingKind = 'path' | 'handlebars' | 'jsonata';
interface FigshareBindingValue {
  kind?: BindingKind;
  path?: string;
  template?: string;
  expression?: string;
  defaultValue?: string;
}

@Component({
  selector: 'formly-figshare-binding-editor-type',
  templateUrl: './figshare-binding-editor.type.html',
  standalone: false
})
export class FigshareBindingEditorTypeComponent extends FieldType<FieldTypeConfig> implements OnInit {
  readonly bindingKinds: BindingKind[] = ['path', 'handlebars', 'jsonata'];
  private bindingValue: FigshareBindingValue = { kind: 'path', path: '' };

  ngOnInit(): void {
    this.bindingValue = this.normaliseValue(this.resolveCurrentValue());
    this.syncValue(this.bindingValue);
  }

  get value(): FigshareBindingValue {
    return this.bindingValue;
  }

  get kind(): BindingKind {
    return this.value.kind || 'path';
  }

  updateField(key: string, value: unknown): void {
    const nextValue = { ...this.value, [key]: value };
    if (key === 'kind') {
      delete nextValue.path;
      delete nextValue.template;
      delete nextValue.expression;
    }
    this.bindingValue = this.normaliseValue(nextValue);
    this.syncValue(this.bindingValue, true);
  }

  private resolveCurrentValue(): FigshareBindingValue {
    const modelValue = typeof this.key === 'string' ? (this.model?.[this.key] as FigshareBindingValue | undefined) : undefined;
    const controlValue = this.formControl?.value as FigshareBindingValue | undefined;
    return modelValue ?? controlValue ?? {};
  }

  private normaliseValue(value: FigshareBindingValue): FigshareBindingValue {
    const kind = value?.kind || 'path';
    const nextValue: FigshareBindingValue = {
      ...value,
      kind
    };

    if (kind === 'path') {
      nextValue.path = nextValue.path || '';
    }

    return nextValue;
  }

  private syncValue(value: FigshareBindingValue, markChanged = false): void {
    if (typeof this.key === 'string' && this.model) {
      (this.model as Record<string, FigshareBindingValue>)[this.key] = value;
    }

    if (this.formControl) {
      if (typeof (this.formControl as { patchValue?: (val: FigshareBindingValue) => void }).patchValue === 'function') {
        (this.formControl as { patchValue: (val: FigshareBindingValue) => void }).patchValue(value);
      } else if (typeof (this.formControl as { setValue?: (val: FigshareBindingValue) => void }).setValue === 'function') {
        (this.formControl as { setValue: (val: FigshareBindingValue) => void }).setValue(value);
      }
      if (markChanged) {
        this.formControl.markAsDirty();
        this.formControl.markAsTouched();
      }
    }
  }
}
