import { Component, Inject, ViewChild } from '@angular/core';
import { ModalDirective } from 'ngx-bootstrap/modal';
import { LoggerService, TranslationService, UserService, BaseComponent } from '@researchdatabox/portal-ng-common';
import { Role, User } from '@researchdatabox/portal-ng-common';
import * as _ from 'lodash';

@Component({
    selector: 'manage-roles',
    templateUrl: './manage-roles.component.html',
    styleUrls: ['./manage-roles.component.scss'],
    standalone: false
})
export class ManageRolesComponent extends BaseComponent {
  title = '@researchdatabox/manage-roles';

  users: User[] = [];
  filteredUsers: any[] = [];
  searchFilter: { 
                  name: string, 
                  role: any, 
                  prevName: string, 
                  prevRole: any, 
                  roles: any[] } = { 
                                     name: '', 
                                     role: null, 
                                     prevName: '', 
                                     prevRole:null, 
                                     roles: [ {value: null, label:'Any', checked:true}]
                                    };
  roles: Role[] = [];
  hiddenUsers = ['admin'];
  currentUser: User = {username:'', name:'', email:'', roles:[]} as any;
  saveMsg = "";
  saveMsgType ="info";

  isDetailsModalShown: boolean = false;
  @ViewChild('roleDetailsModal', { static: false }) roleDetailsModal?: ModalDirective;

  
  constructor(
    @Inject(LoggerService) private loggerService: LoggerService,
    @Inject(TranslationService) private translationService: TranslationService,
    @Inject(UserService) private userService: UserService
  ) {
    super();
    this.loggerService.debug(`Manage Roles waiting for deps to init...`); 
    this.initDependencies = [this.translationService, this.userService];
  }

  protected override async initComponent():Promise<void> {
    let roles: any = await this.userService.getBrandRoles();
    this.roles = roles;
    _.forEach(roles, (role:any) => {
      this.searchFilter.roles.push({value:role.name, label:role.name, checked:false});
      _.forEach(role.users, (user:any) => {
        if (!_.includes(this.hiddenUsers, user.username)) {
          // flattening the tree, match by username
          let existingUser: any = _.find(this.users, (existingUser:any) => { return existingUser.username == user.username});
          if (_.isEmpty(existingUser)) {
            existingUser = user;
            existingUser.roles = [role.name];
            this.users.push(existingUser);
          } else {
            existingUser.roles.push(role.name);
          }
        }
      });
    });
    _.map(this.users, (user:any)=> {user.roleStr = _.join(user.roles, ', ')});
    this.filteredUsers = this.users;
    this.loggerService.debug(`Manage Roles initComponent done`);
  }

  editUser(username:string) {
    this.setSaveMessage();
    let currUser = _.find(this.users, (user:any)=>{return user.username == username});
    if(!_.isUndefined(currUser)) {
      this.currentUser = currUser;
      this.currentUser.newRoles = _.map(this.roles, (r:any) => {
        return {name: r.name, id:r.id, users: [], hasRole: _.includes(this.currentUser.roles, r.name)};
      });
      this.showDetailsModal();
    }
  }

  showDetailsModal(): void {
    this.isDetailsModalShown = true;
    this.roleDetailsModal?.show();
  }

  hideDetailsModal(): void {
    if(!_.isUndefined(this.roleDetailsModal)) {
      this.roleDetailsModal.hide();
    }
  }

  onDetailsModalHidden(): void {
    this.isDetailsModalShown = false;
  }

  async saveCurrentUser($event:any) {
    let hasRole:boolean = false;
    let newRoles:any[] = [];
    _.forEach(this.currentUser.newRoles, (role:any) => {
      hasRole = hasRole || role.hasRole;
      if (role.hasRole)
        newRoles.push(role.name);
    });
    if (!hasRole) {
      this.setSaveMessage("Please select at least one role!", "danger");
      return;
    }
    this.setSaveMessage("Saving...", "primary");
    let saveRes:any = await this.userService.updateUserRoles(this.currentUser.id, newRoles); //SaveResult
    if (saveRes.status) {
      this.currentUser.roles = newRoles;
      this.currentUser.roleStr =  _.join(this.currentUser.roles);
      this.setSaveMessage();
      this.hideDetailsModal();
    } else {
      this.setSaveMessage(saveRes.message, "danger");
    }
  }

  setSaveMessage(msg:string="", type:string="primary") {
    this.saveMsg = msg;
    this.saveMsgType = type;
  }

  onFilterChange(roleFilter:any=null) {
    if (roleFilter) {
      roleFilter.checked = true;
      this.searchFilter.role = roleFilter.value;
      _.map(this.searchFilter.roles, (role:any)=> role.checked = roleFilter.value == role.value );
    }
    if (this.searchFilter.name != this.searchFilter.prevName || this.searchFilter.role != this.searchFilter.prevRole) {
      this.searchFilter.prevName = this.searchFilter.name;
      this.searchFilter.prevRole = this.searchFilter.role;
      var nameFilter =_.isEmpty(this.searchFilter.name) ? "" : _.trim(this.searchFilter.name);
      // run filter change...
      this.filteredUsers = _.filter(this.users, (user:any) => {
        var hasRole = this.searchFilter.role == null ?  true : _.includes(user.roles, this.searchFilter.role);
        var hasNameMatch = nameFilter == "" ? true : (_.toLower(user.name).indexOf(_.toLower(this.searchFilter.name)) >= 0);
        return hasRole && hasNameMatch;
      });
    }
  }

  resetFilter() {
    this.searchFilter.name = '';
    this.searchFilter.role = null;
    _.map(this.searchFilter.roles, (role:any)=> role.checked = role.value == null);
    this.onFilterChange();
  }

}
