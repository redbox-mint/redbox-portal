import { Component } from '@angular/core';
import { FieldType } from '@ngx-formly/core';

@Component({
    selector: 'formly-textarea-type',
    template: `
  <textarea [id]="id" [class.is-invalid]="showError" 
              [formlyAttributes]="field" class="form-control"></textarea>
  `,
    standalone: false
})
export class TextAreaComponent extends FieldType {}