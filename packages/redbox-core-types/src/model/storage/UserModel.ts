import { RoleModel } from "./RoleModel"
import { WorkspaceAppModel } from "./WorkspaceAppModel"

export class UserModel {
    [key: string]: unknown;
    id: string = ''
    username: string = ''
    password?: string
    type: string = ''
    name: string = ''
    email: string = ''
    token?: string
    lastLogin: Date = new Date()
    additionalAttributes: Record<string, unknown> = {};
    workspaceApps: WorkspaceAppModel[] = [];
    roles: RoleModel[] = [];
}
