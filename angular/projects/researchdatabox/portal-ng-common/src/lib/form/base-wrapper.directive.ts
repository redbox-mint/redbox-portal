import { Directive, ViewContainerRef } from '@angular/core';

/**
 * Field directive for retrieving the ViewContainerRef
 *
 * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
 *
 */
@Directive({
    selector: '[redboxBaseWrapper]',
    standalone: false
})
export class BaseWrapperDirective {
  constructor(public viewContainerRef: ViewContainerRef) { }
}
