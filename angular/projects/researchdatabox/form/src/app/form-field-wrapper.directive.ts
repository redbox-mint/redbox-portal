import { Directive, ViewContainerRef } from '@angular/core';

/**
 * Field directive for retrieving the VC
 *
 * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
 *
 */
@Directive({
  selector: '[formFieldComp]',
})
export class FormFieldWrapperDirective {
  constructor(public viewContainerRef: ViewContainerRef) { }
}
