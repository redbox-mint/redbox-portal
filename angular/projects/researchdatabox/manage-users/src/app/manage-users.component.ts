import { Component, Inject, ViewChild, inject, ChangeDetectionStrategy } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { AdminDateService } from '@researchdatabox/portal-ng-common';

import { ModalDirective } from 'ngx-bootstrap/modal';
import { FormArray, FormGroup, FormControl, Validators, FormBuilder } from '@angular/forms';
import {
  Role,
  User,
  LinkedUserSummary,
  UserLinkCandidate,
  UserLinkResponse,
  UserAuditRecord,
  UserAuditResponse,
  BaseComponent,
  LoggerService,
  TranslationService,
  UserService,
} from '@researchdatabox/portal-ng-common';
import { UserForm, matchingValuesValidator, optionalEmailValidator, passwordStrengthValidator } from './forms';
import * as _ from 'lodash';

type ManageUser = User & {
  roleStr?: string;
  token?: string;
  roles: Role[];
  accountLinkState?: 'active' | 'linked-alias';
  linkedPrimaryUserId?: string;
  effectivePrimaryUsername?: string;
  linkedAccountCount?: number;
  loginDisabled?: boolean;
  effectiveLoginDisabled?: boolean;
  disabledByPrimaryUserId?: string;
  disabledByPrimaryUsername?: string;
};

type AccountStatusUser = {
  accountLinkState?: string;
  effectivePrimaryUsername?: string;
  linkedAccountCount?: number;
};

type RoleSelection = {
  key?: string | null;
  value?: string | null;
  checked?: boolean | null;
};

type UserFilterOption = {
  value: string | null;
  label: string;
  checked: boolean;
};

type UserDetailsPayload = {
  name: string;
  email: string;
  password: string;
  roles: string[];
};

type SaveResponse = {
  status: boolean;
  message: string;
};

type AuditModalUser = Pick<ManageUser, 'id' | 'username' | 'name' | 'email' | 'type'>;

type LinkingUserService = UserService & {
  getUserLinks: (primaryUserId: string) => Promise<UserLinkResponse>;
  searchLinkCandidates: (primaryUserId: string, query: string) => Promise<UserLinkCandidate[]>;
  linkAccounts: (primaryUserId: string, secondaryUserId: string) => Promise<UserLinkResponse>;
  getUserAudit: (userId: string) => Promise<UserAuditResponse>;
  disableUser: (userId: string) => Promise<{ status: boolean; message: string }>;
  enableUser: (userId: string) => Promise<{ status: boolean; message: string }>;
};

@Component({
  selector: 'manage-users',
  templateUrl: './manage-users.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false,
})
export class ManageUsersComponent extends BaseComponent {
  readonly adminDates = inject(AdminDateService);

  title = '@researchdatabox/manage-users';
  roleFilter = '';
  signInFilter = '';
  signInMethods: string[] = [];
  usersLoading = false;
  page = 1;
  readonly pageSize = 25;
  totalUsers = 0;
  sort: 'name' | 'username' | 'email' | 'type' | 'lastLogin' = 'name';
  order: 'asc' | 'desc' = 'asc';
  get totalPages(): number { return Math.max(1, Math.ceil(this.totalUsers / this.pageSize)); }
  get pageStart(): number { return this.filteredUsers.length ? (this.page - 1) * this.pageSize + 1 : 0; }
  async changePage(page: number): Promise<void> {
    if (this.usersLoading || page === this.page) return;
    try { await this.refreshUsers(page); } catch { /* The list error is visible. */ }
  }
  sortUsers(): void { this.order = this.order === 'asc' ? 'desc' : 'asc'; void this.onFilterChange(); }
  private usersRequest = 0;
  pendingUserAction: { kind: 'disable' | 'revoke'; user: ManageUser } | null = null;
  confirmDiscard: 'details' | 'new' | null = null;
  private detailsSnapshot = '';
  private newSnapshot = '';

  get detailsDirty(): boolean { return !!this.updateUserForm && JSON.stringify(this.updateUserForm.getRawValue()) !== this.detailsSnapshot; }
  get newDirty(): boolean { return !!this.newUserForm && JSON.stringify(this.newUserForm.getRawValue()) !== this.newSnapshot; }

