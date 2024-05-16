import { WebhookOrigin } from '../types'
import { ExtractCompositeKeys, Mappers } from './types'

/**
 * Determines the origin of the webhook based on the URI path.
 * @param rawPath - The rawPath from the API Gateway event.
 * @returns The webhook origin or 'INVALID_ORIGIN' if the rawPath is not recognized.
 */
export function determineOrigin(
  rawPath: string
): WebhookOrigin | 'INVALID_ORIGIN' {
  switch (rawPath) {
    case '/webhooks/bigcommerce':
      return 'bigcommerce'
    case '/webhooks/stripe':
      return 'stripe'
    default:
      return 'INVALID_ORIGIN'
  }
}

/**
 * Collections of mappers that transform webhooks from multiple providers to our DynamoDB schema.
 */
export const mappers: Mappers = {
  bigcommerce: bigcommerceWebhookMapper,
  stripe: stripeWebhookMapper,
} as const

export const extractCompositeKeys: ExtractCompositeKeys = {
  bigcommerce: payload => ({
    PK: payload.hash,
    created_at: new Date(payload.created_at * 1000).toISOString(),
  }),
  stripe: payload => ({
    PK: payload.id,
    created_at: new Date(payload.created_at * 1000).toISOString(),
  }),
} as const

/**
 * Maps the BigCommerce webhook payload to the DynamoDB schema.
 * @param payload - The BigCommerce webhook payload.
 * @returns The mapped payload.
 */
export function bigcommerceWebhookMapper(payload: any) {
  return {
    ...extractCompositeKeys['bigcommerce'](payload),
    origin: 'bigcommerce',
    event_type: payload.scope,
    status: 'received',
    payload,
  }
}

/**
 * Maps the Stripe webhook payload to the DynamoDB schema.
 * @param payload - The Stripe webhook payload.
 * @returns The mapped payload.
 */
export function stripeWebhookMapper(payload: any) {
  return {
    ...extractCompositeKeys['stripe'](payload),
    origin: 'stripe',
    event_type: payload.type,
    status: 'received',
    payload,
  }
}
