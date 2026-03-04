import { Component } from '@angular/core';
import { FormDebugStateService } from './form-debug-state.service';

@Component({
  selector: 'redbox-form-debug-config-tab',
  templateUrl: './form-debug-config-tab.component.html',
  standalone: false
})
export class FormDebugConfigTabComponent {
  constructor(public readonly debugState: FormDebugStateService) {}
}
