/**
 * Figshare API Config Interface
 * (sails.config.figshareAPI)
 * 
 * Figshare integration configuration.
 */

export interface FigshareApiConfig {
    frontEndURL: string;
    baseURL: string;
    APIToken: string;
    attachmentsTempDir: string;
    attachmentsFigshareTempDir: string;
    diskSpaceThreshold: number;
    testMode: boolean;
    extraVerboseLogging: boolean;
    testUsers: unknown[];
    testLicenses: unknown[];
    testCategories: unknown[];
    testResponse: unknown;
    mapping: {
        figshareItemGroupId: number;
        figshareItemType: string;
        figshareAuthorUserId: string;
        figshareCurationStatus: string;
        figshareCurationStatusTargetValue: string;
        figshareDisableUpdateByCurationStatus: boolean;
        figshareNeedsPublishAfterFileUpload: boolean;
        figshareForceEmbargoUpdateAlways: boolean;
        figshareOnlyPublishSelectedAttachmentFiles: boolean;
        figshareOnlyPublishSelectedLocationURLs: boolean;
        figshareScheduledTransitionRecordWorkflowFromArticlePropertiesJob: {
            enabled: boolean;
            namedQuery: string;
            targetStep: string;
            paramMap: Record<string, unknown>;
            figshareTargetFieldKey: string;
            figshareTargetFieldValue: string;
            username: string;
            userType: string;
        };
        recordFigArticleId: string;
        recordFigArticleURL: string[];
        recordDataLocations: string;
        recordAuthorExternalName: string;
        recordAuthorUniqueBy: string;
        response: {
            entityId: string;
            location: string;
            article: unknown[];
        };
        [key: string]: unknown;
    };
}

// Note: Default values contain extensive mapping configuration.
// The original config/figshareAPI.js file should be kept.
