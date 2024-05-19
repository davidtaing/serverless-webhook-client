import { logger } from '../../logger'
import { WebhookRepository } from '../repository'
import { WebhookKey, Webhook, WebhookStatusValue } from '../types'

/**
 * Simulates processing by adding an artificial delay along with random errors.
 */
export async function doSomeWork(
  key: WebhookKey,
  // this has been intentionally left in as we would be passing in the record in a real environment
  record: Webhook
): Promise<true | Error> {
  logger.info({ key }, 'Processing webhook')

  const ERROR_RATE = 0.5 // arbitrary error rate
  const BASE_DELAY_MS = 100
  const delay = BASE_DELAY_MS + Math.floor(Math.random() * 100)

  await new Promise(resolve => setTimeout(resolve, delay))

  logger.debug(`simulated processing with a ${delay}ms delay`)

  // randomly throw an error
  if (Math.random() < ERROR_RATE) {
    const error = new Error('failed to process webhook')
    throw error
  }

  return true
}

export async function updateWebhookStatus(
  key: WebhookKey,
  status: WebhookStatusValue
): Promise<Error | null> {
  return WebhookRepository.updateStatus(key, status)
}
