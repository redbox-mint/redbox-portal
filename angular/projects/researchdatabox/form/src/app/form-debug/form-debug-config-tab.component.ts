import { CommonModule } from '@angular/common';
import { Component, ChangeDetectionStrategy } from '@angular/core';
import { FormDebugStateService } from './form-debug-state.service';

@Component({
  selector: 'redbox-form-debug-config-tab',
  templateUrl: './form-debug-config-tab.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  standalone: true
})
export class FormDebugConfigTabComponent {
  constructor(public readonly debugState: FormDebugStateService) {}
}
