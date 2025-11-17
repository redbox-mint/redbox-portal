import { UserModel } from "./UserModel";

export interface UserAuditModel {
    user: UserModel;
    action: string;
    additionalContext?: {
        [key: string]: any;
    };

}