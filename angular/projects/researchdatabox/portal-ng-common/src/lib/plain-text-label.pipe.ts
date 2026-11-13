import { Pipe, PipeTransform } from '@angular/core';
import { labelToPlainText } from './label-to-plain-text';

@Pipe({ name: 'plainTextLabel', standalone: true })
export class PlainTextLabelPipe implements PipeTransform {
  transform(label: string): string {
    return labelToPlainText(label);
  }
}
