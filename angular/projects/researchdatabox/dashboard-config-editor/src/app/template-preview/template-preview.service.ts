import { Injectable } from '@angular/core';

@Injectable()
export class TemplatePreviewService {
  compileTemplate(template: string, sampleData: Record<string, unknown>): string {
    // Simple Handlebars-like compilation for preview purposes
    let result = template;
    for (const [key, value] of Object.entries(sampleData)) {
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
      result = result.replace(regex, String(value ?? ''));
    }
    return result;
  }
}
