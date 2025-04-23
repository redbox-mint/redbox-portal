import { Directive, ViewContainerRef } from '@angular/core';

/**
 * Field directive for retrieving the ViewContainerRef
 *
 * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
 *
 */
@Directive({
    selector: '[redboxFormBaseWrapper]',
    standalone: false
})
export class FormBaseWrapperDirective {
  constructor(public viewContainerRef: ViewContainerRef) { }
}
