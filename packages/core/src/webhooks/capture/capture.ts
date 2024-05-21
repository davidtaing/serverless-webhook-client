import { APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import { WebhookOrigin } from '../types'
import { mappers } from './utils'
import { WebhookRepository } from '../repository'

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
  const input = mappers[origin](payload)

  const { error, response } = await WebhookRepository.capture(input)

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
