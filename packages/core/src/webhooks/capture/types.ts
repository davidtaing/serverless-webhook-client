import { WebhookOrigin } from '../types'

/**
 * Collection of functions that extract the id (PK) and created at (SK) from the
 * webhook payload.
 */
export type ExtractCompositeKeys = {
  [key in WebhookOrigin]: (payload: any) => { PK: string; created_at: string }
}

/**
 * Collection of mapper functions to transform webhooks from multiple providers
 * to our DynamoDB schema
 */
export type Mappers = {
  [key in WebhookOrigin]: (payload: any) => any
}
