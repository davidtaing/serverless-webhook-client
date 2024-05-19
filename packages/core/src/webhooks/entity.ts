import { Entity, Service } from 'electrodb'
import { Table } from 'sst/node/table'
import { docClient } from '../database'

const entityConfig = { table: Table.Webhooks.tableName, client: docClient }

export const WebhookEntity = new Entity(
  {
    model: {
      version: '1',
      entity: 'webhook',
      service: 'serverless-webhook-client',
    },
    attributes: {
      PK: {
        type: 'string',
        required: true,
        readOnly: true,
      },
      SK: {
        type: 'string',
        required: true,
        readOnly: true,
      },
      origin: {
        type: 'string',
        required: true,
        readOnly: true,
      },
      event_type: {
        type: 'string',
        required: true,
        readOnly: true,
      },
      created_at: {
        type: 'string',
        required: true,
        readOnly: true,
      },
      payload: {
        type: 'string',
        required: true,
        readOnly: true,
      },
    },
    indexes: {
      primary: {
        pk: {
          field: 'PK',
          composite: [],
        },
        sk: {
          field: 'SK',
          composite: [],
        },
      },
    },
  },
  entityConfig
)

export const WebhookStatusEntity = new Entity(
  {
    model: {
      version: '1',
      entity: 'webhook',
      service: 'serverless-webhook-client',
    },
    attributes: {
      PK: {
        type: 'string',
        required: true,
        readOnly: true,
      },
      SK: {
        type: 'string',
        required: true,
        readOnly: true,
      },
      status: {
        type: 'string',
        required: true,
      },
      retries: {
        type: 'number',
        required: true,
      },
    },
    indexes: {
      primary: {
        pk: {
          field: 'PK',
          composite: [],
        },
        sk: {
          field: 'SK',
          composite: [],
        },
      },
    },
  },
  entityConfig
)

export const WebhookService = new Service(
  {
    webhook: WebhookEntity,
    status: WebhookStatusEntity,
  },
  entityConfig
)
