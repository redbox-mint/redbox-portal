import { TestBed } from '@angular/core/testing';
import { TranslationService, getStubTranslationService } from '@researchdatabox/portal-ng-common';
import { PartyImportApiService } from './party-import-api.service';
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
  it('bounds the shared footer range on the last page and after an empty preview', () => {
    const component = new PartyImportComponent({} as any);
    component.preview = { rows: Array.from({ length: 51 }, (_, row) => ({ row })) };
    component.page = 1;
    expect(component.pageCount).toBe(2);
    expect(component.pageEnd).toBe(51);
    expect(component.rows.length).toBe(1);
    component.clearPreview();
    expect(component.pageCount).toBe(0);
    expect(component.pageEnd).toBe(0);
  });
  it('bounds and validates files before upload', async () => {
    const api: any = { request: jasmine.createSpy('request') };
    const component = new PartyImportComponent(api);
    await component.chooseFile({ target: { files: [{ name: 'huge.csv', size: 2 * 1024 * 1024 + 1 }] } } as any);
    expect(api.request).not.toHaveBeenCalled(); expect(component.error).toBeTruthy();
  });
});

describe('Party CSV preview footer', () => {
  it('uses the shared range and spaced pager and disables Next on the final page', async () => {
    await TestBed.configureTestingModule({
      imports: [PartyImportComponent],
      providers: [
        { provide: PartyImportApiService, useValue: {} },
        { provide: TranslationService, useValue: getStubTranslationService({ 'admin-vocabulary-pagination-range': 'Showing {{start}}-{{end}} of {{total}}' }) }
      ]
    }).compileComponents();
    const fixture = TestBed.createComponent(PartyImportComponent);
    fixture.componentInstance.preview = { rows: Array.from({ length: 51 }, (_, row) => ({ row, metadata: { fullName: 'Name', email: 'name@example.test' }, status: 'valid', reasons: [] })) };
    fixture.detectChanges();
    const footer: HTMLElement = fixture.nativeElement.querySelector('rb-admin-list-footer');
    expect(footer.textContent).toContain('Showing 1-50 of 51');
    const buttons = footer.querySelectorAll('button');
    expect(buttons[0].disabled).toBeTrue();
    buttons[1].click(); fixture.detectChanges();
    expect(footer.textContent).toContain('Showing 51-51 of 51');
    expect(buttons[1].disabled).toBeTrue();
    expect(buttons[0].disabled).toBeFalse();
    fixture.destroy();
  });
});
