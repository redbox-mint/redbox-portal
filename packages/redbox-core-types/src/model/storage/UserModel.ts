import { RoleModel } from "./RoleModel"
import { WorkspaceAppModel } from "./WorkspaceAppModel"

export class UserModel {
    id: string = ''
    username: string = ''
    password?: string
    type: string = ''
    name: string = ''
    email: string = ''
    token?: string
    lastLogin: Date = new Date()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    additionalAttributes: any = {};
    workspaceApps: WorkspaceAppModel[] = [];
    roles: RoleModel[] = [];
}