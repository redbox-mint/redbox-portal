import { Component, Inject, ViewChild } from '@angular/core';
import { ModalDirective } from 'ngx-bootstrap/modal';
import { FormArray, FormGroup, FormControl, Validators, FormBuilder } from '@angular/forms';
import { Role, User, UserLoginResult, SaveResult } from '@researchdatabox/portal-ng-common';
import { BaseComponent, LoggerService, TranslationService, UserService} from '@researchdatabox/portal-ng-common';
import { UserForm, matchingValuesValidator, optionalEmailValidator, passwordStrengthValidator } from './forms';
import * as _ from 'lodash';

@Component({
  selector: 'manage-users',
  templateUrl: './manage-users.component.html'
})
export class ManageUsersComponent extends BaseComponent {

  title = '@researchdatabox/manage-users';
  
  allUsers: User[] = [];
  filteredUsers: any[] = [];
  allRoles: Role[] = [];

  searchFilter: { name: string, 
                  prevName: string, 
                  users: any[] 
                } = {
                      name: '', 
                      prevName: '', 
                      users: [ {value: null, label:'Any', checked:true}]
                    };

  hiddenUsers: any = [''];
  currentUser!: User;

  updateDetailsMsg: string = '';
  updateDetailsMsgType: string = 'info';
  newUserMsg: string = '';
  newUserMsgType: string = 'info';

  @ViewChild('userDetailsModal') userDetailsModal!: ModalDirective;
  @ViewChild('userNewModal') userNewModal!: ModalDirective;

  isDetailsModalShown: boolean = false;
  isNewUserModalShown: boolean = false;
  updateUserForm!: FormGroup;
  newUserForm!: FormGroup;
  submitted!: boolean;
  showToken!: boolean;

  constructor(
    @Inject(LoggerService) private loggerService: LoggerService,
    @Inject(TranslationService) private translationService: TranslationService,
    @Inject(UserService) private userService: UserService,
    @Inject(FormBuilder) private _fb: FormBuilder
  ) {
    super();
    this.loggerService.debug(`Manage Users waiting for deps to init...`); 
    this.initDependencies = [this.translationService, this.userService];
  }

  protected override async initComponent():Promise<void> {
  }

  setupForms() {
    this.submitted = false;
    let updateRolesControlArray = new FormArray(this.allRoles.map((role) => {
      return new FormGroup({
        key: new FormControl(role.id),
        value: new FormControl(role.name),
        checked: new FormControl(_.includes(_.flatMap(this.currentUser.roles, role => { return role['name']; }), role.name)),
      });
    }));

    let newRolesControlArray = new FormArray(this.allRoles.map((role) => {
      return new FormGroup({
        key: new FormControl(role.id),
        value: new FormControl(role.name),
        checked: new FormControl(false),
      });
    }));
    const pwGroup_new = this._fb.group(
      {
        password: [''],
        confirmPassword: ['']
      }
    );
    const pwGroup_update = this._fb.group(
      {
        password: [''],
        confirmPassword: ['']
      }
    );
    pwGroup_new.setValidators([matchingValuesValidator('password', 'confirmPassword'), passwordStrengthValidator('confirmPassword')])
    pwGroup_update.setValidators([matchingValuesValidator('password', 'confirmPassword'), passwordStrengthValidator('confirmPassword')])
    this.updateUserForm = this._fb.group({
      userid: this.currentUser.id,
      username: this.currentUser.username,
      name: [this.currentUser.name, Validators.required],
      email: [this.currentUser.email, optionalEmailValidator],
      passwords: pwGroup_update,
      allRoles: updateRolesControlArray,
      roles: [this.mapRoles(updateRolesControlArray.value), Validators.required]
    });

    this.newUserForm = this._fb.group({
      username: ['', Validators.required],
      name: ['', Validators.required],
      email: ['', optionalEmailValidator],
      passwords: pwGroup_new,
      allRoles: newRolesControlArray,
      roles: [this.mapRoles(newRolesControlArray.value), Validators.required]
    });

    updateRolesControlArray.valueChanges.subscribe((v) => {
      this.updateUserForm.controls['roles'].setValue(this.mapRoles(v));
    });

    newRolesControlArray.valueChanges.subscribe((v) => {
      this.newUserForm.controls['roles'].setValue(this.mapRoles(v));
    });

  }

  mapRoles(roles: any) {
    let selectedRoles = roles.filter((role: any) => role.checked).map((r: any) => {
      let ret: Role = {      
        id: '',
        name: '',
        users: []
      };
      ret.id = r.key;
      ret.name = r.value;
      return ret;
      });
    return selectedRoles.length ? selectedRoles : null;
  }

  refreshUsers() {
    this.userService.getUsers().then((users:any) => {
      this.allUsers = users;
      _.forEach(this.searchFilter.users, (user:any) => {
        this.searchFilter.users.pop();
      });
      this.filteredUsers = [];
      _.forEach(users, (user:any) => {
        this.searchFilter.users.push({value:user.name, label:user.name, checked:false});
        if (!_.includes(this.hiddenUsers, user.username)) {
          this.filteredUsers.push(user);
        }
      });
      _.map(this.filteredUsers, (user:any)=> {user.roleStr = _.join(_.map(user.roles, 'name'), ', ')});
    });
  }

