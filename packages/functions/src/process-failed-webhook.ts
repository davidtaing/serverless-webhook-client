import { logger } from '@serverless-webhook-client/core/logger'
import { SQSHandler, SQSRecord } from 'aws-lambda'

export const handler: SQSHandler = async event => {
  const records: SQSRecord[] = event.Records

  const record = records[0]

  logger.debug({ record }, 'SQS Record')

  const response = {
    batchItemFailures: [
      {
        itemIdentifier: record.messageId,
      },
    ],
  }

  logger.debug({ response }, 'process-failed-webhooks Response')

  return response
}
