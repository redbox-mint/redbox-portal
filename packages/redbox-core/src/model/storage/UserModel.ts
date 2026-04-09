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
    linkedPrimaryUserId?: string
    accountLinkState?: 'active' | 'linked-alias' = 'active'
    effectivePrimaryUsername?: string
    linkedAccountCount?: number
    loginDisabled: boolean = false
    effectiveLoginDisabled?: boolean
    disabledByPrimaryUserId?: string
    disabledByPrimaryUsername?: string
    workspaceApps: WorkspaceAppModel[] = [];
    roles: RoleModel[] = [];
}
