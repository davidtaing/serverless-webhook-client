import { APIGatewayProxyHandlerV2 } from 'aws-lambda'

import {
  capture,
  validateStatus,
  determineOrigin,
} from '@serverless-webhook-client/core/webhooks/capture'

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

  const invalidStatus = await validateStatus(payload, origin)

  // early exit on duplicates or Dynamo errors
  if (invalidStatus !== null) {
    return invalidStatus
  }

  return capture(payload, origin)
}
