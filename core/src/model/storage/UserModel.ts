import { RoleModel } from "./RoleModel"
import { WorkspaceAppModel } from "./WorkspaceAppModel"

export class UserModel {
    id:string
    username:string
    password?:string
    type: string
    name: string
    email: string
    token?: string
    lastLogin: Date
    additionalAttributes: any;
    workspaceApps: WorkspaceAppModel[];
    roles: RoleModel[];
}