import {Branding} from './Branding';
import {User} from './User';

export class Role {
    id:string;
    name: string;
    branding: Branding;
    users: User[];
}
