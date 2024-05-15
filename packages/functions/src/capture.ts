import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb'
import to from 'await-to-js'

import {
  APIGatewayProxyHandlerV2,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda'

import { Table } from 'sst/node/table'

const dynamoClient = new DynamoDBClient()
const docClient = DynamoDBDocumentClient.from(dynamoClient)

export const handler: APIGatewayProxyHandlerV2 = async event => {
  if (!event.body) {
    return {
      statusCode: 404,
      body: JSON.stringify({ error: true }),
    }
  }

  switch ((event as any).rawPath) {
    case '/webhooks/bigcommerce':
      return capture(event.body, 'bigcommerce')
    case '/webhooks/stripe':
      return capture(event.body, 'stripe')
    default:
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Webhook not supported' }),
      }
  }
}

type WebhookOrigin = 'bigcommerce' | 'stripe'

/**
 * Captures the webhook payload and saves it to DynamoDB.
 * This will trigger webhook processing Lambda functions via DynamoDB Streams.
 * @param rawBody - Raw JSON webhook payload
 * @param origin - Origin of the webhook. e.g. 'bigcommerce' or 'stripe'
 * @returns The API Gateway response.
 */
const capture = async (
  rawBody: string,
  origin: WebhookOrigin
): Promise<APIGatewayProxyStructuredResultV2> => {
  const payload = JSON.parse(rawBody)

  const command = new PutCommand({
    TableName: Table.Webhooks.tableName,
    Item: mappers[origin](payload),
  })

  const [error, response] = await to(docClient.send(command))

  if (error) {
    let message
    if (error instanceof Error) {
      message = error.message
    } else {
      message = String(error)
    }
    return {
      statusCode: 500,
      body: JSON.stringify({ error: message }),
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify(response),
  }
}

type Mappers = {
  [key in WebhookOrigin]: (payload: any) => any
}

/**
 * Collection of mapper functions to transform webhooks from multiple providers
 * to our DynamoDB schema
 */
const mappers: Mappers = {
  bigcommerce: bigcommerceWebhookMapper,
  stripe: stripeWebhookMapper,
} as const

function bigcommerceWebhookMapper(payload: any) {
  return {
    PK: payload.hash,
    created_at: new Date(payload.created_at * 1000).toISOString(),
    origin: 'bigcommerce',
    event_type: payload.scope,
    status: 'received',
    payload,
  }
}

function stripeWebhookMapper(payload: any) {
  return {
    PK: payload.id,
    created: new Date(payload.created_at * 1000).toISOString(),
    origin: 'stripe',
    event_type: payload.type,
    status: 'received',
    payload,
  }
}