  keepEditing(): void { this.confirmDiscard = null; this.detailsDestination = null; }
  discardEditor(): void {
    const editor = this.confirmDiscard;
    this.confirmDiscard = null;
    if (editor === 'details') this.hideDetailsModal(true);
    if (editor === 'new') this.hideNewUserModal(true);
  }
  actionPending = false;
  actionError = '';
  keyPending = false;
  @ViewChild('userActionModal') userActionModal?: ModalDirective;

  requestUserAction(kind: 'disable' | 'revoke', user: ManageUser) {
    this.actionError = '';
    this.pendingUserAction = { kind, user };
  }

  async confirmUserAction() {
    if (!this.pendingUserAction || this.actionPending) return;
    const { kind, user } = this.pendingUserAction;
    this.actionPending = true;
    this.actionError = '';
    try {
      const response = kind === 'disable' ? await this.userService.disableUser(user.id) : await this.userService.revokeKey(user.id) as unknown as SaveResponse;
      if (!response.status) {
        this.actionError = response.message || this.translationService.t('admin-users-action-error');
        return;
      }
      if (kind === 'revoke') user.token = '';
      if (this.currentUser?.id === user.id) {
        if (kind === 'revoke') this.currentUser.token = '';
        else { this.currentUser.loginDisabled = true; this.currentUser.effectiveLoginDisabled = true; }
      }
      this.userActionModal?.hide();
      this.setUpdateMessage(this.translationService.t(kind === 'disable' ? 'manage-users-disable-success' : 'admin-users-key-revoked'), 'success');
      await this.refreshUsers();
    } catch (error) {
      this.actionError = (error as Error)?.message || this.translationService.t('admin-users-action-error');
    } finally {
      this.actionPending = false;
    }
  }

  keyAction(user: ManageUser) {
    if (user.token) this.requestUserAction('revoke', user);
    else { this.editUser(user.username); this.genKey(user.id); }
  }


  allUsers: ManageUser[] = [];
  filteredUsers: ManageUser[] = [];
  allRoles: Role[] = [];

  searchFilter: {
    name: string;
    prevName: string;
    users: UserFilterOption[];
  } = {
    name: '',
    prevName: '',
    users: [{ value: null, label: 'Any', checked: true }],
  };

  hiddenUsers: string[] = [''];
  currentUser: ManageUser | null = null;

  updateDetailsMsg: string = '';
  updateDetailsMsgType: string = 'info';
  newUserMsg: string = '';
  newUserMsgType: string = 'info';

  @ViewChild('userDetailsModal', { static: false }) userDetailsModal?: ModalDirective;
  @ViewChild('userNewModal', { static: false }) userNewModal?: ModalDirective;
  @ViewChild('userLinkModal', { static: false }) userLinkModal?: ModalDirective;
  @ViewChild('userAuditModal', { static: false }) userAuditModal?: ModalDirective;

  isDetailsModalShown: boolean = false;
  detailsDestination: 'links' | 'audit' | null = null;
  isNewUserModalShown: boolean = false;
  isLinkModalShown: boolean = false;
  isAuditModalShown: boolean = false;
  updateUserForm: FormGroup | null = null;
  newUserForm: FormGroup | null = null;
  submitted: boolean = false;
  showToken: boolean = false;
  linkPrimaryUser: ManageUser | null = null;
  linkedAccounts: LinkedUserSummary[] = [];
  linkCandidates: UserLinkCandidate[] = [];
  linkSearchQuery: string = '';
  selectedLinkCandidate: UserLinkCandidate | null = null;
  linkMsg: string = '';
  linkMsgType: string = 'info';
  isLinkSearchLoading: boolean = false;
  isLinkSaving: boolean = false;
  showDisabledUsers: boolean = false;
  auditModalUser: AuditModalUser | null = null;
  auditRecords: UserAuditRecord[] = [];
  auditExpandedRows: Record<string, boolean> = {};
  isAuditLoading: boolean = false;
  auditError: string = '';
  auditSummary: { returnedCount: number; truncated: boolean } = { returnedCount: 0, truncated: false };

  constructor(
    @Inject(LoggerService) private loggerService: LoggerService,
    @Inject(TranslationService) private translationService: TranslationService,
    @Inject(UserService) private userService: LinkingUserService,
    @Inject(FormBuilder) private _fb: FormBuilder
  ) {
    super();
    this.loggerService.debug(`Manage Users waiting for deps to init...`);
    this.initDependencies = [this.translationService, this.userService];
  }

