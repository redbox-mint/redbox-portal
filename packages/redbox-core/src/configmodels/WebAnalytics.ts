import {AppConfig} from './AppConfig.interface';

/**
 * Branding-aware web analytics configuration.
 *
 * A single analytics provider can be enabled per branding. The provider is
 * selected via the {@link WebAnalytics.provider} enum and rendered in the page
 * `<head>` by `views/default/default/analytics.ejs`. The `contentSecurityPolicy`
 * policy also reads this config to allow-list the provider's required domains.
 */
export class WebAnalytics extends AppConfig {
    /**
     * @title Enabled
     */
    enabled: boolean = false;

    /**
     * The analytics provider to load.
     *
     * @title Provider
     */
    provider: string = 'googleAnalytics';

    /**
     * The provider tracking identifier. For Google Analytics 4 this is the
     * measurement ID (e.g. `G-XXXXXXXXXX`); for Google Tag Manager this is the
     * container ID (e.g. `GTM-XXXXXXX`).
     *
     * @title Tracking / Measurement / Container ID
     */
    trackingId: string = '';

    public static getFieldOrder(): string[] {
        return ["enabled", "provider", "trackingId"]
    }
}

export const WEB_ANALYTICS_SCHEMA = {
    type: 'object',
    title: 'Web Analytics',
    properties: {
        enabled: {
            type: 'boolean',
            title: 'Enabled',
            default: false
        },
        provider: {
            type: 'string',
            title: 'Provider',
            default: 'googleAnalytics',
            enum: ['googleAnalytics', 'googleTagManager']
        },
        trackingId: {
            type: 'string',
            title: 'Tracking / Measurement / Container ID',
            default: '',
            description: 'GA4 measurement ID (G-XXXXXXXXXX) or GTM container ID (GTM-XXXXXXX).'
        }
    },
    required: ['enabled', 'provider']
};
