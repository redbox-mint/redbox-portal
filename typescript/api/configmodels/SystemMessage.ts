import {AppConfig} from './AppConfig.interface';

export class SystemMessage extends AppConfig {
    /**
     * @title Enabled
     */
    enabled: boolean = false;

    /**
     * @title Message Title
     */
    title: string;

    /**
     * The system message to display
     *
     * @title Message Body
     * @type textarea
     */
    message: string;

    public static getFieldOrder(): string[] {
        return ["enabled", "title", "message"]
    }
}