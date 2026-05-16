import crypto from 'crypto';
import debug from 'debug';
import {
	ChangeMessageVisibilityCommand,
	DeleteMessageCommand,
	ReceiveMessageCommand,
	SendMessageCommand,
	SQSClient
} from '@aws-sdk/client-sqs';
import type {
	JobParameters,
	JobRepository,
	JobRepositoryOptions,
	JobsOverview,
	JobsQueryOptions,
	JobsResult,
	RemoveJobsOptions
} from 'agenda';
import { toJobId } from 'agenda';
import { SqsUnsupportedFeatureError } from './errors.js';
import { SqsMessageCodec, getSqsMetadata, setSqsMetadata } from './SqsMessageCodec.js';
import type { SqsBackendConfig, SqsJobEnvelope, SqsRuntimeMetadata } from './types.js';

const log = debug('agenda:sqs:repository');

export class SqsJobRepository implements JobRepository {
	private readonly codec = new SqsMessageCodec();
	private readonly queueUrl: string;
	private readonly waitTimeSeconds: number;
	private readonly receiveBatchSize: number;
	private readonly visibilityTimeoutSeconds: number;
	private readonly unknownJobPolicy: NonNullable<SqsBackendConfig['unknownJobPolicy']>;
	private readonly fifoEnabled: boolean;
	private readonly fifoConfig: SqsBackendConfig['fifo'];
	private readonly messageBuffer = new Map<string, JobParameters[]>();

	constructor(private readonly client: SQSClient, config: SqsBackendConfig) {
		this.queueUrl = config.queueUrl;
		this.waitTimeSeconds = config.waitTimeSeconds ?? 20;
		this.receiveBatchSize = config.receiveBatchSize ?? 10;
		this.visibilityTimeoutSeconds = config.visibilityTimeoutSeconds ?? 300;
		this.unknownJobPolicy = config.unknownJobPolicy ?? 'release';
		this.fifoEnabled = config.fifo?.enabled ?? config.queueUrl.endsWith('.fifo');
		this.fifoConfig = config.fifo;
	}

	async connect(): Promise<void> { }
	async disconnect(): Promise<void> {
		const releasePromises: Promise<void>[] = [];
		for (const buffered of this.messageBuffer.values()) {
			for (const job of buffered) {
				releasePromises.push(this.release(job));
			}
		}
		const results = await Promise.allSettled(releasePromises);
		for (const result of results) {
			if (result.status === 'rejected') {
				log('failed to release buffered message %O', result.reason);
			}
		}
		this.messageBuffer.clear();
	}

	private bufferJob(job: JobParameters): void {
		const existing = this.messageBuffer.get(job.name) ?? [];
		existing.push(job);
		this.messageBuffer.set(job.name, existing);
	}

	private validateJob(job: JobParameters): void {
		if (job.type === 'single') throw new SqsUnsupportedFeatureError('single jobs');
		if (job.repeatInterval) throw new SqsUnsupportedFeatureError('repeatInterval');
		if (job.repeatAt) throw new SqsUnsupportedFeatureError('repeatAt');
		if (job.unique) throw new SqsUnsupportedFeatureError('unique jobs');
		if (job.uniqueOpts) throw new SqsUnsupportedFeatureError('uniqueOpts');
		if (job.disabled) throw new SqsUnsupportedFeatureError('disabled jobs');
		if (job.fork) throw new SqsUnsupportedFeatureError('fork mode');
		if ((job.priority ?? 0) !== 0) throw new SqsUnsupportedFeatureError('non-zero priority');
	}

	private encodeBody(job: JobParameters): SqsJobEnvelope {
		return this.codec.encode(job);
	}

	private async send(body: SqsJobEnvelope, delaySeconds?: number): Promise<void> {
		const payload = JSON.stringify(body);
		const fifo = this.fifoEnabled ? this.buildFifo(body, payload) : {};
		await this.client.send(
			new SendMessageCommand({
				QueueUrl: this.queueUrl,
				MessageBody: payload,
				DelaySeconds: delaySeconds,
				...fifo
			})
		);
	}

	private buildFifo(body: SqsJobEnvelope, payload: string) {
		const groupId =
			typeof this.fifoConfig?.messageGroupId === 'function'
				? this.fifoConfig.messageGroupId(body)
				: this.fifoConfig?.messageGroupId || 'agenda';
		const deduplicationId =
			typeof this.fifoConfig?.deduplicationIdStrategy === 'function'
				? this.fifoConfig.deduplicationIdStrategy(body)
				: this.fifoConfig?.deduplicationIdStrategy === 'content'
					? crypto.createHash('sha256').update(payload).digest('hex')
					: body.id;
		return {
			MessageGroupId: groupId,
			MessageDeduplicationId: deduplicationId
		};
	}

	async saveJob<DATA = unknown>(
		job: JobParameters<DATA>,
		options: JobRepositoryOptions | undefined
	): Promise<JobParameters<DATA>> {
		this.validateJob(job);
		const now = new Date();
		const id = job._id?.toString() || crypto.randomUUID();
		const nextRunAt = job.nextRunAt ?? now;
		const delaySeconds = Math.max(0, Math.ceil((nextRunAt.getTime() - now.getTime()) / 1000));
		if (delaySeconds > 900) throw new SqsUnsupportedFeatureError('schedule delays greater than 15 minutes');

		const saved: JobParameters<DATA> = {
			...job,
			_id: toJobId(id),
			nextRunAt,
			lastModifiedBy: options?.lastModifiedBy
		};
		await this.send(this.encodeBody(saved), delaySeconds);
		return saved;
	}

