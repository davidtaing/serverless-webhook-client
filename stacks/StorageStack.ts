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
      function: { handler: 'packages/functions/src/process-via-sqs.handler' },
      cdk: {
        eventSource: {
          reportBatchItemFailures: true,
        },
      },
    },
    cdk: {
      queue: {
        // 15 mins could be reasonable values in a real-world scenario
        // these values are set to 5 seconds for testing purposes
        deliveryDelay: Duration.seconds(5),
        visibilityTimeout: Duration.seconds(5),
        deadLetterQueue: {
          queue: deadLetterQueue.cdk.queue,
          maxReceiveCount: 2,
        },
        // long poll for SQS messages since this is not time sensitive
        receiveMessageWaitTime: Duration.seconds(20),
      },
    },
  })

  table.bindToConsumer('process-webhook', [table, queue])
  queue.bind([table, queue])

  return {
    table,
    failedWebhookQueue: queue,
  }
}
