export interface WorkspaceAppModel {
    app: string;
    user: string;
    info?: {
        [key: string]: any;
    };
}