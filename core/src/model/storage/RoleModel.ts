import {BrandingModel} from './BrandingModel';
import {UserModel} from './UserModel';

export class RoleModel {
    id:string;
    name: string;
    branding: BrandingModel;
    users: UserModel[];
}
