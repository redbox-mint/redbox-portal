import crypto from 'crypto';
import type { JobParameters } from 'agenda';
import type { SqsJobEnvelope, SqsJobEnvelopeWithMeta, SqsRuntimeMetadata } from './types.js';

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeTimestamp(value: unknown, fieldName: string): string {
	if (typeof value === 'string' && Number.isFinite(Date.parse(value))) {
		return value;
	}
	if (typeof value === 'number' && Number.isFinite(value) && Number.isFinite(new Date(value).getTime())) {
		return new Date(value).toISOString();
	}
	throw new Error(`Invalid SQS job envelope: ${fieldName} must be a valid timestamp`);
}

function normalizeOptionalTimestamp(value: unknown, fieldName: string): string | null {
	if (value === null || value === undefined) {
		return null;
	}
	return normalizeTimestamp(value, fieldName);
}

export const SQS_METADATA = Symbol('agenda:sqs-metadata');

export function getSqsMetadata(job: JobParameters): SqsRuntimeMetadata | undefined {
	return (job as JobParameters & { [SQS_METADATA]?: SqsRuntimeMetadata })[SQS_METADATA];
}

export function setSqsMetadata(job: JobParameters, metadata: SqsRuntimeMetadata): void {
	(job as JobParameters & { [SQS_METADATA]?: SqsRuntimeMetadata })[SQS_METADATA] = metadata;
}

export function clearSqsMetadata(job: JobParameters): void {
	delete (job as JobParameters & { [SQS_METADATA]?: SqsRuntimeMetadata })[SQS_METADATA];
}

export class SqsMessageCodec {
	encode(job: JobParameters, queuedAt = new Date()): SqsJobEnvelope {
		return {
			backend: 'sqs',
			id: job._id?.toString() || crypto.randomUUID(),
			name: job.name,
			data: job.data,
			priority: job.priority ?? 0,
			type: 'normal',
			queuedAt: queuedAt.toISOString(),
			scheduledAt: job.nextRunAt ? job.nextRunAt.toISOString() : null
		};
	}

	decode(messageBody: string): SqsJobEnvelopeWithMeta {
		let parsed: unknown;
		try {
			parsed = JSON.parse(messageBody);
		} catch {
			throw new Error(`Invalid JSON in SQS message: ${messageBody}`);
		}

		if (!isRecord(parsed)) {
			throw new Error('Invalid SQS job envelope: message must be a JSON object');
		}
		if (parsed.backend !== 'sqs') {
			throw new Error('Invalid SQS job envelope: backend must be "sqs"');
		}
		if (typeof parsed.id !== 'string' || parsed.id.length === 0) {
			throw new Error('Invalid SQS job envelope: id must be a non-empty string');
		}
		if (typeof parsed.name !== 'string' || parsed.name.length === 0) {
			throw new Error('Invalid SQS job envelope: name must be a non-empty string');
		}
		if (typeof parsed.priority !== 'number' || !Number.isFinite(parsed.priority)) {
			throw new Error('Invalid SQS job envelope: priority must be a finite number');
		}
		if (parsed.type !== 'normal') {
			throw new Error('Invalid SQS job envelope: type must be "normal"');
		}

		return {
			...parsed,
			queuedAt: normalizeTimestamp(parsed.queuedAt, 'queuedAt'),
			scheduledAt: normalizeOptionalTimestamp(parsed.scheduledAt, 'scheduledAt')
		} as SqsJobEnvelopeWithMeta;
	}
}
