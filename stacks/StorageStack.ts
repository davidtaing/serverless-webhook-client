import { Queue, StackContext, Table } from 'sst/constructs'
import { Duration } from 'aws-cdk-lib/core'

export function StorageStack({ stack }: StackContext) {
  const table = new Table(stack, 'Webhooks', {
    fields: {
      PK: 'string',
      created_at: 'string',
      origin: 'string',
      event_type: 'string',
      status: 'string',
      retries: 'number',
      payload: 'string',
    },
    primaryIndex: { partitionKey: 'PK', sortKey: 'created_at' },
    globalIndexes: {
      OriginIndex: { partitionKey: 'origin', sortKey: 'created_at' },
    },
    stream: 'new_image',
    consumers: {
      'process-webhook': {
        function: {
          handler: 'packages/functions/src/process.handler',
        },
        filters: [{ eventName: ['INSERT'] }],
      },
    },
  })

  const deadLetterQueue = new Queue(stack, 'DeadWebhookQueue', {})

  const queue = new Queue(stack, 'FailedWebhooksQueue', {
    consumer: {
      function: 'packages/functions/src/process-failed-webhook.handler',
      cdk: {
        eventSource: {
          reportBatchItemFailures: true,
        },
      },
    },
    cdk: {
      queue: {
        deliveryDelay: Duration.seconds(900),
        deadLetterQueue: {
          queue: deadLetterQueue.cdk.queue,
          maxReceiveCount: 2,
        },
      },
    },
  })

  table.bindToConsumer('process-webhook', [table, queue])
  queue.bind([table])

  return {
    table,
    failedWebhookQueue: queue,
  }
}
