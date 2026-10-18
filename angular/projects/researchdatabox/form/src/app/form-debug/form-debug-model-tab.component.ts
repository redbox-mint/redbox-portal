import { CommonModule } from '@angular/common';
import { Component, ChangeDetectionStrategy } from '@angular/core';
import { FormDebugStateService } from './form-debug-state.service';

@Component({
  selector: 'redbox-form-debug-model-tab',
  templateUrl: './form-debug-model-tab.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  standalone: true
})
export class FormDebugModelTabComponent {
  constructor(public readonly debugState: FormDebugStateService) {}
}
