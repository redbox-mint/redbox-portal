import { Component, Input } from '@angular/core';
import { TemplatePreviewService } from './template-preview.service';

@Component({
  selector: 'template-preview',
  template: `
    <div class="template-preview panel panel-default">
      <div class="panel-heading">Preview</div>
      <div class="panel-body">
        <div class="form-group">
          <label>Sample Data (JSON)</label>
          <textarea class="form-control" rows="4" [(ngModel)]="sampleDataJson" (ngModelChange)="onSampleDataChange($event)"></textarea>
        </div>
        <div class="preview-output well">
          <div [innerHTML]="previewHtml"></div>
        </div>
      </div>
    </div>
  `,
  standalone: false
})
export class TemplatePreviewComponent {
  @Input() template = '';

  sampleDataJson = '{"title": "Sample Record", "name": "John Doe"}';
  sampleData: Record<string, unknown> = {};
  previewHtml = '';

  constructor(private previewService: TemplatePreviewService) {}

  ngOnInit(): void {
    this.onSampleDataChange(this.sampleDataJson);
  }

  ngOnChanges(): void {
    this.updatePreview();
  }

  onSampleDataChange(value: string): void {
    try {
      this.sampleData = JSON.parse(value);
    } catch {
      this.sampleData = {};
    }
    this.updatePreview();
  }

  private updatePreview(): void {
    this.previewHtml = this.previewService.compileTemplate(this.template, this.sampleData);
  }
}