  protected override async initComponent(): Promise<void> {
    this.brandingAndPortalUrl = this.userService.brandingAndPortalUrl;
    const roles = await this.userService.getBrandRoles() as unknown as Role[];
    this.allRoles = [...roles];
    this.signInMethods = (await this.userService.getUserOptions()).signInMethods;
    await this.refreshUsers();
  }

  setupForms(newUser: boolean) {
    this.submitted = false;

    if (newUser) {
      const newRolesControlArray = new FormArray(
        this.allRoles.map(role => {
          return new FormGroup({
            key: new FormControl(role.id),
            value: new FormControl(role.name),
            checked: new FormControl(false),
          });
        })
      );

      const pwGroup_new = this._fb.group({
        password: [''],
        confirmPassword: [''],
      });
      pwGroup_new.setValidators([
        matchingValuesValidator('password', 'confirmPassword'),
        passwordStrengthValidator('confirmPassword'),
      ]);

      this.newUserForm = this._fb.group({
        username: ['', Validators.required],
        name: ['', Validators.required],
        email: ['', optionalEmailValidator],
        passwords: pwGroup_new,
        allRoles: newRolesControlArray,
        roles: [this.mapRoles(newRolesControlArray.value), Validators.required],
      });

      this.newSnapshot = JSON.stringify(this.newUserForm.getRawValue());

      newRolesControlArray.valueChanges.subscribe((v) => {
        this.newUserForm?.controls['roles'].setValue(this.mapRoles(v));
      });
    } else {
      if (this.currentUser == null) {
        return;
      }

      const currentUser = this.currentUser;
      const updateRolesControlArray = new FormArray(
        this.allRoles.map(role => {
          return new FormGroup({
            key: new FormControl(role.id),
            value: new FormControl(role.name),
            checked: new FormControl(
              _.includes(
                _.flatMap(currentUser.roles, existingRole => {
                  return existingRole['name'];
                }),
                role.name
              )
            ),
          });
        })
      );

      const pwGroup_update = this._fb.group({
        password: [''],
        confirmPassword: [''],
      });

      pwGroup_update.setValidators([
        matchingValuesValidator('password', 'confirmPassword'),
        passwordStrengthValidator('confirmPassword'),
      ]);

      this.updateUserForm = this._fb.group({
        userid: this.currentUser.id,
        username: this.currentUser.username,
        name: [this.currentUser.name, Validators.required],
        email: [this.currentUser.email, optionalEmailValidator],
        passwords: pwGroup_update,
        allRoles: updateRolesControlArray,
        roles: [this.mapRoles(updateRolesControlArray.value), Validators.required],
      });

      this.detailsSnapshot = JSON.stringify(this.updateUserForm.getRawValue());

      updateRolesControlArray.valueChanges.subscribe((v) => {
        this.updateUserForm?.controls['roles'].setValue(this.mapRoles(v));
      });
    }
  }

  mapRoles(roles: RoleSelection[]): Role[] | null {
    const selectedRoles = roles
      .filter(role => role.checked && role.key != null && role.value != null)
      .map(roleSelection => {
        const ret: Role = {
          id: '',
          name: '',
          users: [],
          hasRole: true,
        };
        ret.id = roleSelection.key as string;
        ret.name = roleSelection.value as string;
        return ret;
      });
    return selectedRoles.length ? selectedRoles : null;
  }

  async refreshUsers(page = this.page) {
    const request = ++this.usersRequest;
    this.usersLoading = true;
    try {
      const result = await this.userService.getUserPage({ page, pageSize: this.pageSize,
        includeDisabled: this.showDisabledUsers, signIn: this.signInFilter,
        query: this.searchFilter.name.trim(), role: this.roleFilter, sort: this.sort, order: this.order });
      if (request !== this.usersRequest) return;
      this.page = result.summary.page;
      this.totalUsers = result.summary.numFound;
      this.allUsers = result.records as ManageUser[];
      this.filteredUsers = this.allUsers;
      this.filteredUsers.forEach(user => user.roleStr = user.roles.map(role => role.name).join(', '));
    } catch (error) {
      if (request === this.usersRequest) this.setUpdateMessage(this.translationService.t('admin-users-load-error'), 'danger');
      throw error;
    } finally {
      if (request === this.usersRequest) this.usersLoading = false;
    }
  }

