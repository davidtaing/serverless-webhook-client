import { APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import { WebhookOrigin, WebhookStatus } from '../types'
import { extractCompositeKeys, mappers } from './utils'
import { WebhookRepository } from '../repository'

/**
 * Validates the status of a webhook payload.
 * @param payload - The webhook payload.
 * @param origin - The origin of the webhook.
 * @returns A Promise that resolves to null if a webhook can be processed, otherwise and APIGatewayProxyStructuredResultV2
 * object indicating a dynamo error, duplicate record or operator required status.
 */
export const validateStatus = async (
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

  const isDuplicate =
    response?.Item?.status === WebhookStatus.PROCESSING ||
    response?.Item?.status === WebhookStatus.COMPLETED

  if (!isDuplicate) {
    return {
      statusCode: 200,
      body: JSON.stringify({
        message:
          'Unable to process webhook: Duplicate Received, either the webhook is already being processed or has been completed.',
      }),
    }
  }

  const operatorRequired =
    response?.Item?.status === WebhookStatus.OPERATOR_REQUIRED

  if (operatorRequired) {
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Unabled to process webhook: Operator Required',
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
