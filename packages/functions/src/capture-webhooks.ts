import { APIGatewayProxyEventV2, Context } from 'aws-lambda'
import middy from '@middy/core'
import inputOutputLogger from '@middy/input-output-logger'

import {
  capture,
  webhookKeyMappers,
  validateDuplicate,
} from '@serverless-webhook-client/core/webhooks/capture'
import { verifySignatureMiddleware } from '@serverless-webhook-client/core/webhooks/capture/middlewares'
import { logger } from '@serverless-webhook-client/core/logger'

const WEBHOOK_ORIGIN =
  process.env.WEBHOOK_ORIGIN === 'bigcommerce' ||
  process.env.WEBHOOK_ORIGIN === 'stripe'
    ? process.env.WEBHOOK_ORIGIN
    : null

/**
 * Lambda function entry point. Performs validation on the webhook before capturing
 * it in DynamoDB.
 *
 * Processing will be handled by other Lambda functions via DynamoDB Streams.
 * @param event - The API Gateway event.
 * @returns The API Gateway response.
 */
export const lambdaHandler = async (
  event: APIGatewayProxyEventV2,
  context: Context
) => {
  const { body: payload } = context as Context & {
    rawBody: string
    signature: string
    body: any
  }

  if (!WEBHOOK_ORIGIN) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Webhook Not Supported: origin not supported',
      }),
    }
  }

  const key = webhookKeyMappers[WEBHOOK_ORIGIN](payload)
  const invalidStatus = await validateDuplicate(key)

  // early exit on duplicates or Dynamo errors
  if (invalidStatus !== null) {
    return invalidStatus
  }

  return capture(payload, WEBHOOK_ORIGIN)
}

export const handler = middy()
  .use(
    inputOutputLogger({
      logger: (message: any) => logger.info(message),
      awsContext: true,
      omitPaths: ['event.headers'],
    })
  )
  .use(verifySignatureMiddleware())
  .handler(lambdaHandler)
