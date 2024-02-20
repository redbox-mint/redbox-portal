import { Role } from '@researchdatabox/portal-ng-common';
import { FormGroup, FormControl, ValidatorFn, AbstractControl  } from '@angular/forms';
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

export function matchingValuesValidator(control1: string, control2: string): ValidatorFn {
    return (group: AbstractControl):{ [key: string]: any } | null => {
        let val1 = group.get(control1);
        let val2 = group.get(control2);

        if(!_.isUndefined(val1) && !_.isNull(val1) && !_.isUndefined(val2) && !_.isNull(val2)) {
          if (val1.value !== val2.value) {
            return { mismatched: true };
          } else {
            return null;
          }
        } else {
          return null;
        }
    }
}

// needed as Validators.email returns validation error when value is null
// (i.e combines Validators.required functionality)
export function optionalEmailValidator(control: FormControl): any { //{[key: string]: any}
    var emailRegexp = /^[a-z0-9!#$%&'*+\/=?^_`{|}~.-]+@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i;
    if (control.value && !emailRegexp.test(control.value)) {
        return { invalidEmail: true };
    }
}

export function passwordStrengthValidator(control1: string): ValidatorFn  {
  return (group: AbstractControl):{ [key: string]: any } | null => {
    
    let password = group.get(control1);

    if(!_.isUndefined(password) && !_.isNull(password)) {
      if (!_.isEmpty(password.value)) {
        const result = owasp.test(password.value);
        return result.errors.length == 0 ? null : { passwordStrength: true, passwordStrengthDetails: result };
      } else {
        return null;
      }
    } else {
      return null;
    }
  }
}
