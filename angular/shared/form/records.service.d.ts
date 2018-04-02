import { BaseService } from '../base-service';
import { Http } from '@angular/http';
import 'rxjs/add/operator/toPromise';
import { FieldControlService } from './field-control.service';
import { ConfigService } from '../config-service';
/**
 * Plan Client-side services
 *
 *
 *
 * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
 */
export declare class RecordsService extends BaseService {
    protected fcs: FieldControlService;
    protected configService: ConfigService;
    constructor(http: Http, fcs: FieldControlService, configService: ConfigService);
    getForm(oid?: string, recordType?: string, editable?: boolean): any;
    addRenderCompleteElement(fieldsMeta: any): void;
    getFormFields(recordType: string, oid: string, editable: boolean): any;
    getFormFieldsMeta(recordType: string, editable: boolean, oid?: string): any;
    create(record: any, recordType: string): any;
    update(oid: string, record: any): any;
    stepTo(oid: string, record: any, targetStep: string): any;
    getDashboardUrl(): string;
    modifyEditors(records: any, username: any, email: any): any;
    updateResponsibilities(records: any, role: any, email: any, name: any): any;
    getTransferResponsibility(recordType: any): any;
    search(params: RecordSearchParams): any;
    getType(name: string): any;
    getRecordMeta(oid?: string): any;
}
export declare class RecordActionResult {
    success: boolean;
    oid: string;
    message: string;
}
export declare class RecordSearchRefiner {
    name: string;
    title: string;
    type: string;
    value: any;
    alwaysActive: boolean;
    typeLabel: string;
    activeValue: any;
    constructor(opts?: any);
    setCurrentValue(value: any): void;
}
export declare class RecordSearchParams {
    recordType: string;
    basicSearch: string;
    activeRefiners: any[];
    refinerConfig: RecordSearchRefiner[];
    constructor(recType: string);
    clear(): void;
    getRefinerConfig(name: string): any;
    setRefinerConfig(config: RecordSearchRefiner[]): void;
    getHttpQuery(searchUrl: string): string;
    getRefinerConfigs(): RecordSearchRefiner[];
    addActiveRefiner(refiner: RecordSearchRefiner): void;
    parseQueryStr(queryStr: string): void;
    filterActiveRefinersWithNoData(): void;
    hasActiveRefiners(): boolean;
    setFacetValues(facets: any): void;
}
