import { AttributeValue } from '@aws-sdk/client-dynamodb'
import { Webhook } from '../types'

export type WebhookProcessingResult =
  | {
      status: 'error'
      eventID: string
      keys?: {
        [key: string]: AttributeValue
      }
      error: Error
    }
  | {
      status: 'duplicate'
      eventID: string
      keys: {
        [key: string]: AttributeValue
      }
    }
  | {
      status: 'success'
      eventID: string
      keys: {
        [key: string]: AttributeValue
      }
    }

export type WebhookProcessingErrorResult = Extract<
  WebhookProcessingResult,
  { status: 'error' }
>

export type WebhookProcessingInput = {
  itemIdentifier: string // this will be the eventID for dynamodb streams and the messageID for SQS messages
  keys: {
    PK: string
    created_at: string
  }
  item: Webhook
}
