import { Component, OnInit } from '@angular/core';
import { FieldType, FieldTypeConfig } from '@ngx-formly/core';

interface CategoryMappingRow {
  sourceCode: string;
  figshareCategoryId: number | null;
}

@Component({
  selector: 'formly-figshare-category-mapping-editor-type',
  templateUrl: './figshare-category-mapping-editor.type.html',
  standalone: false
})
export class FigshareCategoryMappingEditorTypeComponent extends FieldType<FieldTypeConfig> implements OnInit {
  private mappingRows: CategoryMappingRow[] = [];

  ngOnInit(): void {
    this.mappingRows = this.normaliseRows(this.resolveCurrentRows());
    this.syncRows(this.mappingRows);
  }

  get rows(): CategoryMappingRow[] {
    return this.mappingRows;
  }

  addRow(): void {
    this.mappingRows = [...this.rows, { sourceCode: '', figshareCategoryId: null }];
    this.syncRows(this.mappingRows, true);
  }

  removeRow(index: number): void {
    this.mappingRows = this.rows.filter((_: CategoryMappingRow, rowIndex: number) => rowIndex !== index);
    this.syncRows(this.mappingRows, true);
  }

  updateRow(index: number, key: keyof CategoryMappingRow, value: string): void {
    const rows = [...this.rows];
    if (index < 0 || index >= rows.length) {
      return;
    }
    const current = rows[index];
    const nextValue = key === 'figshareCategoryId'
      ? value === ''
        ? null
        : (() => {
          const parsed = Number(value);
          return Number.isFinite(parsed) && Number.isInteger(parsed) ? parsed : current.figshareCategoryId;
        })()
      : value;
    rows[index] = {
      ...current,
      [key]: nextValue
    };
    this.mappingRows = rows;
    this.syncRows(this.mappingRows, true);
  }

  private resolveCurrentRows(): CategoryMappingRow[] {
    const modelValue = typeof this.key === 'string' ? (this.model?.[this.key] as CategoryMappingRow[] | undefined) : undefined;
    const controlValue = this.formControl?.value as CategoryMappingRow[] | undefined;
    return modelValue ?? controlValue ?? [];
  }

  private normaliseRows(rows: CategoryMappingRow[]): CategoryMappingRow[] {
    return Array.isArray(rows) ? rows : [];
  }

  private syncRows(rows: CategoryMappingRow[], markChanged = false): void {
    if (typeof this.key === 'string' && this.model) {
      (this.model as Record<string, CategoryMappingRow[]>)[this.key] = rows;
    }

    if (this.formControl) {
      if (typeof (this.formControl as { patchValue?: (val: CategoryMappingRow[]) => void }).patchValue === 'function') {
        (this.formControl as { patchValue: (val: CategoryMappingRow[]) => void }).patchValue(rows);
      } else if (typeof (this.formControl as { setValue?: (val: CategoryMappingRow[]) => void }).setValue === 'function') {
        (this.formControl as { setValue: (val: CategoryMappingRow[]) => void }).setValue(rows);
      }
      if (markChanged) {
        this.formControl.markAsDirty();
        this.formControl.markAsTouched();
      }
    }
  }
}