  editUser(username: string) {
    this.showToken = false;
    this.setUpdateMessage();
    let user = _.find(this.allUsers, (user:any)=>{return user.username == username});
    if(!_.isUndefined(user)) {
      this.currentUser = user;
    }
    this.setupForms();
    this.showDetailsModal();
  }

  newUser() {
    this.setNewUserMessage();
    this.setupForms();
    this.showNewUserModal();
  }

  showDetailsModal():void {this.isDetailsModalShown = true;}
  hideDetailsModal():void {this.userDetailsModal.hide();}
  onDetailsModalHidden():void {this.isDetailsModalShown = false;}

  showNewUserModal():void {this.isNewUserModalShown = true;}
  hideNewUserModal():void {this.userNewModal.hide();}
  onNewUserHidden():void {this.isNewUserModalShown = false;}

  genKey(userid: string) {
    this.setUpdateMessage('Generating...', 'primary');
    this.userService.genKey(userid).then((saveRes:any) => { //SaveResult
      if (saveRes.status) {
        this.showToken = true;
        this.currentUser.token = saveRes.message;
        this.refreshUsers();
        this.setUpdateMessage('Token generated.', 'primary');
      } else {
        this.setUpdateMessage(saveRes.message, 'danger');
      }
    });
  }

  revokeKey(userid: string) {
    this.setUpdateMessage('Revoking...', 'primary');
    this.userService.revokeKey(userid).then((saveRes:any) => { //SaveResult
      if (saveRes.status) {
        this.currentUser.token = '';
        this.refreshUsers();
        this.setUpdateMessage('Token revoked.', 'primary');
      } else {
        this.setUpdateMessage(saveRes.message, 'danger');
      }
    });
  }

  updateUserSubmit(user: UserForm, isValid: boolean) {
    this.submitted = true;
    if (!isValid){
      this.setUpdateMessage(this.translationService.t('manage-users-validation-submit'), 'danger');
      return;
    }
    var details: { name: string, email: string, password: string, roles: any[] } =
      { name: user.name, email: user.email, password: user.passwords.password, roles: [] };
    _.forEach(user.roles, (role:any) => {
      details.roles.push(role.name);
    });
    this.setUpdateMessage('Saving...', 'primary');

    this.userService.updateUserDetails(user.userid, details).then((saveRes:any) => { //SaveResult
      if (saveRes.status) {
        this.hideDetailsModal();
        this.refreshUsers();
        this.setUpdateMessage();
      } else {
        this.setUpdateMessage(saveRes.message, 'danger');
      }
    });
  }

  newUserSubmit(user: UserForm, isValid: boolean) {
    this.submitted = true;
    if (!isValid){
      this.setNewUserMessage(this.translationService.t('manage-users-validation-submit'), 'danger');
      return;
    }
    var details: { name: string, email: string, password: string, roles: any[] } =
      { name: user.name, email: user.email, password: user.passwords.password, roles: [] };

    var userRoles:any[] = [];
    _.forEach(user.roles, (role:any) => {
      details.roles.push(role.name);
    });

    this.setNewUserMessage('Saving...', 'primary');
    this.userService.addLocalUser(user.username, details).then((saveRes:any) => { //SaveResult
      if (saveRes.status) {
        this.hideNewUserModal();
        this.refreshUsers();
        this.setNewUserMessage();
      } else {
        this.setNewUserMessage(saveRes.message, 'danger');
      }
    });
  }

  setUpdateMessage(msg:any=undefined, type:string='primary') {
    this.updateDetailsMsg = msg;
    this.updateDetailsMsgType = type;
  }

  setNewUserMessage(msg:any=undefined, type:string='primary') {
    this.newUserMsg = msg;
    this.newUserMsgType = type;
  }

  onFilterChange() {
    if (this.searchFilter.name != this.searchFilter.prevName) {
      this.searchFilter.prevName = this.searchFilter.name;
      var nameFilter =_.isEmpty(this.searchFilter.name) ? '' : _.trim(this.searchFilter.name);

      this.filteredUsers = _.filter(this.allUsers, (user:any) => {
        var hasNameMatch = nameFilter == '' ? true : (_.toLower(user.name).indexOf(_.toLower(this.searchFilter.name)) >= 0);
        return hasNameMatch;
      });
    }
  }

  resetFilter() {
    this.searchFilter.name = '';
    _.map(this.searchFilter.users, (user:any)=> user.checked = user.value == null);
    this.onFilterChange();
  }

  getPasswordsControls() {
    let passControls = (this.updateUserForm.get('passwords') as FormArray).controls;
    for(let control of passControls) {
      //if(control['confirmPassword'].touched) {
        return true;  
      //}
    }
    return false;
  }

  getUpdateUserFormControls() {
    return (this.updateUserForm.get('allRoles') as FormArray).controls;
  }

  getNewUserFormControls() {
    return (this.newUserForm.get('allRoles') as FormArray).controls;
  }

}
