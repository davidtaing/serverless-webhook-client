export type EntityKey = { PK: string; SK: string }
export type WebhookKey = EntityKey

export type Webhook = {
  id: string
  created: string
  origin: 'bigcommerce' | 'stripe'
  type: string
  payload: any
}

export type WebhookOrigin = Webhook['origin']

export type WebhookStatus = {
  id: string
  status:
    | 'received'
    | 'processing'
    | 'failed'
    | 'completed'
    | 'operator_required'
  retries: number
}

export type WebhookStatusValue = WebhookStatus['status']

export const WebhookStatusValues: {
  [key in Uppercase<WebhookStatusValue>]: Lowercase<key>
} = {
  RECEIVED: 'received',
  PROCESSING: 'processing',
  FAILED: 'failed',
  COMPLETED: 'completed',
  OPERATOR_REQUIRED: 'operator_required',
} as const
