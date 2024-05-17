import { SQSBatchItemFailure, SQSEvent, SQSHandler } from 'aws-lambda'

import {
  buildLambdaResponse,
  ProcessPipelineInput,
  processWebhook,
  setFinalStatus,
  setProcessing,
  validateStatus,
  WebhookProcessingStatus,
} from '@serverless-webhook-client/core/webhooks/process'
import { WebhookRepository } from '@serverless-webhook-client/core/webhooks/repository'
import { Webhook } from '@serverless-webhook-client/core/webhooks/types'

export const handler: SQSHandler = async event => {
  const records = await fetchRecords(event).then(records =>
    combineData(event, records)
  )

  const promises = records?.map(record =>
    validateStatus(record)
      .then(setProcessing)
      .then(processWebhook)
      .then(setFinalStatus)
  )

  const results = await Promise.all(promises)
  const errors = results.map(buildLambdaResponse).filter(Boolean) as
    | SQSBatchItemFailure[]

  return {
    batchItemFailures: errors,
  }
}

async function fetchRecords(event: SQSEvent): Promise<Webhook[]> {
  const recordKeys = event.Records.map(record => ({
    PK: record.messageAttributes.PK.stringValue!,
    created_at: record.messageAttributes.created_at.stringValue!,
  }))

  const { error, response } = await WebhookRepository.batchGetByKeys(
    recordKeys as { PK: string; created_at: string }[]
  )

  const records = response?.Responses?.[WebhookRepository.name] as
    | Webhook[]
    | undefined

  if (error) throw error
  if (!records) throw new Error('TODO')

  return records
}

/**
 * Combines Message IDs with the Webhook records
 * @param event SQSEvent
 * @param records Webhook[]
 * @returns ProcessPipelineInput[]
 */
function combineData(
  event: SQSEvent,
  records: Webhook[]
): ProcessPipelineInput[] {
  const messageData = event.Records.map(
    record =>
      [record.messageAttributes.PK.stringValue!, record.messageId] as const
  )
  const messageIDMap = new Map(messageData)

  return records.map(record => {
    const PK = record.PK
    const created_at = record.created_at
    const messageID = messageIDMap.get(PK)!

    return {
      key: { PK, created_at },
      item: record,
      itemIdentifier: messageID,
      status: WebhookProcessingStatus.CONTINUE,
    }
  })
}