  editUser(username: string) {
    this.showToken = false;
    this.setUpdateMessage();
    const user = _.find(this.allUsers, existingUser => {
      return existingUser.username == username;
    });
    if (!_.isUndefined(user)) {
      this.currentUser = user;
    }
    this.setupForms(false);
    this.showDetailsModal();
  }

  newUser() {
    this.setNewUserMessage();
    this.setupForms(true);
    this.showNewUserModal();
  }

  showDetailsModal(): void {
    this.isDetailsModalShown = true;
    this.userDetailsModal?.show();
  }

  hideDetailsModal(force = false): void {
    if (this.pendingUserAction || this.confirmDiscard) return;
    if (!force && this.detailsDirty) { this.confirmDiscard = 'details'; return; }
    if (!_.isUndefined(this.userDetailsModal)) {
      this.userDetailsModal.hide();
    }
  }

  navigateFromDetails(destination: 'links' | 'audit'): void {
    this.detailsDestination = destination;
    this.hideDetailsModal();
  }

  onDetailsModalHidden(): void {
    this.isDetailsModalShown = false;
    // Finish the old modal's backdrop/scroll cleanup before opening the next one.
    const destination = this.detailsDestination;
    this.detailsDestination = null;
    if (!this.currentUser) return;
    if (destination === 'links') this.manageLinks(this.currentUser.username);
    if (destination === 'audit') this.viewAudit(this.currentUser);
  }

  showNewUserModal(): void {
    this.isNewUserModalShown = true;
  }

  hideNewUserModal(force = false): void {
    if (this.confirmDiscard) return;
    if (!force && this.newDirty) { this.confirmDiscard = 'new'; return; }
    if (!_.isUndefined(this.userNewModal)) {
      this.userNewModal.hide();
    }
  }

  onNewUserHidden(): void {
    this.isNewUserModalShown = false;
  }

  showLinkModal(): void {
    this.isLinkModalShown = true;
    this.userLinkModal?.show();
  }

  hideLinkModal(): void {
    if (!_.isUndefined(this.userLinkModal)) {
      this.userLinkModal.hide();
    }
  }

  onLinkModalHidden(): void {
    this.isLinkModalShown = false;
    this.linkPrimaryUser = null;
    this.linkedAccounts = [];
    this.linkCandidates = [];
    this.linkSearchQuery = '';
    this.selectedLinkCandidate = null;
    this.setLinkMessage();
  }

  showAuditModal(): void {
    this.isAuditModalShown = true;
    this.userAuditModal?.show();
  }

  hideAuditModal(): void {
    if (!_.isUndefined(this.userAuditModal)) {
      this.userAuditModal.hide();
    }
  }

  onAuditModalHidden(): void {
    this.isAuditModalShown = false;
    this.auditModalUser = null;
    this.auditRecords = [];
    this.auditExpandedRows = {};
    this.isAuditLoading = false;
    this.auditError = '';
    this.auditSummary = { returnedCount: 0, truncated: false };
  }

  async genKey(userid: string) {
    if (this.keyPending) return;
    this.keyPending = true;
    this.setUpdateMessage(this.translationService.t('admin-users-key-generating'), 'info');
    try {
      const result = await this.userService.genKey(userid) as unknown as SaveResponse;
      // A request may finish after the user closes the editor and opens another.
      if (this.currentUser?.id === userid) {
        if (result.status) {
          this.showToken = true;
          this.currentUser.token = result.message;
        }
        this.setUpdateMessage(result.status ? this.translationService.t('admin-users-key-generated') : result.message, result.status ? 'success' : 'danger');
      }
      if (result.status) await this.refreshUsers();
    } catch (error) {
      this.setUpdateMessage((error as Error)?.message || this.translationService.t('admin-users-action-error'), 'danger');
    } finally {
      this.keyPending = false;
    }
  }

  private readonly document = inject(DOCUMENT);

  fieldInvalid(form: FormGroup, path: string): boolean {
    const control = form.get(path);
    const shown = this.submitted || control?.touched;
    if (!shown) return false;
    if (path === 'passwords.password') return !!(control?.invalid || form.get('passwords')?.hasError('passwordStrength'));
    if (path === 'passwords.confirmPassword') return !!(control?.invalid || form.get('passwords')?.hasError('mismatched') || form.get('passwords')?.hasError('passwordStrength'));
    return !!control?.invalid;
  }

