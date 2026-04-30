import {AppConfig} from './AppConfig.interface';

export class SystemMessage extends AppConfig {
    /**
     * @title Enabled
     */
    enabled: boolean = false;

    /**
     * @title Message Title
     */
    title: string = '';

    /**
     * The system message to display
     *
     * @title Message Body
     * @type textarea
     */
    message: string = '';

    /**
     * @title Dismissal Duration (hours)
     */
    dismissalDurationHours: number = 8;

    public static getFieldOrder(): string[] {
        return ["enabled", "title", "message", "dismissalDurationHours"]
    }
}

export const SYSTEM_MESSAGE_SCHEMA = {
    type: 'object',
    title: 'System Messages',
    properties: {
        enabled: {
            type: 'boolean',
            title: 'Enabled',
            default: false
        },
        title: {
            type: 'string',
            title: 'Message Title',
            default: ''
        },
        message: {
            type: 'string',
            title: 'Message Body',
            default: '',
            widget: {
                formlyConfig: {
                    type: 'textarea'
                }
            }
        },
        dismissalDurationHours: {
            type: 'number',
            title: 'Dismissal Duration (hours)',
            default: 8
        }
    },
    required: ['enabled', 'title', 'message', 'dismissalDurationHours']
};
