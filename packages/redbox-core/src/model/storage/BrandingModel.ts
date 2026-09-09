import {RoleModel} from "./RoleModel";

export class BrandingModel {
    id: string = '';
    name: string = '';
    css: string = '';
    logo?: Record<string, unknown>;
    favicon?: Record<string, unknown>;
    roles: RoleModel[] = [];
}
