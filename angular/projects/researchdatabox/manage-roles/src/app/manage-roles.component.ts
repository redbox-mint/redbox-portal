import { Component, Inject, ViewChild } from '@angular/core';
import { ModalDirective } from 'ngx-bootstrap/modal';
import { LoggerService, TranslationService, UserService, BaseComponent, Role, User, SaveResult } from '@researchdatabox/portal-ng-common';

@Component({
  selector: 'manage-roles',
  templateUrl: './manage-roles.component.html',
  styleUrls: ['./manage-roles.component.scss'],
  standalone: false
})
export class ManageRolesComponent extends BaseComponent {
  roles: Role[] = [];
  users: User[] = [];
  selectedRole: Role | null = null;
  memberSearch = '';
  selectedCandidateId = '';
  pendingRemoval: User | null = null;
  saving = false;
  loadingMembers = false;
  page = 1;
  readonly pageSize = 25;
  totalMembers = 0;
  memberFilter = '';
  memberOrder: 'asc' | 'desc' = 'asc';
  roleCounts: Record<string, { active: number; disabled: number; removableActive: number }> = {};
  candidates: User[] = [];
  candidatesLoading = false;
  candidatePage = 1;
  candidateTotal = 0;
  get candidatePages(): number { return Math.max(1, Math.ceil(this.candidateTotal / this.pageSize)); }
  private memberRequest = 0;
  private candidateRequest = 0;
  get totalPages(): number { return Math.max(1, Math.ceil(this.totalMembers / this.pageSize)); }
  get pageStart(): number { return this.users.length ? (this.page - 1) * this.pageSize + 1 : 0; }

  async loadMembers(page = 1): Promise<void> {
    if (!this.selectedRole) return;
    const request = ++this.memberRequest;
    this.loadingMembers = true;
    this.saveError = '';
    try {
      const result = await this.userService.getUserPage({ page, pageSize: this.pageSize, role: this.selectedRole.name,
        includeDisabled: true, query: this.memberFilter.trim(), sort: 'name', order: this.memberOrder });
      if (request !== this.memberRequest) return;
      this.users = result.records;
      this.totalMembers = result.summary.numFound;
      this.page = result.summary.page;
      this.roleCounts = result.roleCounts;
    } catch {
      if (request === this.memberRequest) this.saveError = this.translationService.t('admin-users-load-error');
    } finally { if (request === this.memberRequest) this.loadingMembers = false; }
  }

  sortMembers(): void { this.memberOrder = this.memberOrder === 'asc' ? 'desc' : 'asc'; void this.loadMembers(1); }

  editingDescription = false;
  descriptionDraft = '';
  blockedRemoval = '';

  get defaultRole(): Role | undefined { return this.roles.find(role => role.isDefault); }

  startDescriptionEdit() {
    this.descriptionDraft = this.selectedRole?.description || '';
    this.editingDescription = true;
    this.saveError = '';
  }

  async saveDescription() {
    if (!this.selectedRole || this.saving || this.descriptionDraft.length > 500) return;
    this.saving = true; this.saveError = '';
    try {
      const result = await this.userService.updateRoleDescription(this.selectedRole.id, this.descriptionDraft);
      if (!result.status) throw new Error(this.translationService.t('admin-roles-save-error'));
      this.selectedRole.description = this.descriptionDraft.trim();
      this.editingDescription = false;
    } catch { this.saveError = this.translationService.t('admin-roles-save-error'); }
    finally { this.saving = false; }
  }
  saveError = '';
  @ViewChild('removeMemberModal') removeMemberModal?: ModalDirective;

  constructor(
    @Inject(LoggerService) private loggerService: LoggerService,
    @Inject(TranslationService) private translationService: TranslationService,
    @Inject(UserService) private userService: UserService
  ) {
    super();
    this.initDependencies = [this.translationService, this.userService];
  }

  protected override async initComponent(): Promise<void> {
    this.brandingAndPortalUrl = this.userService.brandingAndPortalUrl;
    this.roles = await this.userService.getBrandRoles() as unknown as Role[];
    this.selectedRole = this.roles.find(role => role.id === this.selectedRole?.id) || this.roles.find(role => role.name === 'Admin') || this.roles[0] || null;
    await this.loadMembers();
    if (this.saveError) throw new Error(this.saveError);
  }

