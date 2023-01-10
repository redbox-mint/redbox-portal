import { Role } from './shared/user-models';
import { FormGroup, FormControl } from '@angular/forms';
import * as owasp from 'owasp-password-strength-test';
import * as _ from 'lodash';

export interface UserForm {
    userid: string
    username: string
    name: string
    email: string
    passwords: { password: string, confirmPassword: string }
    roles: any[]
}

export function matchingValuesValidator(control1: string, control2: string) {
    return (group: FormGroup): {[key: string]: any} => {
        let val1 = group.controls[control1];
        let val2 = group.controls[control2];

        if (val1.value !== val2.value) {
        return {
            mismatched: true
        };
        }
    }
}

// needed as Validators.email returns validation error when value is null
// (i.e combines Validators.required functionality)
export function optionalEmailValidator(control: FormControl): {[key: string]: any} {
    var emailRegexp = /^[a-z0-9!#$%&'*+\/=?^_`{|}~.-]+@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i;
    if (control.value && !emailRegexp.test(control.value)) {
        return { invalidEmail: true };
    }
}

export function passwordStrengthValidator(control1: string) {
  return (group: FormGroup): {[key: string]: any} => {
    let password = group.controls[control1].value;
    if (!_.isEmpty(password)) {
      const result = owasp.test(password);
      return result.errors.length == 0 ? undefined : { passwordStrength: true, passwordStrengthDetails: result };
    }
  }
}
