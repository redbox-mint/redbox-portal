import {RoleModel} from "./RoleModel";
import type {BrandingTypefaceState} from "../BrandingTypeface";

export class BrandingModel {
    id: string = '';
    name: string = '';
    css: string = '';
    logo?: Record<string, unknown>;
    favicon?: Record<string, unknown>;
    roles: RoleModel[] = [];
    variables?: Record<string, string>;
    version?: number;
    hash?: string;
    typeface?: BrandingTypefaceState | null;
    draftTypeface?: BrandingTypefaceState | null;
    draftRevision?: number;
}
