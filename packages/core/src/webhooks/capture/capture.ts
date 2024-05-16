import { APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import { WebhookOrigin } from '../types'
import { extractCompositeKeys, mappers } from './utils'
import { WebhookRepository } from '../model'

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
  const key = extractCompositeKeys[origin](payload)

  const { error, response } = await WebhookRepository.getByKey(key)

  if (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    }
  }

  if (response?.Item) {
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
    Item: mappers[origin](payload),
  }

  const { error, response } = await WebhookRepository.put(input)

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
