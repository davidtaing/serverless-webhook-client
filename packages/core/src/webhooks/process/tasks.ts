import to from 'await-to-js'
import { logger } from '../../logger'
import { WebhookRepository } from '../repository'
import {
  WebhookKey,
  Webhook,
  WebhookStatusValues,
  WebhookStatusValue,
} from '../types'
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
import { doSomeWork } from './process'

export type ProcessPipelineInput = {
  key: WebhookKey
  item: Webhook
  itemIdentifier: string
  status: WebhookProcessingStatus
  rawStreamRecord: string
}

export type ProcessPipelineFunction = (
  input: ProcessPipelineInput
) => Promise<ProcessPipelineInput>

export function mapStreamRecord(
  record: DynamoDBRecord['dynamodb'],
  itemIdentifier: string
): Promise<ProcessPipelineInput> {
  const rawItem = record?.NewImage as Record<string, AttributeValue>
  const rawKeys = record?.Keys as Record<string, AttributeValue>

  const keys = unmarshall(rawKeys)
  const item = unmarshall(rawItem)

  const input: ProcessPipelineInput = {
    key: {
      PK: keys.PK,
      SK: keys.SK,
    },
    item: {
      id: item.id,
      created: item.created_at,
      origin: item.origin,
      type: item.event_type,
      payload: item.payload,
    },
    itemIdentifier,
    status: WebhookProcessingStatus.CONTINUE,
    rawStreamRecord: JSON.stringify(record),
  }

  logger.debug({ input }, 'Mapped DynamoDB Stream Record')

  return Promise.resolve(input)
}

export const validateStatus: ProcessPipelineFunction = async args => {
  if (args.status !== WebhookProcessingStatus.CONTINUE) return args

  const { error, response } = await WebhookRepository.getStatus(args.key.PK)

  if (error) {
    return {
      ...args,
      status: WebhookProcessingStatus.FAILED,
    }
  }

  const isDuplicate =
    response?.data?.status === WebhookStatusValues.PROCESSING ||
    response?.data?.status === WebhookStatusValues.COMPLETED

  const operatorRequired =
    response?.data?.status === WebhookStatusValues.OPERATOR_REQUIRED

  if (isDuplicate) {
    return {
      ...args,
      status: WebhookProcessingStatus.DUPLICATE,
    }
  }

  if (operatorRequired) {
    return {
      ...args,
      status: WebhookProcessingStatus.OPERATOR_REQUIRED,
    }
  }

  logger.info({ PK: args.key.PK }, 'Validated Webhook Status')

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

  const updateResult = await WebhookRepository.setStatusToProcessing(
    args.key.PK
  )

  if (updateResult) {
    logger.error({ PK: args.key.PK }, 'Failed to set Webhook Status')
    logger.debug({ updateResult }, 'Set Processing error')

    return {
      ...args,
      status: WebhookProcessingStatus.FAILED,
    }
  }

  logger.info({ PK: args.key.PK }, 'Set Webhook Status to Processing')

  return args
}

export const processWebhook: ProcessPipelineFunction = async (
  args: ProcessPipelineInput
) => {
  if (args.status !== WebhookProcessingStatus.CONTINUE) return args

  const [error] = await to(doSomeWork(args.key, args.item))
  if (error) {
    logger.error({ PK: args.key.PK }, 'Failed to process Webhook')
    return {
      ...args,
      status: WebhookProcessingStatus.FAILED,
    }
  }

  logger.info('Processed Webhook')

  return args
}

export const setFinalStatus: ProcessPipelineFunction = async args => {
  let webhookStatus: WebhookStatusValue = WebhookStatusValues.FAILED

  switch (args.status) {
    // Early Exits
    case WebhookProcessingStatus.OPERATOR_REQUIRED:
    case WebhookProcessingStatus.DUPLICATE:
      return args
    case WebhookProcessingStatus.CONTINUE:
      webhookStatus = WebhookStatusValues.COMPLETED
      break
    case WebhookProcessingStatus.FAILED:
    default:
      webhookStatus = WebhookStatusValues.FAILED
  }

  const updateStatusError = await WebhookRepository.setStatus(
    args.key.PK,
    webhookStatus
  )

  if (updateStatusError) {
    return {
      ...args,
      status: WebhookProcessingStatus.FAILED,
      result: updateStatusError,
    }
  }

  logger.info({ status: webhookStatus }, 'Set Final Webhook Status')

  return args
}

export const sendFailuresToSQS: ProcessPipelineFunction = async args => {
  if (args.status !== WebhookProcessingStatus.FAILED) return args

  const messageInput: Omit<SendMessageCommandInput, 'QueueUrl'> = {
    MessageBody: 'Webhook Failure',
    MessageAttributes: {
      PK: {
        DataType: 'String',
        StringValue: args.key.PK,
      },
      status: {
        DataType: 'String',
        StringValue: args.status,
      },
      raw_stream_record: {
        DataType: 'String',
        StringValue: args.rawStreamRecord,
      },
    },
  }

  const { error, sendResult } = await sendSQSMessage(messageInput)

  logger.debug({ error, sendResult }, 'SQS Send Result')

  if (error) {
    logger.error({ PK: args.key.PK, error }, 'Failed to send SQS message')
    return { ...args, status: WebhookProcessingStatus.FAILED }
  }

  logger.info(
    { PK: args.key.PK, sendResult },
    'Published webhook failure to SQS'
  )

  return args
}

export const logResults: ProcessPipelineFunction = async args => {
  const logPayload = { PK: args.key.PK, status: args.status }
  if (args.status === WebhookProcessingStatus.FAILED) {
    logger.error(logPayload, 'Webhook Processing Failed')
  } else {
    logger.error(logPayload, 'Webhook Processing Result')
  }

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
