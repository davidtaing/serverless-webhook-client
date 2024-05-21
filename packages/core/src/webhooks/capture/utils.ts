import { WebhookOrigin } from '../types'
import { Mappers, WebhookAdapterFunction } from './types'

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
 * Collection of functions that extract the id from the webhook payload,
 * for each webhook provider
 */
export const webhookKeyMappers: {
  [key in WebhookOrigin]: (payload: any) => string
} = {
  bigcommerce: payload => payload.hash,
  stripe: payload => payload.id,
} as const

/**
 * Maps the BigCommerce webhook payload to the DynamoDB schema.
 * @param payload - The BigCommerce webhook payload.
 * @returns The mapped payload.
 */
export const bigcommerceWebhookMapper: WebhookAdapterFunction = payload => {
  return {
    id: webhookKeyMappers['bigcommerce'](payload),
    origin: 'bigcommerce',
    type: payload.scope,
    created: new Date(payload.created_at * 1000).toISOString(),
    payload,
  }
}

/**
 * Maps the Stripe webhook payload to the DynamoDB schema.
 * @param payload - The Stripe webhook payload.
 * @returns The mapped payload.
 */
export const stripeWebhookMapper: WebhookAdapterFunction = (payload: any) => {
  return {
    id: webhookKeyMappers['stripe'](payload),
    origin: 'stripe',
    type: payload.type,
    created: new Date(payload.created_at * 1000).toISOString(),
    payload,
  }
}

/**
 * Collections of mappers that transform webhooks from multiple providers to our DynamoDB schema.
 */
export const mappers: Mappers = {
  bigcommerce: bigcommerceWebhookMapper,
  stripe: stripeWebhookMapper,
} as const
