import { AttributeValue } from 'aws-lambda'
import { WebhookKey } from '../types'

export type WebhookProcessingResult =
  | {
      status: 'error'
      eventID: string
      keys?: WebhookKey
      error: Error
    }
  | {
      status: 'duplicate'
      eventID: string
      keys: WebhookKey
    }
  | {
      status: 'success'
      eventID: string
      keys: WebhookKey
    }
  | {
      status: 'operator_required'
      eventID: string
      keys: WebhookKey
    }

export type WebhookProcessingErrorResult = Extract<
  WebhookProcessingResult,
  { status: 'error' }
>
