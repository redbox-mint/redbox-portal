import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
	ChangeMessageVisibilityCommand,
	DeleteMessageCommand,
	ReceiveMessageCommand,
	SendMessageCommand,
	SQSClient
} from '@aws-sdk/client-sqs';
import { SqsBackend, SqsJobRepository, SqsMessageCodec, SQS_METADATA } from '../src/index.js';

function mockClient() {
	const send = vi.fn();
	const client = { send, destroy: vi.fn() } as unknown as SQSClient;
	return { client, send };
}

describe('SqsBackend', () => {
	beforeEach(() => vi.restoreAllMocks());

	it('sends a message when saving a job', async () => {
		const { client, send } = mockClient();
		send.mockResolvedValue({});
		const backend = new SqsBackend({ queueUrl: 'https://example.com/queue', sqsClient: client });
		await backend.connect();
		const repo = backend.repository;
		await repo.saveJob({
			name: 'send-email',
			priority: 0,
			nextRunAt: new Date(),
			type: 'normal',
			data: { userId: 'u1' }
		});
		expect(send.mock.calls.some(([cmd]) => cmd instanceof SendMessageCommand)).toBe(true);
	});

	it('receives jobs from SQS', async () => {
		const { client, send } = mockClient();
		send
			.mockResolvedValueOnce({})
			.mockResolvedValueOnce({
				Messages: [
					{
						Body: JSON.stringify({
							backend: 'sqs',
							id: 'job-1',
							name: 'send-email',
							data: { userId: 'u1' },
							priority: 0,
							type: 'normal',
							queuedAt: new Date().toISOString(),
							scheduledAt: null
						}),
						ReceiptHandle: 'rh-1',
						MessageId: 'mid-1',
						Attributes: { ApproximateReceiveCount: '2' }
					}
				]
			});
		const backend = new SqsBackend({ queueUrl: 'https://example.com/queue', sqsClient: client });
		await backend.connect();
		const repo = backend.repository;
		const job = await repo.getNextJobToRun('send-email', new Date(), new Date(), undefined, undefined);
		expect(job?.name).toBe('send-email');
		expect(job?.failCount).toBe(1);
		expect(send.mock.calls.some(([cmd]) => cmd instanceof ReceiveMessageCommand)).toBe(true);
	});

	it('touches and completes using message visibility commands', async () => {
		const { client, send } = mockClient();
		send.mockResolvedValue({});
		const backend = new SqsBackend({ queueUrl: 'https://example.com/queue', sqsClient: client });
		await backend.connect();
		const repo = backend.repository;
		const job = {
			_id: 'job-1',
			name: 'send-email',
			priority: 0,
			nextRunAt: new Date(),
			type: 'normal',
			lockedAt: new Date(),
			lastFinishedAt: new Date(),
			data: {}
		} as any;
		job[SQS_METADATA] = { receiptHandle: 'rh-1' };
		await repo.saveJobState(job, undefined);
		expect(send.mock.calls.some(([cmd]) => cmd instanceof DeleteMessageCommand)).toBe(true);
		job.lastFinishedAt = undefined;
		await repo.saveJobState(job, undefined);
		expect(send.mock.calls.some(([cmd]) => cmd instanceof ChangeMessageVisibilityCommand)).toBe(true);
	});

	it('wraps invalid JSON and rejects malformed envelopes', () => {
		const codec = new SqsMessageCodec();

		expect(() => codec.decode('not-json')).toThrow('Invalid JSON in SQS message: not-json');
		expect(() => codec.decode(JSON.stringify({ backend: 'sqs', id: 'job-1', name: 'send-email' }))).toThrow(
			'Invalid SQS job envelope: priority must be a finite number'
		);
	});

	it('releases all buffered jobs during disconnect and clears the buffer', async () => {
		const { client, send } = mockClient();
		send.mockImplementation((command: unknown) => {
			if (command instanceof ChangeMessageVisibilityCommand && command.input.ReceiptHandle === 'rh-2') {
				return Promise.reject(new Error('release failed'));
			}
			return Promise.resolve({});
		});

		const repo = new SqsJobRepository(client, { queueUrl: 'https://example.com/queue' });
		(repo as any).messageBuffer.set('send-email', [
			{
				_id: 'job-1',
				name: 'send-email',
				priority: 0,
				type: 'normal',
				data: {},
				[SQS_METADATA]: { receiptHandle: 'rh-1' }
			},
			{
				_id: 'job-2',
				name: 'send-email',
				priority: 0,
				type: 'normal',
				data: {},
				[SQS_METADATA]: { receiptHandle: 'rh-2' }
			}
		]);

		await expect(repo.disconnect()).resolves.toBeUndefined();
		expect(send).toHaveBeenCalledTimes(2);
		expect((repo as any).messageBuffer.size).toBe(0);
	});

	it('buffers the rest of a receive batch after returning the first matching job', async () => {
		const { client, send } = mockClient();
		send.mockResolvedValue({
			Messages: [
				{
					Body: JSON.stringify({
						backend: 'sqs',
						id: 'job-1',
						name: 'send-email',
						data: { userId: 'u1' },
						priority: 0,
						type: 'normal',
						queuedAt: new Date().toISOString(),
						scheduledAt: null
					}),
					ReceiptHandle: 'rh-1',
					MessageId: 'mid-1',
					Attributes: { ApproximateReceiveCount: '1' }
				},
				{
					Body: JSON.stringify({
						backend: 'sqs',
						id: 'job-2',
						name: 'other-job',
						data: { userId: 'u2' },
						priority: 0,
						type: 'normal',
						queuedAt: new Date().toISOString(),
						scheduledAt: null
					}),
					ReceiptHandle: 'rh-2',
					MessageId: 'mid-2',
					Attributes: { ApproximateReceiveCount: '2' }
				},
				{
					Body: JSON.stringify({
						backend: 'sqs',
						id: 'job-3',
						name: 'send-email',
						data: { userId: 'u3' },
						priority: 0,
						type: 'normal',
						queuedAt: new Date().toISOString(),
						scheduledAt: null
					}),
					ReceiptHandle: 'rh-3',
					MessageId: 'mid-3',
					Attributes: { ApproximateReceiveCount: '3' }
				}
			]
		});

		const repo = new SqsJobRepository(client, { queueUrl: 'https://example.com/queue' });
		const firstMatch = await repo.getNextJobToRun('send-email', new Date(), new Date(), undefined, undefined);
		const bufferedMatch = await repo.getNextJobToRun('send-email', new Date(), new Date(), undefined, undefined);
		const bufferedOther = await repo.getNextJobToRun('other-job', new Date(), new Date(), undefined, undefined);

		expect(firstMatch?.name).toBe('send-email');
		expect(bufferedMatch?._id?.toString()).toBe('job-3');
		expect(bufferedOther?._id?.toString()).toBe('job-2');
		expect(send).toHaveBeenCalledTimes(1);
	});
});
