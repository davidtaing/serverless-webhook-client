import { Webhook, WebhookStatusValue, WebhookStatusValues } from './types'
import { WebhookService } from './models'
import { to } from '../utils'

export class WebhookRepository {
  static async get(id: Webhook['id']) {
    return to(
      WebhookService.entities.webhooks
        .get({ id })
        /**
         * Given the immutability of this data, we can safely use eventually-consistent
         * reads which are priced at 1 / 2 RCUs per 4KB.
         *
         * This value defaults to false, but we're being explicit here to comment on the choice.
         */
        .go({ params: { ConsistentRead: false } })
    )
  }

  /**
   * Writes immutable data to a Webhook entity record, and mutable data to a
   * WebhookStatus entity record.
   * @param webhook
   * @remarks should consume 4 WCU
   */
  static async capture(webhook: Webhook) {
    return to(
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
  }

  static async getStatus(id: Webhook['id']) {
    return await to(
      WebhookService.entities.statuses
        .get({ id })
        /**
         * Consistent reads are required here to ensure that we're not processing
         * a webhook when we don't need to.
         *
         * This allows us to handle situations like handling duplicates, or when an
         * event has already been processed, or exceeded the maximum number of retries.
         *
         * This would be priced at 1 RCU per 4KB.
         */
        .go({ params: { ConsistentRead: true } })
    )
  }

  /**
   * Update webhook status
   * @remarks if status is 'processing', retries will be incremented
   */
  static async setStatus(id: Webhook['id'], status: WebhookStatusValue) {
    if (status === WebhookStatusValues.PROCESSING) {
      return WebhookRepository.setStatusToProcessing(id)
    }

    return to(
      WebhookService.entities.statuses.update({ id }).set({ status }).go()
    )
  }

  /**
   * Set status to processing and increment retries
   */
  static async setStatusToProcessing(id: Webhook['id']) {
    return to(
      WebhookService.entities.statuses
        .update({ id })
        .set({ status: 'processing' })
        .add({ retries: 1 })
        .go()
    )
  }
}
