export const attachmentFields = {
  attachmentmetadata: {
    oid: {
      type: 'string',
      required: true,
      validations: {},
    },
    fileId: {
      type: 'string',
      required: true,
      validations: {},
    },
    storageKey: {
      type: 'string',
      required: true,
      validations: {},
    },
    isJournal: {
      type: 'boolean',
      defaultsTo: false,
      required: false,
    },
    attachmentId: {
      type: 'string',
      allowNull: true,
      required: false,
    },
    operation: {
      type: 'string',
      validations: {
        isIn: ['add', 'finalize', 'delete'],
      },
      required: false,
    },
    mutationState: {
      type: 'string',
      validations: {
        isIn: [
          'prepared',
          'pending',
          'applied',
          'incomplete',
          'unknown',
          'cancelled',
          'cleanup-pending',
          'cleanup-checking',
          'cleanup-removing',
          'cleaned',
          'staging-available',
          'staging-preparing',
          'staging-cleanup',
        ],
      },
      required: false,
    },
    generation: {
      type: 'string',
      allowNull: true,
      required: false,
    },
    mutationFileId: {
      type: 'string',
      allowNull: true,
      required: false,
    },
    coordinationToken: {
      type: 'string',
      allowNull: true,
      required: false,
    },
    attemptCount: {
      type: 'number',
      defaultsTo: 0,
      required: false,
    },
    lastAttemptAt: {
      type: 'string',
      allowNull: true,
      required: false,
    },
    coordinationLeaseExpiresAt: {
      type: 'string',
      allowNull: true,
      required: false,
    },
    lastSafeErrorCode: {
      type: 'string',
      allowNull: true,
      required: false,
    },
    contentType: {
      type: 'string',
      required: false,
    },
    contentLength: {
      type: 'number',
      required: false,
    },
    etag: {
      type: 'string',
      required: false,
    },
    lastModified: {
      type: 'string',
      required: false,
    },
    filename: {
      type: 'string',
      required: false,
    },
    mimeType: {
      type: 'string',
      required: false,
    },
    uploadedBy: {
      type: 'string',
      required: false,
    },
    attachmentField: {
      type: 'string',
      required: false,
    },
    lastAccessedAt: {
      type: 'string',
      required: false,
    },
    lastAccessedBy: {
      type: 'string',
      required: false,
    },
    accessCount: {
      type: 'number',
      defaultsTo: 0,
      required: false,
    },
  },
  attachmentaccessaudit: {
    oid: {
      type: 'string',
      required: true,
    },
    fileId: {
      type: 'string',
      required: false,
    },
    storageKey: {
      type: 'string',
      required: false,
    },
    action: {
      type: 'string',
      required: true,
    },
    accessedBy: {
      type: 'string',
      required: false,
    },
    accessedAt: {
      type: 'string',
      required: true,
    },
    itemCount: {
      type: 'number',
      required: false,
    },
  },
} as const;
