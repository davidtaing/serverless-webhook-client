import to from 'await-to-js'
import { DynamoDBRecord } from 'aws-lambda'

import { logger } from '../../logger'
import { WebhookRepository } from '../model'
import { WebhookStatus } from '../types'
import {
  createErrorResult,
  createDuplicateResult,
  createSuccessResult,
} from './utils'
import { WebhookProcessingErrorResult, WebhookProcessingResult } from './types'

export async function processWebhook(
  record: DynamoDBRecord
): Promise<WebhookProcessingResult> {
  const keys = record.dynamodb?.Keys
  const eventID = record.eventID!
  const newImage = record.dynamodb?.NewImage

  const hasRequiredFields = !record.dynamodb || !keys || !newImage
  if (hasRequiredFields) {
    return createErrorResult(
      'Invalid record: dynamodb field or dynamodb child fields are missing.',
      eventID,
      keys
    )
  }

  const isDuplicate = newImage.status.S === WebhookStatus.PROCESSING
  if (isDuplicate) {
    return createDuplicateResult(eventID, keys)
  }

  const setProcessingError = await updateWebhookStatus(
    keys,
    eventID,
    WebhookStatus.PROCESSING
  )

  if (setProcessingError) {
    return setProcessingError
  }

  const [error] = await to(doWork())
  if (error) {
    return createErrorResult(error, eventID, keys)
  }

  return createSuccessResult(eventID, keys)
}

export async function finalizeStatus(
  processingResult: WebhookProcessingResult
): Promise<WebhookProcessingResult> {
  let webhookStatus: WebhookStatus = WebhookStatus.FAILED

  switch (processingResult.status) {
    case 'duplicate':
      return processingResult // early exit
    case 'success':
      WebhookStatus.COMPLETED
    case 'error':
    default:
      webhookStatus = WebhookStatus.FAILED
  }

  const updateStatusError = await updateWebhookStatus(
    processingResult.keys!,
    processingResult.eventID,
    webhookStatus
  )

  if (updateStatusError) {
    return updateStatusError
  }

  return processingResult
}

/**
 * Simulates processing by adding an artificial delay along with random errors.
 */
async function doWork(): Promise<true | Error> {
  const ERROR_RATE = 0.2 // arbitrary error rate
  const BASE_DELAY_MS = 100
  const delay = BASE_DELAY_MS + Math.floor(Math.random() * 100)

  await new Promise(resolve => setTimeout(resolve, delay))

  logger.debug(`simulated processing with a ${delay}ms delay`)

  // randomly throw an error
  if (Math.random() < ERROR_RATE) {
    const error = new Error('failed to process webhook')
    logger.error({ error }, 'Simulated Error')
    throw error
  }

  return true
}

export async function updateWebhookStatus(
  keys: any,
  eventID: string,
  status: WebhookStatus
): Promise<WebhookProcessingErrorResult | null> {
  const error = await WebhookRepository.updateStatus(
    {
      PK: keys.PK.S,
      created_at: keys.created_at.S,
    },
    status
  )

  if (error) {
    return createErrorResult(error, eventID, keys)
  }

  return null
}
