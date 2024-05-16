import { UpdateCommandInput } from '@aws-sdk/lib-dynamodb'
import { Table } from 'sst/node/table'
import { updateWebhook } from '../model'
import { WebhookStatus } from '../types'
import { WebhookProcessingErrorResult } from './types'
import { createErrorResult } from './utils'

export async function updateWebhookStatus(
  keys: any,
  eventID: string,
  status: WebhookStatus
): Promise<WebhookProcessingErrorResult | null> {
  const input: UpdateCommandInput = {
    TableName: Table.Webhooks.tableName,
    Key: {
      PK: keys.PK.S,
      created_at: keys.created_at.S,
    },
    UpdateExpression: 'SET #Status = :StatusValue',
    ExpressionAttributeNames: {
      '#Status': 'status',
    },
    ExpressionAttributeValues: {
      ':StatusValue': status,
    },
    ReturnValues: 'NONE',
  }

  const error = await updateWebhook(input)

  if (error) {
    return createErrorResult(error, eventID, keys)
  }

  return null
}
