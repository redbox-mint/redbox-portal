import {AppConfig} from './AppConfig.interface';

export class AuthorizedDomainsEmails extends AppConfig {
    /**
     * Domains and email addresses will only be checked when this feature is enabled.
     *
     * @title Enabled
     */
    enabled: boolean = false;

    /**
     * Users logged in via AAF will be allowed to access this website if their email address has one of these domains.
     *
     * @title Authorized Domains for AAF
     * @items {"type": "string", "default": ""}
     * @type array
     */
    domainsAaf: string[] = [];

    /**
     * Users logged in via AAF will be allowed to access this website if their email address is an exact match to one of these emails.
     *
     * @title Authorized Emails for AAF
     * @items {"type": "string", "default": ""}
     * @type array
     */
    emailsAaf: string[] = [];

    /**
     * Users logged in via OIDC will be allowed to access this website if their email address has one of these domains.
     *
     * @title Authorized Domains for OIDC
     * @items {"type": "string", "default": ""}
     * @type array
     */
    domainsOidc: string[] = [];

    /**
     * Users logged in via OIDC will be allowed to access this website if their email address is an exact match to one of these emails.
     *
     * @title Authorized Emails for OIDC
     * @items {"type": "string", "default": ""}
     * @type array
     */
    emailsOidc: string[] = [];

    public static getFieldOrder(): string[] {
        return ["enabled", "domainsAaf", "emailsAaf", "domainsOidc", "emailsOidc",];
    }
}

export const AUTHORIZED_DOMAINS_EMAILS_SCHEMA = {
    type: 'object',
    title: 'admin-config-label-authorized-domains-and-emails',
    properties: {
        enabled: {
            type: 'boolean',
            title: 'admin-config-label-enabled',
            default: false
        },
        domainsAaf: {
            type: 'array',
            title: 'admin-config-label-authorized-domains-for-aaf',
            items: {
                type: 'string',
                default: ''
            },
            default: []
        },
        emailsAaf: {
            type: 'array',
            title: 'admin-config-label-authorized-emails-for-aaf',
            items: {
                type: 'string',
                default: ''
            },
            default: []
        },
        domainsOidc: {
            type: 'array',
            title: 'admin-config-label-authorized-domains-for-oidc',
            items: {
                type: 'string',
                default: ''
            },
            default: []
        },
        emailsOidc: {
            type: 'array',
            title: 'admin-config-label-authorized-emails-for-oidc',
            items: {
                type: 'string',
                default: ''
            },
            default: []
        }
    },
    required: ['enabled', 'domainsAaf', 'emailsAaf', 'domainsOidc', 'emailsOidc']
};
