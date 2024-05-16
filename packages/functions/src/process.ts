import { DynamoDBBatchResponse, DynamoDBStreamHandler } from 'aws-lambda'

import { logger } from '@serverless-webhook-client/core/logger'
import {
  processWebhook,
  finalizeStatus,
  WebhookProcessingResult,
  publishFailures,
} from '@serverless-webhook-client/core/webhooks/process'

export const handler: DynamoDBStreamHandler = async event => {
  const promises = event.Records.map(async record =>
    processWebhook(record).then(finalizeStatus).then(publishFailures)
  )

  const results = await Promise.allSettled(promises).then(
    promiseResults =>
      promiseResults.filter(
        promiseResult => promiseResult.status === 'fulfilled'
      ) as PromiseFulfilledResult<WebhookProcessingResult>[]
  )

  logger.info({ results })

  const response: DynamoDBBatchResponse = {
    batchItemFailures: results
      .filter(result => result.value.status === 'error')
      .map(item => ({
        itemIdentifier: item.value.eventID,
      })),
  }

  return response
}
