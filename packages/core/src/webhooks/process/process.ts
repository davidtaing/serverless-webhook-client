import to from 'await-to-js'
import { logger } from '../../logger'
import { WebhookRepository } from '../repository'
import { WebhookKey, Webhook, WebhookStatus } from '../types'
import { WebhookProcessingResult, WebhookProcessingErrorResult } from './types'
import {
  createDuplicateResult,
  createErrorResult,
  createOperatorRequiredResult,
  createSuccessResult,
} from './utils'
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
  result: WebhookProcessingResult | null
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
    result: null,
  }

  return Promise.resolve(input)
}

export const validateStatus: ProcessPipelineFunction = async args => {
  const { error, response } = await WebhookRepository.getByKey(args.key)

  if (error) {
    return {
      ...args,
      result: createErrorResult(error, args.itemIdentifier, args.key),
    }
  }

  const isDuplicate =
    response?.Item?.status === WebhookStatus.PROCESSING ||
    response?.Item?.status === WebhookStatus.COMPLETED

  if (!isDuplicate) {
    return {
      ...args,
      result: createDuplicateResult(args.itemIdentifier, args.key),
    }
  }

  const operatorRequired =
    response?.Item?.status === WebhookStatus.OPERATOR_REQUIRED

  if (operatorRequired) {
    return {
      ...args,
      result: createOperatorRequiredResult(args.itemIdentifier, args.key),
    }
  }

  return args
}

export const setProcessing: ProcessPipelineFunction = async (
  args: ProcessPipelineInput
) => {
  if (args.result) return args

  const updateResult = await updateWebhookStatus(
    args.key,
    args.itemIdentifier,
    WebhookStatus.PROCESSING
  )

  return {
    key: args.key,
    item: args.item,
    itemIdentifier: args.itemIdentifier,
    result: updateResult,
  }
}

export const processWebhook: ProcessPipelineFunction = async (
  args: ProcessPipelineInput
) => {
  if (args.result) return args

  const [error] = await to(doSomeWork(args.key, args.item))
  if (error) {
    return {
      ...args,
      result: createErrorResult(error, args.itemIdentifier, args.key),
    }
  }

  return {
    ...args,
    result: createSuccessResult(args.itemIdentifier, args.key),
  }
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
  const { result } = args

  switch (result?.status ?? 'error') {
    case 'duplicate':
      return args // early exit
    case 'success':
      WebhookStatus.COMPLETED
    case 'error':
    default:
      webhookStatus = WebhookStatus.FAILED
  }

  const updateStatusError = await updateWebhookStatus(
    args.key,
    args.itemIdentifier,
    webhookStatus
  )

  if (updateStatusError) {
    return { ...args, result: updateStatusError }
  }

  return args
}

export async function updateWebhookStatus(
  key: WebhookKey,
  eventID: string,
  status: WebhookStatus
): Promise<WebhookProcessingErrorResult | null> {
  const error = await WebhookRepository.updateStatus(key, status)

  if (error) {
    return createErrorResult(error, eventID, key)
  }

  return null
}

export const sendFailuresToSQS: ProcessPipelineFunction = async args => {
  const { result } = args
  if (!result || result?.status === 'success' || result?.status === 'duplicate')
    return args

  const messageInput: Omit<SendMessageCommandInput, 'QueueUrl'> = {
    MessageBody: 'Webhook Failure',
    MessageAttributes: {
      PK: {
        DataType: 'String',
        StringValue: result.keys?.PK,
      },
      created_at: {
        DataType: 'String',
        StringValue: result.keys?.created_at,
      },
      status: {
        DataType: 'String',
        StringValue: result.status,
      },
    },
  }

  const { error, sendResult } = await sendSQSMessage(messageInput)

  if (error) {
    logger.error({ error }, 'Failed to send SQS message')
  } else {
    logger.info({ sendResult }, 'Published webhook failure to SQS')
  }

  return args
}

export const buildLambdaResponse = (
  args: ProcessPipelineInput
): DynamoDBBatchItemFailure | SQSBatchItemFailure | null => {
  if (args.result?.status === 'error') {
    return {
      itemIdentifier: args.itemIdentifier,
    }
  }

  return null
}