  private focusInvalidUserField(form: FormGroup | null, formId: string): void {
    if (!form) return;
    form.markAllAsTouched();
    const fields = ['username', 'name', 'email', 'passwords.password', 'passwords.confirmPassword', 'roles'];
    const path = fields.find(field => this.fieldInvalid(form, field));
    const selector = path === 'roles' ? '[formControlName="checked"]' : `[formControlName="${path?.split('.').pop()}"]`;
    this.document.querySelector<HTMLElement>(`#${formId} ${selector}`)?.focus();
  }

  async updateUserSubmit(user: UserForm, isValid: boolean) {
    this.submitted = true;
    if (!isValid) {
      this.setUpdateMessage(this.translationService.t('manage-users-validation-submit'), 'danger');
      this.focusInvalidUserField(this.updateUserForm, 'detailsform');
      return;
    }
    const details: UserDetailsPayload = {
      name: user.name,
      email: user.email,
      password: user.passwords.password,
      roles: [],
    };
    _.forEach(user.roles, role => {
      details.roles.push(role.name);
    });
    this.setUpdateMessage(this.translationService.t('admin-users-saving'), 'info');

    const saveRes = (await this.userService.updateUserDetails(user.userid, details)) as unknown as SaveResponse;
    if (saveRes.status) {
      this.hideDetailsModal(true);
      await this.refreshUsers();
      this.setUpdateMessage();
    } else {
      this.setUpdateMessage(saveRes.message, 'danger');
    }
  }

  async newUserSubmit(user: UserForm, isValid: boolean) {
    this.submitted = true;
    if (!isValid) {
      this.setNewUserMessage(this.translationService.t('manage-users-validation-submit'), 'danger');
      this.focusInvalidUserField(this.newUserForm, 'newform');
      return;
    }
    const details: UserDetailsPayload = {
      name: user.name,
      email: user.email,
      password: user.passwords.password,
      roles: [],
    };

    _.forEach(user.roles, role => {
      details.roles.push(role.name);
    });

    this.setNewUserMessage(this.translationService.t('admin-users-saving'), 'info');
    const saveRes = await this.userService.addLocalUser(user.username, details) as unknown as SaveResponse;
    if (saveRes.status) {
      this.hideNewUserModal(true);
      await this.refreshUsers();
      this.setNewUserMessage();
    } else {
      this.setNewUserMessage(saveRes.message, 'danger');
    }
  }

  setUpdateMessage(msg: string = '', type: string = 'primary') {
    this.updateDetailsMsg = msg;
    this.updateDetailsMsgType = type;
  }

  setNewUserMessage(msg: string = '', type: string = 'primary') {
    this.newUserMsg = msg;
    this.newUserMsgType = type;
  }

  setLinkMessage(msg: string = '', type: string = 'primary') {
    this.linkMsg = msg;
    this.linkMsgType = type;
  }

  getAuditTitle(): string {
    const label = this.auditModalUser?.name || this.auditModalUser?.username || '';
    return (
      this.translationService.t('manage-users-audit-modal-title', '', { user: label }) || `Audit history for ${label}`
    );
  }

  getAuditActor(record: UserAuditRecord): string {
    const actorParts: string[] = [record.actor.username];
    if (!_.isEmpty(record.actor.name)) {
      actorParts.push(String(record.actor.name));
    }
    if (!_.isEmpty(record.actor.email)) {
      actorParts.push(String(record.actor.email));
    }
    return actorParts.filter(part => !_.isEmpty(part)).join(' | ');
  }

  getAuditActionLabel(record: UserAuditRecord): string {
    return record.action;
  }

  getAuditDetailsLabel(record: UserAuditRecord): string {
    if (record.action === 'login') {
      return this.translationService.t('manage-users-audit-event-login') || record.details;
    }
    if (record.action === 'logout') {
      return this.translationService.t('manage-users-audit-event-logout') || record.details;
    }
    if (record.action === 'disable-user') {
      return this.translationService.t('manage-users-audit-event-disable') || record.details;
    }
    if (record.action === 'enable-user') {
      return this.translationService.t('manage-users-audit-event-enable') || record.details;
    }
    if (record.action === 'link-accounts') {
      const context = record.parsedAdditionalContext as Record<string, unknown> | null;
      if (context != null && this.auditModalUser != null) {
        if (String(context['primaryUserId'] ?? '') === this.auditModalUser.id) {
          return this.translationService.t('manage-users-audit-event-link-primary') || record.details;
        }
        if (String(context['secondaryUserId'] ?? '') === this.auditModalUser.id) {
          return this.translationService.t('manage-users-audit-event-link-secondary') || record.details;
        }
      }
      return this.translationService.t('manage-users-audit-event-link-generic') || record.details;
    }
    return record.details;
  }

