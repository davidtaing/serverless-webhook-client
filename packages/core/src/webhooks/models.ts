import { Entity, Service } from 'electrodb'
import { Table } from 'sst/node/table'
import { docClient } from '../database'
import { WebhookStatusValues } from './types'

const entityConfig = { table: Table.Webhooks.tableName, client: docClient }

const WebhookEntity = new Entity(
  {
    model: {
      version: '1',
      entity: 'webhook',
      service: 'serverless-webhook-client',
    },
    attributes: {
      id: {
        type: 'string',
        required: true,
        readOnly: true,
      },
      origin: {
        type: 'string',
        required: true,
        readOnly: true,
      },
      type: {
        type: 'string',
        required: true,
        readOnly: true,
      },
      created: {
        type: 'string',
        required: true,
        readOnly: true,
      },
      payload: {
        type: 'any',
        required: true,
        readOnly: true,
      },
    },
    indexes: {
      webhook: {
        pk: {
          field: 'PK',
          composite: ['id'],
          casing: 'upper',
          template: 'WH#${id}',
        },
        sk: {
          field: 'SK',
          composite: [],
          casing: 'upper',
          template: 'WEBHOOK',
        },
      },
    },
  },
  entityConfig
)

const WebhookStatusEntity = new Entity(
  {
    model: {
      version: '1',
      entity: 'webhookStatus',
      service: 'serverless-webhook-client',
    },
    attributes: {
      id: {
        type: 'string',
        required: true,
        readOnly: true,
      },
      status: {
        type: 'string',
        required: true,
        default: WebhookStatusValues.RECEIVED,
      },
      retries: {
        type: 'number',
        required: true,
        default: 0,
      },
    },
    indexes: {
      status: {
        pk: {
          field: 'PK',
          composite: ['id'],
          casing: 'upper',
          template: 'WH#${id}',
        },
        sk: {
          field: 'SK',
          composite: [],
          casing: 'upper',
          template: 'STATUS',
        },
      },
    },
  },
  entityConfig
)

export const WebhookService = new Service(
  {
    webhooks: WebhookEntity,
    statuses: WebhookStatusEntity,
  },
  entityConfig
)
