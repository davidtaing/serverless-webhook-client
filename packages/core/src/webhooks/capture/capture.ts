import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import to from 'await-to-js'
import { APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import { Table } from 'sst/node/table'
import { docClient } from '../../database'
import { WebhookOrigin } from '../types'
import { extractCompositeKeys, mappers } from './utils'
import { putWebhook } from '../model'

/**
 * Checks if the webhook payload is a duplicate.
 * @param payload - The webhook payload.
 * @param origin - The origin of the webhook.
 * @returns null if the webhook is not a duplicate, otherwise an API Gateway response which signals an early exit.
 */
export const checkDuplicate = async (
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
export const capture = async (
  payload: any,
  origin: WebhookOrigin
): Promise<APIGatewayProxyStructuredResultV2> => {
  const input = {
    TableName: Table.Webhooks.tableName,
    Item: mappers[origin](payload),
  }

  const { error, response } = await putWebhook(input)

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
