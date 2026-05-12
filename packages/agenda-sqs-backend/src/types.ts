import type { SQSClient } from '@aws-sdk/client-sqs';

export interface SqsFifoConfig {
	enabled?: boolean;
	messageGroupId?: string | ((job: SqsJobEnvelope) => string);
	deduplicationIdStrategy?: 'job-id' | 'content' | ((job: SqsJobEnvelope) => string);
}

export interface SqsBackendConfig {
	queueUrl: string;
	region?: string;
	sqsClient?: SQSClient;
	waitTimeSeconds?: number;
	receiveBatchSize?: number;
	visibilityTimeoutSeconds?: number;
	fifo?: SqsFifoConfig;
	unknownJobPolicy?: 'release' | 'delete' | 'leave';
}

export interface SqsJobEnvelope<DATA = unknown> {
	backend: 'sqs';
	id: string;
	name: string;
	data?: DATA;
	priority: number;
	type: 'normal';
	queuedAt: string;
	scheduledAt: string | null;
}

export interface SqsRuntimeMetadata {
	receiptHandle?: string;
	messageId?: string;
	receiveCount?: number;
}

export type SqsJobEnvelopeWithMeta<DATA = unknown> = SqsJobEnvelope<DATA> & {
	__sqs?: SqsRuntimeMetadata;
};
