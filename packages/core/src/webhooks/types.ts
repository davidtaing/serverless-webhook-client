export type WebhookKey = Pick<Webhook, 'PK' | 'SK'>

export type Webhook = {
  PK: string
  SK: string
  created_at: string
  origin: 'bigcommerce' | 'stripe'
  event_type: string
  payload: any
}

export type WebhookOrigin = Webhook['origin']

export type WebhookStatus = {
  PK: string
  SK: string
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