  formatAuditTimestamp(timestamp: string | null): string {
    if (_.isEmpty(timestamp)) {
      return '';
    }
    return this.adminDates.format(timestamp);
  }

  isAuditRowExpanded(recordId: string): boolean {
    return this.auditExpandedRows[recordId] === true;
  }

  toggleAuditRow(recordId: string): void {
    this.auditExpandedRows[recordId] = !this.isAuditRowExpanded(recordId);
  }

  getAuditToggleLabel(recordId: string): string {
    const translationKey = this.isAuditRowExpanded(recordId)
      ? 'manage-users-audit-raw-hide'
      : 'manage-users-audit-raw-toggle';
    return this.translationService.t(translationKey) || translationKey;
  }

  getAuditRawContent(record: UserAuditRecord): string {
    if (record.parseError) {
      return record.rawAdditionalContext || '';
    }

    if (record.parsedAdditionalContext == null) {
      return record.rawAdditionalContext || '';
    }

    if (_.isString(record.parsedAdditionalContext)) {
      return String(record.parsedAdditionalContext);
    }

    try {
      return JSON.stringify(record.parsedAdditionalContext, null, 2);
    } catch {
      return record.rawAdditionalContext || '';
    }
  }

  async viewAudit(user: ManageUser) {
    this.auditModalUser = {
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      type: user.type,
    };
    this.auditRecords = [];
    this.auditExpandedRows = {};
    this.auditError = '';
    this.auditSummary = { returnedCount: 0, truncated: false };
    this.isAuditLoading = true;
    this.showAuditModal();

    try {
      const response = await this.userService.getUserAudit(user.id);
      this.auditModalUser = response.user || this.auditModalUser;
      this.auditRecords = response.records || [];
      this.auditSummary = response.summary || { returnedCount: this.auditRecords.length, truncated: false };
    } catch (error: unknown) {
      this.loggerService.error('Failed to load user audit:', error);
      this.auditError =
        (error as Error)?.message ||
        this.translationService.t('manage-users-audit-error') ||
        'Failed to load audit history.';
      this.auditRecords = [];
      this.auditSummary = { returnedCount: 0, truncated: false };
    } finally {
      this.isAuditLoading = false;
    }
  }

  private buildLinkSuccessMessage(response: UserLinkResponse): string {
    const baseMessage = this.translationService.t('manage-users-link-success') || 'Accounts linked successfully.';
    const rolesMerged = response.impact?.rolesMerged ?? 0;
    const recordsRewritten = response.impact?.recordsRewritten ?? 0;

    if (rolesMerged === 0 && recordsRewritten === 0) {
      return baseMessage;
    }

    const impactDetails: string[] = [];
    if (rolesMerged > 0) {
      impactDetails.push(
        this.translationService.t('manage-users-link-success-roles-merged', '', { count: rolesMerged }) ||
          `${rolesMerged} ${rolesMerged === 1 ? 'role' : 'roles'} merged`
      );
    }
    if (recordsRewritten > 0) {
      impactDetails.push(
        this.translationService.t('manage-users-link-success-records-rewritten', '', { count: recordsRewritten }) ||
          `${recordsRewritten} ${recordsRewritten === 1 ? 'record' : 'records'} rewritten`
      );
    }

    return `${baseMessage} — ${impactDetails.join(', ')}`;
  }

  async toggleShowDisabled() {
    this.showDisabledUsers = !this.showDisabledUsers;
    await this.onFilterChange();
  }

  async disableUser(user: ManageUser) {
    try {
      const response = await this.userService.disableUser(user.id);
      if (response.status) {
        this.setUpdateMessage(
          this.translationService.t('manage-users-disable-success') || 'User disabled successfully.',
          'success'
        );
        await this.refreshUsers();
      } else {
        this.setUpdateMessage(response.message || 'Failed to disable user.', 'danger');
      }
    } catch (error: unknown) {
      this.setUpdateMessage((error as Error)?.message || 'Failed to disable user.', 'danger');
    }
  }

