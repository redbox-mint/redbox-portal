import { Component, Input, ViewEncapsulation } from '@angular/core';
import { TreeNode } from 'angular-tree-component';

@Component({
  selector: 'rb-tree-node-checkbox',
  encapsulation: ViewEncapsulation.None,
  styles: [],
  template: `
    <ng-container *mobxAutorun="{dontDetach: true}">
      <input
        class="tree-node-checkbox"
        type="checkbox"
        [attr.aria-label]="ariaLabel" 
        (click)="node.mouseAction('checkboxClick', $event)"
        [checked]="node.isSelected"
        [indeterminate]="node.isPartiallySelected"/>
    </ng-container>
  `
})
export class TreeNodeCheckboxComponent {
  @Input() node: TreeNode;
  @Input() ariaLabel: string;
}
