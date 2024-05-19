import { APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import { WebhookKey, WebhookOrigin } from '../types'
import { extractCompositeKeys, mappers } from './utils'
import { WebhookRepository } from '../repository'
import { logger } from '../../logger'

/**
 * Validates the status of a webhook payload.
 * @param payload - The webhook payload.
 * @param origin - The origin of the webhook.
 * @returns A Promise that resolves to null if a webhook can be processed, otherwise and APIGatewayProxyStructuredResultV2
 * object indicating a dynamo error, duplicate record or operator required status.
 */
export const validateDuplicate = async (
  key: WebhookKey
): Promise<APIGatewayProxyStructuredResultV2 | null> => {
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
      body: JSON.stringify({
        message:
          'Unable to process webhook: Duplicate Received, either the webhook is already being processed or has been completed.',
      }),
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
