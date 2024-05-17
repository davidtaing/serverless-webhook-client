import to from 'await-to-js'
import { logger } from '../../logger'
import { WebhookRepository } from '../repository'
import { WebhookKey, Webhook, WebhookStatus } from '../types'
import { WebhookProcessingStatus } from './types'
import { SendMessageCommandInput } from '@aws-sdk/client-sqs'
import { sendSQSMessage } from '../../queue'
import {
  DynamoDBBatchItemFailure,
  DynamoDBRecord,
  SQSBatchItemFailure,
} from 'aws-lambda'
import { unmarshall } from '@aws-sdk/util-dynamodb'
import { AttributeValue } from '@aws-sdk/client-dynamodb'

export type ProcessPipelineInput = {
  key: WebhookKey
  item: Webhook
  itemIdentifier: string
  status: WebhookProcessingStatus
}

export type ProcessPipelineFunction = (
  input: ProcessPipelineInput
) => Promise<ProcessPipelineInput>

export function mapDynamoStreamRecord(
  record: DynamoDBRecord
): Promise<ProcessPipelineInput> {
  const rawItem = record.dynamodb?.NewImage as Record<string, AttributeValue>
  const rawKeys = record.dynamodb?.Keys as Record<string, AttributeValue>
  const eventID = record.eventID!

  const keys = unmarshall(rawKeys)
  const item = unmarshall(rawItem)

  const input: ProcessPipelineInput = {
    key: {
      PK: keys.PK,
      created_at: keys.created_at,
    },
    item: {
      PK: keys.PK,
      created_at: item.created_at,
      origin: item.origin,
      event_type: item.event_type,
      status: item.status as WebhookStatus,
      retries: 0,
      payload: item.payload,
    },
    itemIdentifier: eventID,
    status: WebhookProcessingStatus.CONTINUE,
  }

  return Promise.resolve(input)
}

export const validateStatus: ProcessPipelineFunction = async args => {
  if (args.status !== WebhookProcessingStatus.CONTINUE) return args

  const { error, response } = await WebhookRepository.getByKey(args.key)

  if (error) {
    return {
      ...args,
      status: WebhookProcessingStatus.FAILED,
    }
  }

  const isDuplicate =
    response?.Item?.status === WebhookStatus.PROCESSING ||
    response?.Item?.status === WebhookStatus.COMPLETED

  if (!isDuplicate) {
    return {
      ...args,
      status: WebhookProcessingStatus.DUPLICATE,
    }
  }

  const operatorRequired =
    response?.Item?.status === WebhookStatus.OPERATOR_REQUIRED

  if (operatorRequired) {
    return {
      ...args,
      status: WebhookProcessingStatus.OPERATOR_REQUIRED,
    }
  }

  return args
}

/**
 * Sets the webhook status to 'processing' and increments the retry count.
 * @param args
 * @returns
 */
export const setProcessing: ProcessPipelineFunction = async (
  args: ProcessPipelineInput
) => {
  if (args.status !== WebhookProcessingStatus.CONTINUE) return args

  const updateResult = await updateWebhookStatus(
    args.key,
    WebhookStatus.PROCESSING
  )

  if (updateResult) {
    return {
      ...args,
      status: WebhookProcessingStatus.FAILED,
    }
  }

  return args
}

export const processWebhook: ProcessPipelineFunction = async (
  args: ProcessPipelineInput
) => {
  if (args.status !== WebhookProcessingStatus.CONTINUE) return args

  const [error] = await to(doSomeWork(args.key, args.item))
  if (error) {
    return {
      ...args,
      status: WebhookProcessingStatus.FAILED,
    }
  }

  return args
}

/**
 * Simulates processing by adding an artificial delay along with random errors.
 */
async function doSomeWork(
  key: WebhookKey,
  record: Webhook
): Promise<true | Error> {
  logger.info({ key }, 'Processing webhook')

  // const ERROR_RATE = 0.2 // arbitrary error rate
  const ERROR_RATE = 1 // arbitrary error rate
  const BASE_DELAY_MS = 100
  const delay = BASE_DELAY_MS + Math.floor(Math.random() * 100)

  await new Promise(resolve => setTimeout(resolve, delay))

  logger.debug(`simulated processing with a ${delay}ms delay`)

  // randomly throw an error
  if (Math.random() < ERROR_RATE) {
    const error = new Error('failed to process webhook')
    logger.error({ error }, 'Simulated Error')
    throw error
  }

  return true
}

export const setFinalStatus: ProcessPipelineFunction = async args => {
  let webhookStatus: WebhookStatus = WebhookStatus.FAILED

  switch (args.status) {
    // Early Exits
    case WebhookProcessingStatus.OPERATOR_REQUIRED:
    case WebhookProcessingStatus.DUPLICATE:
      return args
    case WebhookProcessingStatus.CONTINUE:
      webhookStatus = WebhookStatus.COMPLETED
      break
    case WebhookProcessingStatus.FAILED:
    default:
      webhookStatus = WebhookStatus.FAILED
  }

  const updateStatusError = await updateWebhookStatus(args.key, webhookStatus)

  if (updateStatusError) {
    return {
      ...args,
      status: WebhookProcessingStatus.FAILED,
      result: updateStatusError,
    }
  }

  return args
}

export async function updateWebhookStatus(
  key: WebhookKey,
  status: WebhookStatus
): Promise<Error | null> {
  const error = await WebhookRepository.updateStatus(key, status)

  if (error) {
    return error
  }

  return null
}

export const sendFailuresToSQS: ProcessPipelineFunction = async args => {
  if (args.status !== WebhookProcessingStatus.CONTINUE) return args

  const messageInput: Omit<SendMessageCommandInput, 'QueueUrl'> = {
    MessageBody: 'Webhook Failure',
    MessageAttributes: {
      PK: {
        DataType: 'String',
        StringValue: args.key.PK,
      },
      created_at: {
        DataType: 'String',
        StringValue: args.key.created_at,
      },
      status: {
        DataType: 'String',
        StringValue: args.status,
      },
    },
  }

  const { error, sendResult } = await sendSQSMessage(messageInput)

  if (error) {
    logger.error({ error }, 'Failed to send SQS message')
  } else {
    logger.info({ sendResult }, 'Published webhook failure to SQS')
  }

  return { ...args, status: WebhookProcessingStatus.COMPLETED }
}

export const buildLambdaResponse = (
  args: ProcessPipelineInput
): DynamoDBBatchItemFailure | SQSBatchItemFailure | null => {
  if (args.status === WebhookProcessingStatus.FAILED) {
    return {
      itemIdentifier: args.itemIdentifier,
    }
  }

  return null
}
