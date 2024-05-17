import { DynamoDBBatchItemFailure, DynamoDBStreamHandler } from 'aws-lambda'

import {
  buildLambdaResponse,
  logResults,
  mapDynamoStreamRecord,
  processWebhook,
  sendFailuresToSQS,
  setFinalStatus,
  setProcessing,
  validateStatus,
} from '@serverless-webhook-client/core/webhooks/process'

export const handler: DynamoDBStreamHandler = async event => {
  const promises = event.Records.map(record =>
    mapDynamoStreamRecord(record)
      .then(validateStatus)
      .then(setProcessing)
      .then(processWebhook)
      .then(setFinalStatus)
      .then(sendFailuresToSQS)
      .then(logResults)
  )

  const results = await Promise.all(promises)
  const errors = results.map(buildLambdaResponse).filter(Boolean) as
    | DynamoDBBatchItemFailure[]

  return {
    batchItemFailures: errors,
  }
}
