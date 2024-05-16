import { Queue, StackContext, Table, use } from 'sst/constructs'

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

  const queue = new Queue(stack, 'FailedWebhooksQueue', {
    consumer: {
      function: 'packages/functions/src/process-failed-webhook.handler',
    },
  })

  table.bindToConsumer('process-webhook', [table, queue])
  queue.bind([table])

  return {
    table,
    failedWebhookQueue: queue,
  }
}
