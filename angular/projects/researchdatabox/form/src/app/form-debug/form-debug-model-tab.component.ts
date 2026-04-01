import { Component } from '@angular/core';
import { FormDebugStateService } from './form-debug-state.service';

@Component({
  selector: 'redbox-form-debug-model-tab',
  templateUrl: './form-debug-model-tab.component.html',
  standalone: false
})
export class FormDebugModelTabComponent {
  constructor(public readonly debugState: FormDebugStateService) {}
}
