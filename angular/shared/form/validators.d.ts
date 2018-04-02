import { ValidatorFn, AbstractControl } from '@angular/forms';
/**
 * Custom RB-Specific Validators - static methods only
 *
 * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
 *
 */
export declare class RbValidator {
    /**
    * Forces validation on empty / null values
    */
    static isEmpty(control: AbstractControl): {
        [key: string]: any;
    };
    /**
    *
    * Makes sure all fields have values otherwise this will return an error object containing the emptyFields
    *
    */
    static noEmptyInGroup(field: any, dependentFieldNames: string[]): ValidatorFn;
}