  async enableUser(user: ManageUser) {
    try {
      const response = await this.userService.enableUser(user.id);
      if (response.status) {
        user.loginDisabled = false;
        user.effectiveLoginDisabled = false;
        this.setUpdateMessage(this.translationService.t('manage-users-enable-success') || 'User enabled successfully.', 'success');
        await this.refreshUsers();
      } else {
        this.setUpdateMessage(response.message || 'Failed to enable user.', 'danger');
      }
    } catch (error: unknown) {
      this.setUpdateMessage((error as Error)?.message || 'Failed to enable user.', 'danger');
    }
  }

  isEffectivelyDisabled(user: ManageUser): boolean {
    return user.effectiveLoginDisabled === true;
  }

  isDirectlyDisabled(user: ManageUser): boolean {
    return user.loginDisabled === true;
  }

  isDisabledViaPrimary(user: ManageUser): boolean {
    return (
      user.effectiveLoginDisabled === true && user.loginDisabled !== true && !_.isEmpty(user.disabledByPrimaryUsername)
    );
  }

  async onFilterChange() {
    this.searchFilter.prevName = this.searchFilter.name;
    try { await this.refreshUsers(1); } catch { /* refreshUsers presents the error. */ }
  }

  async changeSignInFilter() { await this.onFilterChange(); }

  async resetFilter() {
    this.showDisabledUsers = false;
    this.signInFilter = '';
    this.searchFilter.name = '';
    this.roleFilter = '';
    await this.onFilterChange();
  }

  isUpdateUserFormConfirmPasswordTouched() {
    const passControls = ((this.updateUserForm as FormGroup).controls['passwords'] as FormGroup).controls;
    if (passControls['confirmPassword'] && passControls['confirmPassword'].touched) {
      return true;
    }
    return false;
  }

  getUpdateUserPasswordErrors() {
    const errors = (this.updateUserForm as FormGroup).controls['passwords'].errors as {
      passwordStrengthDetails?: { errors: string[] };
    } | null;
    const errorMessages: string[] = [];
    if (errors?.passwordStrengthDetails) {
      for (const errorMsg of errors.passwordStrengthDetails.errors) {
        errorMessages.push(errorMsg);
      }
    }

    return errorMessages;
  }

  getNewUserPasswordErrors() {
    const errors = (this.newUserForm as FormGroup).controls['passwords'].errors as {
      passwordStrengthDetails?: { errors: string[] };
    } | null;
    const errorMessages: string[] = [];
    if (errors?.passwordStrengthDetails) {
      for (const errorMsg of errors.passwordStrengthDetails.errors) {
        errorMessages.push(errorMsg);
      }
    }

    return errorMessages;
  }

  getNewUserPasswordFormControls() {
    return ((this.newUserForm as FormGroup).controls['passwords'] as FormGroup).controls;
  }

  getUpdateUserFormControls() {
    return ((this.updateUserForm as FormGroup).get('allRoles') as FormArray).controls as FormGroup[];
  }

  getNewUserFormControls() {
    return ((this.newUserForm as FormGroup).get('allRoles') as FormArray).controls as FormGroup[];
  }

  canManageLinks(user: ManageUser): boolean {
    return user.accountLinkState !== 'linked-alias';
  }

  isLinkedAlias(user: AccountStatusUser): boolean {
    return user.accountLinkState === 'linked-alias';
  }

  getAccountStatusBadge(
    user: AccountStatusUser & {
      effectiveLoginDisabled?: boolean;
      loginDisabled?: boolean;
      disabledByPrimaryUsername?: string;
    }
  ): string {
    if (user.effectiveLoginDisabled === true) {
      if (user.loginDisabled !== true && !_.isEmpty(user.disabledByPrimaryUsername)) {
        return (
          this.translationService.t('manage-users-account-status-disabled-via-primary', '', {
            primaryUsername: user.disabledByPrimaryUsername,
          }) || `Disabled via ${user.disabledByPrimaryUsername}`
        );
      }
      return this.translationService.t('manage-users-account-status-disabled') || 'Disabled';
    }
    if (this.isLinkedAlias(user)) {
      return this.translationService.t('manage-users-account-status-linked-alias') || 'Linked';
    }
    if ((user.linkedAccountCount || 0) > 0) {
      return this.translationService.t('manage-users-account-status-primary') || 'Primary';
    }
    return this.translationService.t('manage-users-account-status-active') || 'Active';
  }

