import { WebhookStatus } from '../types'

/**
 * Adds 'duplicate' and 'continue' statuses to the WebhookStatus type.
 * @remarks this is a separate type because we want to prevent these additional statuses from being written to the database
 * @field DUPLICATE - Signals that webhook may already be processing or already be completed
 * @field CONTINUE - Signals that the next stage can continue processing the event
 */
export type WebhookProcessingStatus = WebhookStatus | 'duplicate' | 'continue'

export const WebhookProcessingStatus: {
  [key in Uppercase<WebhookProcessingStatus>]: Lowercase<key>
} = {
  ...WebhookStatus,
  DUPLICATE: 'duplicate',
  CONTINUE: 'continue',
} as const
