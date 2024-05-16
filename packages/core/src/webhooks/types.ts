export type WebhookOrigin = 'bigcommerce' | 'stripe'

export type WebhookStatus =
  | 'received'
  | 'processing'
  | 'failed'
  | 'completed'
  | 'operator_required'

export const WebhookStatus: {
  [key in Uppercase<WebhookStatus>]: Lowercase<key>
} = {
  RECEIVED: 'received',
  PROCESSING: 'processing',
  FAILED: 'failed',
  COMPLETED: 'completed',
  OPERATOR_REQUIRED: 'operator_required',
} as const

export type Webhook = {
  PK: string
  created_at: string
  origin: string
  event_type: string
  status: WebhookStatus
  retries: number
  payload: any
}
