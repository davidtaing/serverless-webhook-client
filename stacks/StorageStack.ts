import { StackContext, Table } from 'sst/constructs'

export function StorageStack({ stack }: StackContext) {
  const table = new Table(stack, 'Webhooks', {
    fields: {
      PK: 'string',
      created_at: 'string',
      origin: 'string',
      event_type: 'string',
      status: 'string',
      payload: 'string',
    },
    primaryIndex: { partitionKey: 'PK', sortKey: 'created_at' },
    globalIndexes: {
      OriginIndex: { partitionKey: 'origin', sortKey: 'created_at' },
    },
    stream: 'keys_only',
    consumers: {
      process: {
        function: 'packages/functions/src/process.handler',
        filters: [{ eventName: ['INSERT'] }],
      },
    },
  })

  return {
    table,
  }
}
