import { Webhook, WebhookKey, WebhookOrigin } from '../types'

/**
 * Collection of functions that extract the id (PK) and created at (SK) from the
 * webhook payload.
 */
export type ExtractCompositeKeys = {
  [key in WebhookOrigin]: (payload: any) => WebhookKey
}

export type WebhookAdapterFunction = (payload: any) => Webhook

/**
 * Collection of mapper functions to transform webhooks from multiple providers
 * to our DynamoDB schema
 */
export type Mappers = {
  [key in WebhookOrigin]: WebhookAdapterFunction
}
