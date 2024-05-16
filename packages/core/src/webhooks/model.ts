import {
  PutCommand,
  PutCommandInput,
  UpdateCommand,
  UpdateCommandInput,
} from '@aws-sdk/lib-dynamodb'
import to from 'await-to-js'

import { docClient } from '../database'

export async function updateWebhook(input: UpdateCommandInput) {
  const updateCommand = new UpdateCommand(input)
  const [error] = await to(docClient.send(updateCommand))
  return error
}

export async function putWebhook(input: PutCommandInput) {
  const putCommand = new PutCommand(input)
  const [error, response] = await to(docClient.send(putCommand))
  return { error, response }
}
