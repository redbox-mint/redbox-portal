import debug from 'debug';
import { SQSClient, GetQueueAttributesCommand } from '@aws-sdk/client-sqs';
import type { AgendaBackend, JobRepository } from 'agenda';
import { SqsJobRepository } from './SqsJobRepository.js';
import type { SqsBackendConfig } from './types.js';

const log = debug('agenda:sqs:backend');

export class SqsBackend implements AgendaBackend {
	readonly name = 'SQS';
	readonly repository: JobRepository;
	readonly ownsConnection = true;

	private readonly client: SQSClient;
	private readonly ownsClient: boolean;
	private readonly repositoryImpl: SqsJobRepository;

	constructor(private readonly config: SqsBackendConfig) {
		this.ownsClient = !config.sqsClient;
		this.client = config.sqsClient ?? new SQSClient({ region: config.region });
		this.repositoryImpl = new SqsJobRepository(this.client, config);
		this.repository = this.repositoryImpl;
	}

	async connect(): Promise<void> {
		log('connecting');
		await this.client.send(new GetQueueAttributesCommand({ QueueUrl: this.config.queueUrl, AttributeNames: ['QueueArn'] }));
		await this.repositoryImpl.connect();
	}

	async disconnect(): Promise<void> {
		log('disconnecting');
		await this.repositoryImpl.disconnect();
		if (this.ownsClient) {
			this.client.destroy();
		}
	}
}