	async saveJobState(job: JobParameters, _options: JobRepositoryOptions | undefined): Promise<void> {
		const meta = getSqsMetadata(job);
		if (!meta?.receiptHandle) return;
		if (job.lastFinishedAt && !job.failedAt) {
			await this.client.send(new DeleteMessageCommand({ QueueUrl: this.queueUrl, ReceiptHandle: meta.receiptHandle }));
			return;
		}
		if (job.lockedAt) {
			await this.client.send(new ChangeMessageVisibilityCommand({
				QueueUrl: this.queueUrl,
				ReceiptHandle: meta.receiptHandle,
				VisibilityTimeout: this.visibilityTimeoutSeconds
			}));
			return;
		}
		if (job.nextRunAt && job.nextRunAt.getTime() > Date.now()) {
			const delay = Math.min(43200, Math.ceil((job.nextRunAt.getTime() - Date.now()) / 1000));
			await this.client.send(new ChangeMessageVisibilityCommand({
				QueueUrl: this.queueUrl,
				ReceiptHandle: meta.receiptHandle,
				VisibilityTimeout: delay
			}));
		}
	}

	async getNextJobToRun(
		jobName: string,
		_nextScanAt: Date,
		_lockDeadline: Date,
		_now: Date | undefined,
		_options: JobRepositoryOptions | undefined
	): Promise<JobParameters | undefined> {
		const buffered = this.messageBuffer.get(jobName);
		if (buffered?.length) {
			return buffered.shift();
		}
		const response = await this.client.send(
			new ReceiveMessageCommand({
				QueueUrl: this.queueUrl,
				MaxNumberOfMessages: this.receiveBatchSize,
				WaitTimeSeconds: this.waitTimeSeconds,
				VisibilityTimeout: this.visibilityTimeoutSeconds,
				MessageSystemAttributeNames: ['ApproximateReceiveCount'],
				MessageAttributeNames: ['All']
			})
		);
		let matchedJob: JobParameters | undefined;
		for (const message of response.Messages ?? []) {
			if (!message.Body) continue;
			try {
				const envelope = this.codec.decode(message.Body);
				const metadata: SqsRuntimeMetadata = {
					messageId: message.MessageId,
					receiptHandle: message.ReceiptHandle,
					receiveCount: Number(message.Attributes?.ApproximateReceiveCount ?? '1')
				};
				const job = this.toJob(envelope, metadata);
				if (job.name === jobName && !matchedJob) {
					matchedJob = job;
					continue;
				}
				this.bufferJob(job);
			} catch (error) {
				log('dropping malformed message %O', error);
			}
		}
		return matchedJob;
	}

	private toJob(envelope: SqsJobEnvelope, metadata: SqsRuntimeMetadata): JobParameters {
		const job: JobParameters = {
			_id: toJobId(envelope.id),
			name: envelope.name,
			priority: envelope.priority,
			nextRunAt: new Date(),
			type: 'normal',
			lockedAt: new Date(),
			failCount: Math.max((metadata.receiveCount ?? 1) - 1, 0),
			data: envelope.data
		};
		setSqsMetadata(job, metadata);
		return job;
	}

	async unlockJob(job: JobParameters): Promise<void> {
		const meta = getSqsMetadata(job);
		if (!meta?.receiptHandle) return;
		await this.release(job);
	}

	async unlockJobs(jobIds: (string | JobParameters['_id'])[]): Promise<void> {
		for (const id of jobIds) {
			const flattened = String(id);
			for (const jobs of this.messageBuffer.values()) {
				const match = jobs.find(job => job._id?.toString() === flattened);
				if (match) await this.unlockJob(match);
			}
		}
	}

	private async release(job: JobParameters): Promise<void> {
		const meta = getSqsMetadata(job);
		if (!meta?.receiptHandle) return;
		await this.client.send(
			new ChangeMessageVisibilityCommand({
				QueueUrl: this.queueUrl,
				ReceiptHandle: meta.receiptHandle,
				VisibilityTimeout: 0
			})
		);
	}

	async queryJobs(_options?: JobsQueryOptions): Promise<JobsResult> {
		throw new SqsUnsupportedFeatureError('queryJobs');
	}
	async getJobsOverview(): Promise<JobsOverview[]> {
		throw new SqsUnsupportedFeatureError('getJobsOverview');
	}
	async getDistinctJobNames(): Promise<string[]> {
		throw new SqsUnsupportedFeatureError('getDistinctJobNames');
	}
	async getJobById(_id: string): Promise<JobParameters | null> {
		throw new SqsUnsupportedFeatureError('getJobById');
	}
	async getQueueSize(): Promise<number> {
		return 0;
	}
	async removeJobs(_options: RemoveJobsOptions): Promise<number> {
		throw new SqsUnsupportedFeatureError('removeJobs');
	}
	async lockJob(): Promise<JobParameters | undefined> {
		throw new SqsUnsupportedFeatureError('lockJob');
	}
	async disableJobs(_options: RemoveJobsOptions): Promise<number> {
		throw new SqsUnsupportedFeatureError('disableJobs');
	}
	async enableJobs(_options: RemoveJobsOptions): Promise<number> {
		throw new SqsUnsupportedFeatureError('enableJobs');
	}
	async purgeAllJobs(): Promise<number> {
		throw new SqsUnsupportedFeatureError('purgeAllJobs');
	}
}
