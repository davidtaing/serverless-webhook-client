import { Webhook, WebhookKey, WebhookOrigin } from '../types'

export type WebhookAdapterFunction = (payload: any) => Webhook

/**
 * Collection of mapper functions to transform webhooks from multiple providers
 * to our DynamoDB schema
 */
export type Mappers = {
  [key in WebhookOrigin]: WebhookAdapterFunction
}
