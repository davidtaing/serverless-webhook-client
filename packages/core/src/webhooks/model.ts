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
