import { SQSBatchItemFailure, SQSHandler } from 'aws-lambda'

import {
  buildLambdaResponse,
  logResults,
  mapStreamRecord,
  processWebhook,
  setFinalStatus,
  setProcessing,
  validateStatus,
} from '@serverless-webhook-client/core/webhooks/process'

export const handler: SQSHandler = async event => {
  const records = event.Records.map(record => ({
    messageID: record.messageId,
    dynamodb: JSON.parse(
      record.messageAttributes.raw_stream_record.stringValue!
    ),
  }))

  const promises = records?.map(record =>
    mapStreamRecord(record.dynamodb, record.messageID)
      .then(validateStatus)
      .then(setProcessing)
      .then(processWebhook)
      .then(setFinalStatus)
      .then(logResults)
  )

  const results = await Promise.all(promises)
  const errors = results.map(buildLambdaResponse).filter(Boolean) as
    | SQSBatchItemFailure[]

  return {
    batchItemFailures: errors,
  }
}