  activeMemberCount(role: Role | null = this.selectedRole): number { return this.roleCounts[role?.name || '']?.active || 0; }
  disabledMemberCount(role: Role | null = this.selectedRole): number { return this.roleCounts[role?.name || '']?.disabled || 0; }
  members(): User[] { return this.users; }

  async selectRole(role: Role) {
    if (this.saving || this.pendingRemoval || this.editingDescription) return;
    this.selectedRole = role;
    this.memberSearch = this.memberFilter = '';
    this.candidates = [];
    ++this.candidateRequest;
    this.candidatesLoading = false;
    this.selectedCandidateId = '';
    this.users = [];
    await this.loadMembers();
  }

  otherRoles(user: User): Role[] {
    return user.roles.filter(role => role.name !== this.selectedRole?.name);
  }

  async searchMembers(page = 1) {
    this.selectedCandidateId = '';
    const request = ++this.candidateRequest;
    const query = this.memberSearch.trim();
    this.candidates = [];
    this.candidateTotal = 0;
    this.candidatesLoading = !!query;
    if (!query || !this.selectedRole) return;
    try {
      const result = await this.userService.getUserPage({ page, pageSize: this.pageSize, query,
        excludeRole: this.selectedRole.name, candidates: true });
      if (request === this.candidateRequest) {
        this.candidates = result.records;
        this.candidatePage = result.summary.page;
        this.candidateTotal = result.summary.numFound;
      }
    } catch {
      if (request === this.candidateRequest) this.saveError = this.translationService.t('admin-users-load-error');
    } finally { if (request === this.candidateRequest) this.candidatesLoading = false; }
  }

  removeBlockedReason(user: User): string {
    if (user.accountLinkState === 'linked-alias') return 'admin-roles-linked-member';
    if (this.selectedRole?.name === 'Admin' && (!user.effectiveLoginDisabled && (this.roleCounts['Admin']?.removableActive || 0) <= 1)) return 'admin-roles-last-admin';
    if (user.roles.length <= 1 && (!this.defaultRole || this.selectedRole?.id === this.defaultRole.id)) return 'admin-roles-default-blocked';
    return '';
  }

  requestRemoval(user: User) {
    if (this.saving) return;
    this.blockedRemoval = this.removeBlockedReason(user);
    if (this.blockedRemoval) return;
    this.saveError = '';
    this.pendingRemoval = user;
  }

  async addMember() {
    const user = this.candidates.find(candidate => candidate.id === this.selectedCandidateId);
    if (!user || !this.selectedRole || this.saving) return;
    await this.saveMembership(user, [...user.roles, this.selectedRole]);
  }

  async removeMember() {
    if (!this.pendingRemoval || this.saving || this.removeBlockedReason(this.pendingRemoval)) return;
    this.saving = true; this.saveError = '';
    try {
      const result = await this.userService.removeRoleMember(this.selectedRole!.id, this.pendingRemoval.id);
      if (!result.status) throw new Error('Membership update failed');
      this.pendingRemoval.roles = result.roles;
      this.removeMemberModal?.hide();
      await this.loadMembers(this.page);
    } catch { this.saveError = this.translationService.t('admin-roles-save-error'); }
    finally { this.saving = false; }
  }

  private async saveMembership(user: User, roles: Role[]): Promise<boolean> {
    this.saving = true;
    this.saveError = '';
    try {
      const result = await this.userService.updateUserRoles(user.id, roles.map(role => role.name)) as unknown as SaveResult;
      if (!result.status) {
        this.saveError = result.message || this.translationService.t('admin-roles-save-error');
        return false;
      }
      user.roles = roles;
      this.memberSearch = '';
      this.selectedCandidateId = '';
      this.candidates = [];
      await this.loadMembers(this.page);
      return true;
    } catch (error) {
      this.loggerService.error('Failed to update role membership', error);
      this.saveError = (error as Error)?.message || this.translationService.t('admin-roles-save-error');
      return false;
    } finally {
      this.saving = false;
    }
  }
}
