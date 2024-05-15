import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb'
import to from 'await-to-js'

import {
  APIGatewayProxyHandlerV2,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda'

import { Table } from 'sst/node/table'

type WebhookOrigin = 'bigcommerce' | 'stripe'

/**
 * Collection of functions that extract the id (PK) and created at (SK) from the
 * webhook payload.
 */
type ExtractCompositeKeys = {
  [key in WebhookOrigin]: (payload: any) => { PK: string; created_at: string }
}

/**
 * Collection of mapper functions to transform webhooks from multiple providers
 * to our DynamoDB schema
 */
type Mappers = {
  [key in WebhookOrigin]: (payload: any) => any
}

const dynamoClient = new DynamoDBClient()
const docClient = DynamoDBDocumentClient.from(dynamoClient)

/**
 * Lambda function entry point. Performs validation on the webhook before capturing
 * it in DynamoDB.
 *
 * Processing will be handled by other Lambda functions via DynamoDB Streams.
 * @param event - The API Gateway event.
 * @returns The API Gateway response.
 */
export const handler: APIGatewayProxyHandlerV2 = async event => {
  if (!event.body) {
    return {
      statusCode: 404,
      body: JSON.stringify({ error: true }),
    }
  }

  const origin = determineOrigin((event as any).rawPath)

  if (origin === 'INVALID_ORIGIN') {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Webhook Not Supported: origin not supported',
      }),
    }
  }

  const payload = JSON.parse(event.body)

  // Note:
  // We should add handle validation of the payload and verify sender here.
  // But since this is a proof of concept, we'll skip that for now.

  const duplicateResult = await checkDuplicate(payload, origin)

  // early exit on duplicates or Dynamo errors
  if (duplicateResult !== null) {
    return duplicateResult
  }

  return capture(payload, origin)
}

/**
 * Determines the origin of the webhook based on the URI path.
 * @param rawPath - The rawPath from the API Gateway event.
 * @returns The webhook origin or 'INVALID_ORIGIN' if the rawPath is not recognized.
 */
function determineOrigin(rawPath: string): WebhookOrigin | 'INVALID_ORIGIN' {
  switch (rawPath) {
    case '/webhooks/bigcommerce':
      return 'bigcommerce'
    case '/webhooks/stripe':
      return 'stripe'
    default:
      return 'INVALID_ORIGIN'
  }
}

/**
 * Checks if the webhook payload is a duplicate.
 * @param payload - The webhook payload.
 * @param origin - The origin of the webhook.
 * @returns null if the webhook is not a duplicate, otherwise an API Gateway response which signals an early exit.
 */
const checkDuplicate = async (
  payload: any,
  origin: WebhookOrigin
): Promise<APIGatewayProxyStructuredResultV2 | null> => {
  const getCommand = new GetCommand({
    TableName: Table.Webhooks.tableName,
    Key: extractCompositeKeys[origin](payload),
  })

  const [error, response] = await to(docClient.send(getCommand))

  if (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    }
  }

  if (response.Item) {
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'duplicate webhook received' }),
    }
  }

  // No matches / duplicate found
  return null
}

/**
 * Captures the webhook payload and saves it to DynamoDB.
 * @param payload - The webhook payload.
 * @param origin - The origin of the webhook.
 * @returns The API Gateway response.
 */
const capture = async (
  payload: any,
  origin: WebhookOrigin
): Promise<APIGatewayProxyStructuredResultV2> => {
  const putCommand = new PutCommand({
    TableName: Table.Webhooks.tableName,
    Item: mappers[origin](payload),
  })

  const [error, response] = await to(docClient.send(putCommand))

  if (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify(response),
  }
}

const extractCompositeKeys: ExtractCompositeKeys = {
  bigcommerce: payload => ({
    PK: payload.hash,
    created_at: new Date(payload.created_at * 1000).toISOString(),
  }),
  stripe: payload => ({
    PK: payload.id,
    created_at: new Date(payload.created_at * 1000).toISOString(),
  }),
} as const

const mappers: Mappers = {
  bigcommerce: bigcommerceWebhookMapper,
  stripe: stripeWebhookMapper,
} as const

/**
 * Maps the BigCommerce webhook payload to the DynamoDB schema.
 * @param payload - The BigCommerce webhook payload.
 * @returns The mapped payload.
 */
function bigcommerceWebhookMapper(payload: any) {
  return {
    ...extractCompositeKeys['bigcommerce'](payload),
    origin: 'bigcommerce',
    event_type: payload.scope,
    status: 'received',
    payload,
  }
}

/**
 * Maps the Stripe webhook payload to the DynamoDB schema.
 * @param payload - The Stripe webhook payload.
 * @returns The mapped payload.
 */
function stripeWebhookMapper(payload: any) {
  return {
    ...extractCompositeKeys['stripe'](payload),
    origin: 'stripe',
    event_type: payload.type,
    status: 'received',
    payload,
  }
}
