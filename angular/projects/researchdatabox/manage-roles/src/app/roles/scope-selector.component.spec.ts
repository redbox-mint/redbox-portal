import { ScopeSelectorComponent } from './scope-selector.component';

describe('ScopeSelectorComponent', () => {
  const active = {
    key: 'record.read',
    namespace: 'record',
    label: 'Read',
    description: 'Read records',
    risk: 'read' as const,
    sourceType: 'core' as const,
    sourcePackage: 'core',
    sourceVersion: '1',
    status: 'active' as const,
    metadataVersion: 1,
  };
  const orphaned = { ...active, key: 'record.legacy', label: 'Legacy', status: 'orphaned' as const };

  it('distinguishes base, removed, added, and effective scope state', () => {
    const component = new ScopeSelectorComponent();
    component.baseScopeKeys = ['record.read', 'record.update'];
    component.selectedScopeKeys = ['record.read', 'record.create'];
    expect(component.stateLabel(active)).toContain('base');
    expect(component.stateLabel({ ...active, key: 'record.update' })).toContain('removed');
    expect(component.stateLabel({ ...active, key: 'record.create' })).toContain('addition');
  });

  it('prevents newly selecting deprecated or orphaned scopes while retaining existing ones visibly', () => {
    const component = new ScopeSelectorComponent();
    component.selectedScopeKeys = [];
    expect(component.selectionDisabled(orphaned)).toBeTrue();
    component.selectedScopeKeys = [orphaned.key];
    expect(component.selectionDisabled(orphaned)).toBeFalse();
  });

  it('prevents broadening beyond the caller delegation ceiling while permitting removal', () => {
    const component = new ScopeSelectorComponent();
    component.delegableScopeKeys = ['record.read'];
    const outsideCeiling = { ...active, key: 'record.update' };

    expect(component.selectionDisabled(active)).toBeFalse();
    expect(component.selectionDisabled(outsideCeiling)).toBeTrue();
    expect(component.stateLabel(outsideCeiling)).toContain('Outside your current delegation ceiling');

    component.selectedScopeKeys = [outsideCeiling.key];
    expect(component.selectionDisabled(outsideCeiling)).toBeFalse();
  });
});
