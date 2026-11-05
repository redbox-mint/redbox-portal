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
    // The user endpoint includes populated roles and account/provider information.
    // Include disabled accounts so membership counts reflect all assigned members.
    this.users = await this.userService.getUsers({ includeDisabled: true }) as unknown as User[];
    this.selectedRole = this.roles.find(role => role.id === this.selectedRole?.id) || this.roles.find(role => role.name === 'Admin') || this.roles[0] || null;
  }

  members(role: Role | null = this.selectedRole): User[] {
    return role ? this.users.filter(user => user.roles.some(item => item.name === role.name)) : [];
  }

  selectRole(role: Role) {
    if (this.saving || this.pendingRemoval || this.editingDescription) return;
    this.selectedRole = role;
    this.memberSearch = '';
    this.selectedCandidateId = '';
    this.saveError = '';
  }

  otherRoles(user: User): Role[] {
    return user.roles.filter(role => role.name !== this.selectedRole?.name);
  }

  get candidates(): User[] {
    const query = this.memberSearch.trim().toLowerCase();
    if (!query || !this.selectedRole) return [];
    return this.users.filter(user =>
      user.accountLinkState !== 'linked-alias' && !user.effectiveLoginDisabled &&
      !user.roles.some(role => role.name === this.selectedRole!.name) &&
      [user.name, user.email, user.username].some(value => (value || '').toLowerCase().includes(query))
    );
  }

  searchMembers() {
    this.selectedCandidateId = '';
  }

  removeBlockedReason(user: User): string {
    if (user.accountLinkState === 'linked-alias') return 'admin-roles-linked-member';
    if (this.selectedRole?.name === 'Admin' && (this.members().length <= 1 || (!user.effectiveLoginDisabled && this.members().filter(member => !member.effectiveLoginDisabled && member.accountLinkState !== 'linked-alias').length <= 1))) return 'admin-roles-last-admin';
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
