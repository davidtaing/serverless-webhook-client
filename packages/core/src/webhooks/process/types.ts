import { AttributeValue } from 'aws-lambda'

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
