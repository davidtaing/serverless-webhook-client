import { logger } from '../../logger'
import { Webhook } from '../types'

/**
 * Simulates processing by adding an artificial delay along with random errors.
 */
export async function doSomeWork(
  // this has been intentionally left in as we would be passing in the record in a real environment
  record: Webhook
): Promise<true | Error> {
  const ERROR_RATE = 0.6 // arbitrary error rate, set to a high number to demo the Dead Letter Queues
  const BASE_DELAY_MS = 100
  const delay = BASE_DELAY_MS + Math.floor(Math.random() * 100)

  await new Promise(resolve => setTimeout(resolve, delay))

  logger.debug(
    `Simulated processing of webhook event with a delay of ${delay}ms for proof of concept`
  )
  // randomly throw an error
  if (Math.random() < ERROR_RATE) {
    throw new Error('failed to process webhook')
  }

  return true
}
