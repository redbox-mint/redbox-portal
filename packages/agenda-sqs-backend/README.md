# @researchdatabox/agenda-sqs-backend

Amazon SQS backend for `agenda`.

## Install

```bash
pnpm add @researchdatabox/agenda-sqs-backend
```

## Usage

```ts
import { Agenda } from 'agenda';
import { SqsBackend } from '@researchdatabox/agenda-sqs-backend';

const agenda = new Agenda({
  backend: new SqsBackend({
    queueUrl: 'https://sqs.ap-southeast-2.amazonaws.com/123456789012/jobs',
    region: 'ap-southeast-2'
  })
});

agenda.define('send-email', async job => {
  console.log(job.attrs.data);
});

await agenda.start();
await agenda.now('send-email', { userId: 'u1' });
```

## Notes

- This backend is queue-only.
- It does not support recurring jobs, `every()`, unique jobs, or query-style job browsing.
- SQS scheduling is limited to 15 minutes of delay.
- Redrive and retries are handled by SQS visibility and your queue redrive policy.
- FIFO queues are supported when the queue URL ends with `.fifo` or FIFO is enabled in config.

## Configuration

```ts
new SqsBackend({
  queueUrl,
  region,
  waitTimeSeconds: 20,
  receiveBatchSize: 10,
  visibilityTimeoutSeconds: 300,
  unknownJobPolicy: 'release'
});
```
