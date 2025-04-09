import { Component, Inject, ViewChild } from '@angular/core';
import { ModalDirective } from 'ngx-bootstrap/modal';
import { FormArray, FormGroup, FormControl, Validators, FormBuilder } from '@angular/forms';
import { Role, User, UserLoginResult, SaveResult } from '@researchdatabox/portal-ng-common';
import { BaseComponent, LoggerService, TranslationService, UserService} from '@researchdatabox/portal-ng-common';
import { UserForm, matchingValuesValidator, optionalEmailValidator, passwordStrengthValidator } from './forms';
import * as _ from 'lodash';

@Component({
    selector: 'manage-users',
    templateUrl: './manage-users.component.html',
    standalone: false
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
  currentUser: User = null as any;

  updateDetailsMsg: string = '';
  updateDetailsMsgType: string = 'info';
  newUserMsg: string = '';
  newUserMsgType: string = 'info';

  @ViewChild('userDetailsModal', { static: false }) userDetailsModal?: ModalDirective;
  @ViewChild('userNewModal', { static: false }) userNewModal?: ModalDirective;

  isDetailsModalShown: boolean = false;
  isNewUserModalShown: boolean = false;
  updateUserForm: FormGroup = null as any;;
  newUserForm: FormGroup = null as any;;
  submitted: boolean = false;
  showToken: boolean = false;

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
    let roles: any = await this.userService.getBrandRoles();
    for(let role of roles) {
      this.allRoles.push(role);
    }
    await this.refreshUsers();
  }

  setupForms(newUser: boolean) {
    this.submitted = false;

    if(newUser) {

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
      pwGroup_new.setValidators([matchingValuesValidator('password', 'confirmPassword'), passwordStrengthValidator('confirmPassword')]);
      
      this.newUserForm = this._fb.group({
        username: ['', Validators.required],
        name: ['', Validators.required],
        email: ['', optionalEmailValidator],
        passwords: pwGroup_new,
        allRoles: newRolesControlArray,
        roles: [this.mapRoles(newRolesControlArray.value), Validators.required]
      });

      newRolesControlArray.valueChanges.subscribe((v) => {
        this.newUserForm.controls['roles'].setValue(this.mapRoles(v));
      });

    } else {

      let updateRolesControlArray = new FormArray(this.allRoles.map((role) => {
        return new FormGroup({
          key: new FormControl(role.id),
          value: new FormControl(role.name),
          checked: new FormControl(_.includes(_.flatMap(this.currentUser.roles, role => { return role['name']; }), role.name)),
        });
      }));

      const pwGroup_update = this._fb.group(
        {
          password: [''],
          confirmPassword: ['']
        }
      );

      pwGroup_update.setValidators([matchingValuesValidator('password', 'confirmPassword'), passwordStrengthValidator('confirmPassword')]);

      this.updateUserForm = this._fb.group({
        userid: this.currentUser.id,
        username: this.currentUser.username,
        name: [this.currentUser.name, Validators.required],
        email: [this.currentUser.email, optionalEmailValidator],
        passwords: pwGroup_update,
        allRoles: updateRolesControlArray,
        roles: [this.mapRoles(updateRolesControlArray.value), Validators.required]
      });

      updateRolesControlArray.valueChanges.subscribe((v) => {
        this.updateUserForm.controls['roles'].setValue(this.mapRoles(v));
      });
      
    }
  }

  mapRoles(roles: any) {
    let selectedRoles = roles.filter((role: any) => role.checked).map((r: any) => {
      let ret: Role = {      
        id: '',
        name: '',
        users: [],
        hasRole: true
      };
      ret.id = r.key;
      ret.name = r.value;
      return ret;
      });
    return selectedRoles.length ? selectedRoles : null;
  }

  async refreshUsers() {
    let users: any =  await this.userService.getUsers();
    for(let user of users) {
      this.allUsers.push(user);
    }
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
  }

  editUser(username: string) {
    this.showToken = false;
    this.setUpdateMessage();
    let user = _.find(this.allUsers, (user:any)=>{return user.username == username});
    if(!_.isUndefined(user)) {
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

  hideDetailsModal(): void {
    if(!_.isUndefined(this.userDetailsModal)) {
      this.userDetailsModal.hide();
    }
  }

  onDetailsModalHidden(): void {
    this.isDetailsModalShown = false;
  }

  showNewUserModal(): void {
    this.isNewUserModalShown = true;
    
  }

  hideNewUserModal(): void {
    if(!_.isUndefined(this.userNewModal)) {
      this.userNewModal.hide();
    }
  }

  onNewUserHidden(): void {
    this.isNewUserModalShown = false;
  }

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

  async updateUserSubmit(user: UserForm, isValid: boolean) {
    this.submitted = true;
    if (!isValid){
      this.setUpdateMessage(this.translationService.t('manage-users-validation-submit'), 'danger');
      return;
    }
    let details: { name: string, email: string, password: string, roles: any[] } =
      { name: user.name, email: user.email, password: user.passwords.password, roles: [] };
    _.forEach(user.roles, (role:any) => {
      details.roles.push(role.name);
    });
    this.setUpdateMessage('Saving...', 'primary');

    let saveRes:any = await this.userService.updateUserDetails(user.userid, details); //SaveResult
    if (saveRes.status) {
      this.hideDetailsModal();
      this.refreshUsers();
      this.setUpdateMessage();
    } else {
      this.setUpdateMessage(saveRes.message, 'danger');
    }
  }

  async newUserSubmit(user: UserForm, isValid: boolean) {
    this.submitted = true;
    if (!isValid){
      this.setNewUserMessage(this.translationService.t('manage-users-validation-submit'), 'danger');
      return;
    }
    let details: { name: string, email: string, password: string, roles: any[] } =
      { name: user.name, email: user.email, password: user.passwords.password, roles: [] };

    _.forEach(user.roles, (role:any) => {
      details.roles.push(role.name);
    });

    this.setNewUserMessage('Saving...', 'primary');
    let saveRes:any = await this.userService.addLocalUser(user.username, details); //SaveResult
    if (saveRes.status) {
      this.hideNewUserModal();
      this.refreshUsers();
      this.setNewUserMessage();
    } else {
      this.setNewUserMessage(saveRes.message, 'danger');
    }
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

  isUpdateUserFormConfirmPasswordTouched() {
    let passControls = (this.updateUserForm.controls['passwords'] as FormGroup).controls;
    if(passControls['confirmPassword'] && passControls['confirmPassword'].touched) {
        return true;  
    }
    return false;
  }
  
  getUpdateUserPasswordErrors() {
    let errors = this.updateUserForm.controls['passwords'].errors;
    let errorMessages = [];
    if(errors) {
      for(let errorMsg of errors['passwordStrengthDetails'].errors) {
        errorMessages.push(errorMsg);
      }
    }

    return errorMessages;
  }

  getNewUserPasswordErrors() {
    let errors = this.newUserForm.controls['passwords'].errors;
    let errorMessages = [];
    if(errors) {
      for(let errorMsg of errors['passwordStrengthDetails'].errors) {
        errorMessages.push(errorMsg);
      }
    }

    return errorMessages;
  }

  getNewUserPasswordFormControls() {
    return (this.newUserForm.controls['passwords'] as FormGroup).controls;
  }

  getUpdateUserFormControls() {
    return (this.updateUserForm.get('allRoles') as FormArray).controls as FormGroup[];
  }

  getNewUserFormControls() {
    return (this.newUserForm.get('allRoles') as FormArray).controls as FormGroup[];
  }

}
