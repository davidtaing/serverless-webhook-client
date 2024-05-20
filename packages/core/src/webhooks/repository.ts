import to from 'await-to-js'

import { Webhook, WebhookStatusValue, WebhookStatusValues } from './types'
import { WebhookService } from './models'

export class WebhookRepository {
  /**
   * Writes immutable data to a Webhook entity record, and mutable data to a
   * WebhookStatus entity record.
   * @param webhook
   * @remarks should consume 4 WCU
   */
  static async capture(webhook: Webhook) {
    const [error, response] = await to(
      WebhookService.transaction
        .write(({ webhooks, statuses }) => [
          webhooks.put(webhook).commit(),
          statuses
            .put({
              id: webhook.id,
              status: 'received',
              retries: 0,
            })
            .commit(),
        ])
        .go()
    )

    return { error, response }
  }

  static async getStatus(id: Webhook['id']) {
    const [error, response] = await to(
      WebhookService.entities.statuses.get({ id }).go()
    )

    return { error, response }
  }

  /**
   * Update webhook status
   * @remarks if status is 'processing', retries will be incremented
   */
  static async setStatus(id: Webhook['id'], status: WebhookStatusValue) {
    if (status === WebhookStatusValues.PROCESSING) {
      return WebhookRepository.setStatusToProcessing(id)
    }

    const [error, response] = await to(
      WebhookService.entities.statuses.update({ id }).set({ status }).go()
    )

    return { error, response }
  }

  /**
   * Set status to processing and increment retries
   */
  static async setStatusToProcessing(id: Webhook['id']) {
    const [error, response] = await to(
      WebhookService.entities.statuses
        .update({ id })
        .set({ status: 'processing' })
        .add({ retries: 1 })
        .go()
    )

    return { error, response }
  }
}
