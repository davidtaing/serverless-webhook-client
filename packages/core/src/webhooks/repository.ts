import {
  BatchGetCommand,
  BatchGetCommandInput,
  GetCommand,
  GetCommandInput,
  PutCommand,
  PutCommandInput,
  UpdateCommand,
  UpdateCommandInput,
} from '@aws-sdk/lib-dynamodb'
import to from 'await-to-js'

import { docClient } from '../database'
import { WebhookKey, WebhookStatus } from './types'
import { Table } from 'sst/node/table'
import { logger } from '../logger'

export class WebhookRepository {
  static name = Table.Webhooks.tableName

  static async get(input: Omit<GetCommandInput, 'TableName'>) {
    const getCommand = new GetCommand({
      ...input,
      TableName: WebhookRepository.name,
    })
    const [error, response] = await to(docClient.send(getCommand))
    return { error, response }
  }

  static async getByKey(key: { PK: string; created_at: string }) {
    const input: GetCommandInput = {
      TableName: WebhookRepository.name,
      Key: key,
    }

    return WebhookRepository.get(input)
  }

  static async batchGetByKeys(keys: WebhookKey[]) {
    const input: BatchGetCommandInput = {
      RequestItems: {
        [WebhookRepository.name]: {
          Keys: keys,
          ConsistentRead: true,
        },
      },
    }

    const command = new BatchGetCommand(input)
    const [error, response] = await to(docClient.send(command))
    return { error, response }
  }

  static async put(input: Omit<PutCommandInput, 'TableName'>) {
    const putCommand = new PutCommand({
      ...input,
      TableName: WebhookRepository.name,
    })
    const [error, response] = await to(docClient.send(putCommand))
    return { error, response }
  }

  static async update(input: Omit<UpdateCommandInput, 'TableName'>) {
    const updateCommand = new UpdateCommand({
      ...input,
      TableName: WebhookRepository.name,
    })
    const [error, response] = await to(docClient.send(updateCommand))

    return error
  }

  /**
   *
   * @param keys Composite key PK and created_at (SK)
   * @param status New status to update the webhook to
   * @returns error for failed updates, otherwise null
   * @remarks if the status is set to 'processing', the retries count will also be incremented
   */
  static async updateStatus(
    keys: { PK: string; created_at: string },
    status: WebhookStatus
  ) {
    if (status === WebhookStatus.PROCESSING) {
      return WebhookRepository.setProcessingStatus(keys)
    }

    const input: Omit<UpdateCommandInput, 'TableName'> = {
      Key: keys,
      UpdateExpression: 'SET #Status = :StatusValue',
      ExpressionAttributeNames: {
        '#Status': 'status',
      },
      ExpressionAttributeValues: {
        ':StatusValue': status,
      },
      ReturnValues: 'NONE',
    }

    return WebhookRepository.update(input)
  }

  static async setProcessingStatus(keys: { PK: string; created_at: string }) {
    const input: Omit<UpdateCommandInput, 'TableName'> = {
      Key: keys,
      UpdateExpression: 'SET #Status = :StatusValue, retries = retries',
      ExpressionAttributeNames: {
        '#Status': 'status',
      },
      ExpressionAttributeValues: {
        ':StatusValue': WebhookStatus.PROCESSING,
      },
      ReturnValues: 'NONE',
    }

    return WebhookRepository.update(input)
  }
}
