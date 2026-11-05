import { PartyImportComponent } from './party-import.component';
describe('PartyImportComponent', () => {
  it('clears a stale preview when mapping changes and consumes apply before sending', async () => {
    const api: any = { request: jasmine.createSpy('request').and.resolveTo({ rows: [{ row: 2, status: 'saved' }] }) };
    const component = new PartyImportComponent(api);
    component.content = 'Name,Email\nA,a@b.org'; component.mapping = { fullName: 0, email: 1, orcid: null };
    component.preview = { token: 'one-use', valid: 1 };
    await component.run('apply');
    expect(api.request).toHaveBeenCalledWith('apply', { csv: component.content, mapping: { fullName: 0, email: 1 }, token: 'one-use' });
    await component.run('apply'); expect(api.request).toHaveBeenCalledTimes(1);
    component.clearPreview(); expect(component.results).toBeNull(); expect(component.preview).toBeNull();
  });
  it('bounds and validates files before upload', async () => {
    const api: any = { request: jasmine.createSpy('request') };
    const component = new PartyImportComponent(api);
    await component.chooseFile({ target: { files: [{ name: 'huge.csv', size: 2 * 1024 * 1024 + 1 }] } } as any);
    expect(api.request).not.toHaveBeenCalled(); expect(component.error).toBeTruthy();
  });
});
