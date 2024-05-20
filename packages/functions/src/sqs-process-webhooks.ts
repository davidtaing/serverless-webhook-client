import { SQSBatchItemFailure, SQSHandler, SQSRecord } from 'aws-lambda'

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
  const promises = event.Records?.map(record =>
    sqsAdapter(record)
      .then(record => mapStreamRecord(record.streamRecord, record.messageID))
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

function sqsAdapter(record: SQSRecord) {
  return Promise.resolve({
    messageID: record.messageId,
    streamRecord: JSON.parse(
      record.messageAttributes.raw_stream_record.stringValue!
    ),
  })
}
