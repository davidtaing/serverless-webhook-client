import {
  GetCommand,
  GetCommandInput,
  PutCommand,
  PutCommandInput,
  UpdateCommand,
  UpdateCommandInput,
} from '@aws-sdk/lib-dynamodb'
import to from 'await-to-js'

import { docClient } from '../database'
import { WebhookStatus } from './types'
import { Table } from 'sst/node/table'
import { GetItemCommandInput, GetItemCommand } from '@aws-sdk/client-dynamodb'

export class WebhookRepository {
  static name = Table.Webhooks.tableName

  /**
   * Get a webhook
   * @param input GetCommandInput without the TableName field
   * @returns error and the dynamo response
   * @remarks uses the GetCommand which accepts native JS instead of AttributeValues,
   * and returns a plain JS object
   */
  static async get(input: Omit<GetCommandInput, 'TableName'>) {
    const getCommand = new GetCommand({
      ...input,
      TableName: WebhookRepository.name,
    })
    const [error, response] = await to(docClient.send(getCommand))
    return { error, response }
  }

  static async getByKey(key: { PK: string; created_at: string }) {
    const input: Omit<GetCommandInput, 'TableName'> = {
      Key: key,
    }

    return WebhookRepository.get(input)
  }

  /**
   * Get Item from DynamoDB via the GetItemCommand
   * @param input
   * @returns
   */
  static async getItem(input: Omit<GetItemCommandInput, 'TableName'>) {
    const getItemCommand = new GetItemCommand({
      ...input,
      TableName: WebhookRepository.name,
    })
    const [error, response] = await to(docClient.send(getItemCommand))
    return { error, response }
  }

  static async getItemByKey(key: {
    PK: { S: string }
    created_at: { S: string }
  }) {
    const input: Omit<GetItemCommandInput, "TableName"> = {
      ConsistentRead: true,
      Key: key,
    }

    return WebhookRepository.getItem(input)
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
    const [error] = await to(docClient.send(updateCommand))
    return error
  }

  static async updateStatus(
    keys: { PK: string; created_at: string },
    status: WebhookStatus
  ) {
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
}
