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
import { doSomeWork, updateWebhookStatus } from './process'

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

  logger.debug({ input }, 'Mapped DynamoDB Stream Record')

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

  const operatorRequired =
    response?.Item?.status === WebhookStatus.OPERATOR_REQUIRED

  if (isDuplicate) {
    logger.info(
      { key: args.key },
      'Webhook cannot be processed: duplicate webhook'
    )
    return {
      ...args,
      status: WebhookProcessingStatus.DUPLICATE,
    }
  }

  if (operatorRequired) {
    logger.info(
      { key: args.key },
      'Webhook cannot be processed: operator required'
    )
    return {
      ...args,
      status: WebhookProcessingStatus.OPERATOR_REQUIRED,
    }
  }

  logger.debug({ args }, 'Validated Webhook Status')

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

  logger.debug({ args }, 'Set Processing 1')

  const updateResult = await updateWebhookStatus(
    args.key,
    WebhookStatus.PROCESSING
  )

  if (updateResult) {
    logger.error({ key: args.key }, 'Failed to set Webhook Status')
    logger.debug({ updateResult }, 'Set Processing error')

    return {
      ...args,
      status: WebhookProcessingStatus.FAILED,
    }
  }

  logger.debug('Set Webhook Status to Processing')

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

  logger.debug('Processed Webhook')

  return args
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

  logger.debug({ status: webhookStatus }, 'Set Final Webhook Status')

  return { ...args, status: WebhookProcessingStatus.COMPLETED }
}

export const sendFailuresToSQS: ProcessPipelineFunction = async args => {
  if (args.status !== WebhookProcessingStatus.COMPLETED) return args

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
    return { ...args, status: WebhookProcessingStatus.FAILED }
  }

  logger.info({ sendResult }, 'Published webhook failure to SQS')

  return args
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
