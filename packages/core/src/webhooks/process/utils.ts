import { AttributeValue } from 'aws-lambda'
import { WebhookProcessingErrorResult, WebhookProcessingResult } from '.'

export function createErrorResult(
  error: Error | string,
  eventID: string,
  keys?: { [key: string]: AttributeValue }
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
  keys: { [key: string]: AttributeValue }
): WebhookProcessingResult {
  return {
    status: 'duplicate',
    eventID,
    keys,
  }
}

export function createSuccessResult(
  eventID: string,
  keys: { [key: string]: AttributeValue }
): WebhookProcessingResult {
  return {
    status: 'success',
    eventID,
    keys,
  }
}
