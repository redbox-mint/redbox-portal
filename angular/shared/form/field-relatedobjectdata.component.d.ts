import { SimpleComponent } from './field-simple.component';
import { FieldBase } from './field-base';
import { RecordsService } from './records.service';
/**
 * Contributor Model
 *
 *
 * @author <a target='_' href='https://github.com/shilob'>Shilo Banihit</a>
 *
 */
export declare class RelatedObjectDataField extends FieldBase<any> {
    showHeader: boolean;
    validators: any;
    enabledValidators: boolean;
    relatedObjects: object[];
    accessDeniedObjects: object[];
    failedObjects: object[];
    hasInit: boolean;
    recordsService: RecordsService;
    columns: object[];
    constructor(options: any, injector: any);
    createFormModel(valueElem?: any): any;
    setValue(value: any): void;
    setEmptyValue(): any;
}
/**
* Component to display information from related objects within ReDBox
*
*
*
*
*/
export declare class RelatedObjectDataComponent extends SimpleComponent {
    field: RelatedObjectDataField;
}
