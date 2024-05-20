/**
 * This file contains the implementation of various tasks involved in processing webhooks.
 * It includes functions for mapping stream records, validating webhook status, setting webhook status to processing,
 * processing the webhook, setting the final status of the webhook, sending failures to SQS, logging results,
 * and building the Lambda response.
 *
 * @module tasks
 */
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
import { to } from '../../utils'

export type ProcessPipelineInput = {
  key: WebhookKey
  item: Webhook
  /**
   * This will be used to flag partial batch failures in the lambda response.
   * For DynamoDB streams, this will be the eventID.
   * And for SQS messages, this will be the messageID.
   **/
  batchItemIdentifier: string
  status: WebhookProcessingStatus
  /** the raw DynamoDB stream event. */
  rawStreamRecord: string
}

export type ProcessPipelineFunction = (
  input: ProcessPipelineInput
) => Promise<ProcessPipelineInput>

export function mapStreamRecord(
  streamRecord: DynamoDBRecord['dynamodb'],
  batchItemIdentifier: string
): Promise<ProcessPipelineInput> {
  const rawItem = streamRecord?.NewImage as Record<string, AttributeValue>
  const rawKeys = streamRecord?.Keys as Record<string, AttributeValue>

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
    batchItemIdentifier,
    status: WebhookProcessingStatus.CONTINUE,
    rawStreamRecord: JSON.stringify(streamRecord),
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

  logger.info({ key: args.key }, 'Validated Webhook Status')

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

  const { error, response } = await WebhookRepository.setStatusToProcessing(
    args.key.PK
  )

  if (error) {
    logger.error({ key: args.key }, 'Failed to set Webhook Status')

    return {
      ...args,
      status: WebhookProcessingStatus.FAILED,
    }
  }

  logger.info({ key: args.key }, 'Set Webhook Status to Processing')

  return args
}

export const processWebhook: ProcessPipelineFunction = async (
  args: ProcessPipelineInput
) => {
  if (args.status !== WebhookProcessingStatus.CONTINUE) return args

  const { error } = await to(doSomeWork(args.item))
  if (error) {
    logger.error({ key: args.key }, 'Failed to process Webhook')
    return {
      ...args,
      status: WebhookProcessingStatus.FAILED,
    }
  }

  logger.info('Successfully Processed Webhook')

  return args
}

export const setFinalStatus: ProcessPipelineFunction = async args => {
  const shouldEarlyExit =
    args.status === WebhookProcessingStatus.DUPLICATE ||
    args.status === WebhookProcessingStatus.OPERATOR_REQUIRED

  if (shouldEarlyExit) {
    return args
  }

  let status: WebhookStatusValue =
    args.status === WebhookProcessingStatus.CONTINUE
      ? WebhookStatusValues.COMPLETED
      : WebhookStatusValues.FAILED

  const { error, response } = await WebhookRepository.setStatus(
    args.key.PK,
    status
  )

  if (error) {
    return {
      ...args,
      status: WebhookProcessingStatus.FAILED,
      result: error,
    }
  }

  logger.info(
    { key: args.key, status },
    `Set Final Webhook Status to ${status}`
  )

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

  if (error) {
    logger.error({ key: args.key, error }, 'Failed to send SQS message')
    return { ...args, status: WebhookProcessingStatus.FAILED }
  }

  logger.info({ key: args.key, sendResult }, 'Published webhook failure to SQS')

  return args
}

export const logResults: ProcessPipelineFunction = async args => {
  const logPayload = { key: args.key, status: args.status }
  if (args.status === WebhookProcessingStatus.FAILED) {
    logger.error(logPayload, 'Webhook Processing Failed')
  } else {
    logger.info(logPayload, 'Webhook Processing Result')
  }

  return args
}

export const buildLambdaResponse = (
  args: ProcessPipelineInput
): DynamoDBBatchItemFailure | SQSBatchItemFailure | null => {
  if (args.status === WebhookProcessingStatus.FAILED) {
    return {
      itemIdentifier: args.batchItemIdentifier,
    }
  }

  return null
}
