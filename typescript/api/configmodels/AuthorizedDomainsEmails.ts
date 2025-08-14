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