import { AttributeValue } from 'aws-lambda'
import { WebhookProcessingErrorResult, WebhookProcessingResult } from '.'
import { WebhookKey } from '../types'

export function createErrorResult(
  error: Error | string,
  eventID: string,
  keys?: WebhookKey
): WebhookProcessingErrorResult {
  return {
    status: 'error',
    eventID,
    keys,
    error: typeof error === 'string' ? new Error(error) : error,
  }
}

export function createDuplicateResult(
  eventID: string,
  keys: WebhookKey
): WebhookProcessingResult {
  return {
    status: 'duplicate',
    eventID,
    keys,
  }
}

export function createSuccessResult(
  eventID: string,
  keys: WebhookKey
): WebhookProcessingResult {
  return {
    status: 'success',
    eventID,
    keys,
  }
}

export function createOperatorRequiredResult(
  eventID: string,
  keys: WebhookKey
): WebhookProcessingResult {
  return {
    status: 'operator_required',
    eventID,
    keys,
  }
}
