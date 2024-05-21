import crypto from 'crypto'
import { APIGatewayProxyHandlerV2 } from 'aws-lambda'

import {
  capture,
  extractCompositeKeys,
  validateDuplicate,
} from '@serverless-webhook-client/core/webhooks/capture'

const secret = 'xPpcHHoAOM'
const WEBHOOK_ORIGIN =
  process.env.WEBHOOK_ORIGIN === 'bigcommerce' ||
  process.env.WEBHOOK_ORIGIN === 'stripe'
    ? process.env.WEBHOOK_ORIGIN
    : null

const DISABLE_WEBHOOK_SIGNATURE_VALIDATION =
  process.env.DISABLE_WEBHOOK_SIGNATURE_VALIDATION === 'true'

/**
 * Lambda function entry point. Performs validation on the webhook before capturing
 * it in DynamoDB.
 *
 * Processing will be handled by other Lambda functions via DynamoDB Streams.
 * @param event - The API Gateway event.
 * @returns The API Gateway response.
 */
export const handler: APIGatewayProxyHandlerV2 = async (event, context) => {
  if (!WEBHOOK_ORIGIN) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Webhook Not Supported: origin not supported',
      }),
    }
  }

  if (!event.body) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: true }),
    }
  }

  if (!DISABLE_WEBHOOK_SIGNATURE_VALIDATION) {
    const validationError = validateSignature(
      event.body,
      event.headers['signature']
    )

    if (validationError) return validationError
  }

  const payload = JSON.parse(event.body)

  // Note:
  // We should add handle validation of the payload and verify sender here.
  // But since this is a proof of concept, we'll skip that for now.
  const key = extractCompositeKeys[WEBHOOK_ORIGIN](payload)
  const invalidStatus = await validateDuplicate(key)

  // early exit on duplicates or Dynamo errors
  if (invalidStatus !== null) {
    return invalidStatus
  }

  return capture(payload, WEBHOOK_ORIGIN)
}

function validateSignature(rawBody?: string, signature?: string) {
  if (!rawBody || !signature) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid Webhook Signature' }),
    }
  }

  const comparisonSignature = createSignatureToken(rawBody, secret)

  if (signature !== comparisonSignature) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid Webhook Signature' }),
    }
  }
}

function createSignatureToken(payload: string, secret: string) {
  const result = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('base64url')
    .toString()

  return result
}
