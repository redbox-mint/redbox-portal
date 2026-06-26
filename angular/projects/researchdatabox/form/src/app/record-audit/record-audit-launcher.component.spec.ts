import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { UserService, I18NextPipe, ConfigService, getStubConfigService, TranslationService, getStubTranslationService, RecordAuditModule, RedboxPortalCoreModule } from '@researchdatabox/portal-ng-common';
import { RecordAuditLauncherComponent } from './record-audit-launcher.component';
import { Component } from '@angular/core';
import { A11yModule } from '@angular/cdk/a11y';

describe('RecordAuditLauncherComponent', () => {
  let fixture: ComponentFixture<RecordAuditLauncherComponent>;
  let component: RecordAuditLauncherComponent;
  let userService: jasmine.SpyObj<UserService>;

  beforeEach(async () => {
    userService = jasmine.createSpyObj<UserService>('UserService', [
      'waitForInit',
      'getInfo',
      'isInitializing',
    ]);
    userService.waitForInit.and.resolveTo(userService);
    userService.isInitializing.and.returnValue(false);

    await TestBed.configureTestingModule({
      declarations: [RecordAuditLauncherComponent],
      imports: [I18NextPipe, A11yModule, RecordAuditModule, RedboxPortalCoreModule],
      providers: [
        { provide: ConfigService, useValue: getStubConfigService() },
        { provide: TranslationService, useValue: getStubTranslationService() },
        { provide: UserService, useValue: userService },
      ],
    }).compileComponents();
  });

  function createComponent(overrides: { oid?: string; roles?: Array<{ name?: string }> } = {}) {
    userService.getInfo.and.resolveTo({
      user: {
        roles: overrides.roles ?? [],
      },
    } as any);

    fixture = TestBed.createComponent(RecordAuditLauncherComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('oid', overrides.oid ?? 'oid-123');
    fixture.detectChanges();
  }

  it('shows the button for Admin users when oid is present', async () => {
    createComponent({ oid: 'oid-123', roles: [{ name: 'Admin' }] });
    await fixture.whenStable();
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('.rb-form-audit-launch');
    expect(button).toBeTruthy();
    expect(component.canView()).toBeTrue();
    expect(component.isAdmin()).toBeTrue();
  });

  it('shows the button for Librarian users when oid is present', async () => {
    createComponent({ oid: 'oid-123', roles: [{ name: 'Librarians' }] });
    await fixture.whenStable();
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('.rb-form-audit-launch');
    expect(button).toBeTruthy();
    expect(component.canView()).toBeTrue();
    expect(component.isAdmin()).toBeFalse();
  });

  it('hides the button for Researcher users', async () => {
    createComponent({ oid: 'oid-123', roles: [{ name: 'Researcher' }] });
    await fixture.whenStable();
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('.rb-form-audit-launch');
    expect(button).toBeFalsy();
    expect(component.canView()).toBeFalse();
  });

  it('hides the button when oid is empty', async () => {
    createComponent({ oid: '', roles: [{ name: 'Admin' }] });
    await fixture.whenStable();
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('.rb-form-audit-launch');
    expect(button).toBeFalsy();
  });

  it('hides the button when getInfo throws', async () => {
    userService.getInfo.and.rejectWith(new Error('network error'));

    fixture = TestBed.createComponent(RecordAuditLauncherComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('oid', 'oid-123');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('.rb-form-audit-launch');
    expect(button).toBeFalsy();
    expect(component.canView()).toBeFalse();
  });

  it('opens the modal when the button is clicked', async () => {
    createComponent({ oid: 'oid-123', roles: [{ name: 'Admin' }] });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.isOpen()).toBeFalse();
    const button = fixture.nativeElement.querySelector('.rb-form-audit-launch');
    button.click();
    fixture.detectChanges();

    expect(component.isOpen()).toBeTrue();

    const modal = fixture.nativeElement.querySelector('.rb-audit-modal-overlay');
    expect(modal).toBeTruthy();
  });

  it('closes the modal when the close button is clicked', async () => {
    createComponent({ oid: 'oid-123', roles: [{ name: 'Admin' }] });
    await fixture.whenStable();
    fixture.detectChanges();

    component.open();
    fixture.detectChanges();
    expect(component.isOpen()).toBeTrue();

    const closeButton = fixture.nativeElement.querySelector('.btn-close');
    closeButton.click();
    fixture.detectChanges();

    expect(component.isOpen()).toBeFalse();
  });

  it('closes the modal on Escape key', async () => {
    createComponent({ oid: 'oid-123', roles: [{ name: 'Admin' }] });
    await fixture.whenStable();
    fixture.detectChanges();

    component.open();
    fixture.detectChanges();
    expect(component.isOpen()).toBeTrue();

    const overlay = fixture.nativeElement.querySelector('.rb-audit-modal-overlay');
    overlay.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();

    expect(component.isOpen()).toBeFalse();
  });
});
