import { APIGatewayProxyEventV2, Context } from 'aws-lambda'
import middy from '@middy/core'
import inputOutputLogger from '@middy/input-output-logger'

import { capture } from '@serverless-webhook-client/core/webhooks/capture'
import {
  CustomCaptureContext,
  rejectDuplicateWebhooks,
  validateWebhookOrigin,
  validateWebhookSignature,
} from '@serverless-webhook-client/core/webhooks/capture/middlewares'
import { logger } from '@serverless-webhook-client/core/logger'
import { WebhookOrigin } from '@serverless-webhook-client/core/webhooks/types'

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
  const { body: payload, webhookOrigin } = context as CustomCaptureContext
  return capture(payload, webhookOrigin)
}

export const handler = middy()
  .use(
    inputOutputLogger({
      logger: (message: any) => logger.info(message),
      awsContext: true,
      omitPaths: ['event.headers'],
    })
  )
  .use(validateWebhookOrigin())
  .use(validateWebhookSignature())
  .use(rejectDuplicateWebhooks())
  .handler(lambdaHandler)
