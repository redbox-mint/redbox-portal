import { Component, EventEmitter, Input, Output } from '@angular/core';
import { AuthorizationScope } from '../authorization-admin.models';

const RISK_ORDER = ['read', 'write', 'admin', 'system'] as const;

interface ScopeGroup {
  namespace: string;
  scopes: AuthorizationScope[];
}

@Component({
  selector: 'authorization-scope-selector',
  templateUrl: './scope-selector.component.html',
  styleUrls: ['./scope-selector.component.scss'],
  standalone: false,
})
export class ScopeSelectorComponent {
  @Input() public scopes: AuthorizationScope[] = [];
  @Input() public baseScopeKeys: string[] = [];
  @Input() public selectedScopeKeys: string[] = [];
  @Input() public delegableScopeKeys: string[] = [];
  @Input() public disabled = false;
  @Output() public readonly selectedScopeKeysChange = new EventEmitter<string[]>();

  public filter = '';

  public get groups(): ScopeGroup[] {
    const needle = this.filter.trim().toLowerCase();
    const grouped = new Map<string, AuthorizationScope[]>();
    for (const scope of this.scopes) {
      if (needle && !`${scope.key} ${scope.label} ${scope.description}`.toLowerCase().includes(needle)) continue;
      grouped.set(scope.namespace, [...(grouped.get(scope.namespace) ?? []), scope]);
    }
    return [...grouped.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([namespace, scopes]) => ({
        namespace,
        scopes: scopes.sort(
          (left, right) =>
            RISK_ORDER.indexOf(left.risk) - RISK_ORDER.indexOf(right.risk) || left.key.localeCompare(right.key)
        ),
      }));
  }

  public isSelected(scopeKey: string): boolean {
    return this.selectedScopeKeys.includes(scopeKey);
  }
  public isBase(scopeKey: string): boolean {
    return this.baseScopeKeys.includes(scopeKey);
  }

  public stateLabel(scope: AuthorizationScope): string {
    const delegationState = this.delegableScopeKeys.includes(scope.key)
      ? ''
      : ' · Outside your current delegation ceiling';
    if (this.isBase(scope.key) && this.isSelected(scope.key)) return `Template base · effective${delegationState}`;
    if (this.isBase(scope.key)) return `Template base · removed${delegationState}`;
    if (this.isSelected(scope.key)) return `Local addition · effective${delegationState}`;
    return `Not granted${delegationState}`;
  }

  public selectionDisabled(scope: AuthorizationScope): boolean {
    return (
      this.disabled ||
      (!this.isSelected(scope.key) && (scope.status !== 'active' || !this.delegableScopeKeys.includes(scope.key)))
    );
  }

  public toggle(scope: AuthorizationScope, checked: boolean): void {
    if (this.selectionDisabled(scope)) return;
    const selected = new Set(this.selectedScopeKeys);
    if (checked) selected.add(scope.key);
    else selected.delete(scope.key);
    this.selectedScopeKeysChange.emit([...selected].sort());
  }

  public onToggle(scope: AuthorizationScope, event: Event): void {
    const input = event.target;
    if (input instanceof HTMLInputElement) {
      this.toggle(scope, input.checked);
    }
  }
}
