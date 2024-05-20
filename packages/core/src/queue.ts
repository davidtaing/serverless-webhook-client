import {
  SendMessageCommand,
  SendMessageCommandInput,
  SendMessageCommandOutput,
  SQSClient,
} from '@aws-sdk/client-sqs'
import to from 'await-to-js'
import { Queue } from 'sst/node/queue'

export const sqs = new SQSClient()

export async function sendSQSMessage(
  options: Omit<SendMessageCommandInput, 'QueueUrl'>
): Promise<{ error: Error | null; sendResult?: SendMessageCommandOutput }> {
  const input: SendMessageCommandInput = {
    QueueUrl: Queue.FailedWebhooksQueue.queueUrl,
    MessageBody: options.MessageBody,
    MessageAttributes: options.MessageAttributes,
  }
  const command: SendMessageCommand = new SendMessageCommand(input)

  const [error, sendResult] = await to(sqs.send(command))

  return { error, sendResult }
}
