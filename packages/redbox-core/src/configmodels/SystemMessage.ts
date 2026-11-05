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

    /** @title Style */
    style?: 'info' | 'warning' | 'critical' = 'info';

    public static getFieldOrder(): string[] {
        return ["enabled", "title", "message", "dismissalDurationHours", "style"]
    }
}

export const SYSTEM_MESSAGE_SCHEMA = {
    type: 'object',
    title: 'admin-config-label-system-messages',
    properties: {
        enabled: {
            type: 'boolean',
            title: 'admin-config-label-enabled',
            default: false
        },
        title: {
            type: 'string',
            title: 'admin-config-label-message-title',
            default: ''
        },
        message: {
            type: 'string',
            title: 'admin-config-label-message-body',
            default: '',
            widget: {
                formlyConfig: {
                    type: 'textarea'
                }
            }
        },
        style: {
            type: 'string',
            title: 'admin-config-label-message-style',
            enum: ['info', 'warning', 'critical'],
            default: 'info'
        },
        dismissalDurationHours: {
            type: 'number',
            title: 'admin-config-label-dismissal-duration-hours',
            default: 8
        }
    },
    required: ['enabled', 'title', 'message', 'dismissalDurationHours']
};