  getAccountStatusBadgeClass(user: AccountStatusUser & { effectiveLoginDisabled?: boolean }): string {
    if (user.effectiveLoginDisabled === true) {
      return 'danger';
    }
    if (this.isLinkedAlias(user)) {
      return 'default';
    }
    if ((user.linkedAccountCount || 0) > 0) {
      return 'info';
    }
    return 'default';
  }

  getAccountStatusContext(user: AccountStatusUser): string | null {
    if (user.accountLinkState === 'linked-alias') {
      return user.effectivePrimaryUsername
        ? this.translationService.t('manage-users-account-status-primary-user', '', {
            primaryUsername: user.effectivePrimaryUsername,
          }) || `Primary: ${user.effectivePrimaryUsername}`
        : null;
    }
    if ((user.linkedAccountCount || 0) > 0) {
      const linkedAccountCount = user.linkedAccountCount;
      return (
        this.translationService.t('manage-users-account-status-linked-accounts', '', { count: linkedAccountCount }) ||
        `${linkedAccountCount} linked account${linkedAccountCount === 1 ? '' : 's'}`
      );
    }
    return null;
  }

  async manageLinks(username: string) {
    const user = _.find(this.allUsers, existingUser => existingUser.username === username) || null;
    if (user == null) {
      return;
    }
    this.linkPrimaryUser = user;
    this.linkCandidates = [];
    this.linkSearchQuery = '';
    this.selectedLinkCandidate = null;
    this.setLinkMessage();
    this.showLinkModal();
    await this.refreshLinkModalData();
  }

  async refreshLinkModalData() {
    if (this.linkPrimaryUser == null) {
      return;
    }
    try {
      const response = (await this.userService.getUserLinks(this.linkPrimaryUser.id)) as UserLinkResponse;
      this.linkedAccounts = response.linkedAccounts || [];
    } catch (error: unknown) {
      this.loggerService.error('Failed to load linked accounts:', error);
      this.setLinkMessage((error as Error)?.message || 'Failed to load linked accounts.', 'danger');
      this.linkedAccounts = [];
    }
  }

  selectLinkCandidate(candidate: UserLinkCandidate) {
    this.selectedLinkCandidate = candidate;
  }

  async searchCandidates() {
    if (this.linkPrimaryUser == null) {
      return;
    }
    const query = _.trim(this.linkSearchQuery);
    if (_.isEmpty(query)) {
      this.linkCandidates = [];
      this.selectedLinkCandidate = null;
      return;
    }
    this.isLinkSearchLoading = true;
    try {
      this.linkCandidates = await this.userService.searchLinkCandidates(this.linkPrimaryUser.id, query);
      this.selectedLinkCandidate = null;
      if (_.isEmpty(this.linkCandidates)) {
        this.setLinkMessage(
          this.translationService.t('manage-users-link-no-results') || 'No matching accounts found.',
          'warning'
        );
      } else {
        this.setLinkMessage();
      }
    } catch (error: unknown) {
      this.loggerService.error('Failed to search link candidates:', error);
      this.setLinkMessage(
        this.translationService.t('manage-users-link-search-failed') || 'Failed to search accounts.',
        'danger'
      );
      this.linkCandidates = [];
      this.selectedLinkCandidate = null;
    } finally {
      this.isLinkSearchLoading = false;
    }
  }

  async submitLink() {
    if (this.linkPrimaryUser == null || this.selectedLinkCandidate == null) {
      this.setLinkMessage(
        this.translationService.t('manage-users-link-select-candidate') || 'Select an account to link.',
        'danger'
      );
      return;
    }
    this.isLinkSaving = true;
    this.setLinkMessage(this.translationService.t('manage-users-link-linking') || 'Linking accounts...', 'primary');
    try {
      const response = await this.userService.linkAccounts(this.linkPrimaryUser.id, this.selectedLinkCandidate.id);
      await this.refreshUsers();
      this.linkPrimaryUser =
        _.find(this.allUsers, existingUser => existingUser.id === response.primary.id) || this.linkPrimaryUser;
      this.linkedAccounts = response.linkedAccounts || [];
      this.linkCandidates = [];
      this.linkSearchQuery = '';
      this.selectedLinkCandidate = null;
      this.setLinkMessage(this.buildLinkSuccessMessage(response), 'success');
    } catch (error: unknown) {
      this.setLinkMessage(
        (error as Error)?.message ||
          this.translationService.t('manage-users-link-failed') ||
          'Failed to link accounts.',
        'danger'
      );
    } finally {
      this.isLinkSaving = false;
    }
  }
}
