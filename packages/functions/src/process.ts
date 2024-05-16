import {
  AttributeValue,
  DynamoDBBatchResponse,
  DynamoDBRecord,
  DynamoDBStreamHandler,
} from 'aws-lambda'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
  DynamoDBDocumentClient,
  UpdateCommand,
  UpdateCommandInput,
} from '@aws-sdk/lib-dynamodb'
import { WebhookStatus } from '@serverless-webhook-client/core/types'
import to from 'await-to-js'
import { pino } from 'pino'
import { Table } from 'sst/node/table'

type WebhookProcessingResult =
  | {
      status: 'error'
      eventID: string
      keys?: {
        [key: string]: AttributeValue
      }
      error: Error
    }
  | {
      status: 'duplicate'
      eventID: string
      keys: {
        [key: string]: AttributeValue
      }
    }
  | {
      status: 'success'
      eventID: string
      keys: {
        [key: string]: AttributeValue
      }
    }

type WebhookProcessingErrorResult = Extract<
  WebhookProcessingResult,
  { status: 'error' }
>

const logger = pino({ level: 'debug' })
const dynamoClient = new DynamoDBClient()
const docClient = DynamoDBDocumentClient.from(dynamoClient)

export const handler: DynamoDBStreamHandler = async event => {
  const promises = event.Records.map(async record =>
    processWebhook(record).then(finalizeStatus)
  )

  const results = await Promise.allSettled(promises).then(
    promiseResults =>
      promiseResults.filter(
        promiseResult => promiseResult.status === 'fulfilled'
      ) as PromiseFulfilledResult<WebhookProcessingResult>[]
  )

  logger.info({ results })

  const response: DynamoDBBatchResponse = {
    batchItemFailures: results
      .filter(result => result.value.status === 'error')
      .map(item => ({
        itemIdentifier: item.value.eventID,
      })),
  }

  return response
}

async function processWebhook(
  record: DynamoDBRecord
): Promise<WebhookProcessingResult> {
  const keys = record.dynamodb?.Keys
  const eventID = record.eventID!
  const newImage = record.dynamodb?.NewImage

  const hasRequiredFields = !record.dynamodb || !keys || !newImage
  if (hasRequiredFields) {
    return createErrorResult(
      'Invalid record: dynamodb field or dynamodb child fields are missing.',
      eventID,
      keys
    )
  }

  const isDuplicate = newImage.status.S === WebhookStatus.PROCESSING
  if (isDuplicate) {
    return createDuplicateResult(eventID, keys)
  }

  const setProcessingError = await updateWebhookStatus(
    keys,
    eventID,
    WebhookStatus.PROCESSING
  )

  if (setProcessingError) {
    return setProcessingError
  }

  const [error] = await to(doWork())
  if (error) {
    return createErrorResult(error, eventID, keys)
  }

  return createSuccessResult(eventID, keys)
}

async function finalizeStatus(
  processingResult: WebhookProcessingResult
): Promise<WebhookProcessingResult> {
  let webhookStatus: WebhookStatus = WebhookStatus.FAILED

  switch (processingResult.status) {
    case 'duplicate':
      return processingResult // early exit
    case 'success':
      WebhookStatus.COMPLETED
    case 'error':
    default:
      webhookStatus = WebhookStatus.FAILED
  }

  const updateStatusError = await updateWebhookStatus(
    processingResult.keys!,
    processingResult.eventID,
    webhookStatus
  )

  if (updateStatusError) {
    return updateStatusError
  }

  return processingResult
}

async function updateWebhookStatus(
  keys: any,
  eventID: string,
  status: WebhookStatus
): Promise<WebhookProcessingErrorResult | null> {
  const input: UpdateCommandInput = {
    TableName: Table.Webhooks.tableName,
    Key: {
      PK: keys.PK.S,
      created_at: keys.created_at.S,
    },
    UpdateExpression: 'SET #Status = :StatusValue',
    ExpressionAttributeNames: {
      '#Status': 'status',
    },
    ExpressionAttributeValues: {
      ':StatusValue': status,
    },
    ReturnValues: 'NONE',
  }

  const updateCommand = new UpdateCommand(input)
  const [error] = await to(docClient.send(updateCommand))

  if (error) {
    return createErrorResult(error, eventID, keys)
  }

  return null
}

/**
 * Simulates processing by adding an artificial delay along with random errors.
 */
async function doWork(): Promise<true | Error> {
  const ERROR_RATE = 0.2 // arbitrary error rate
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

function createErrorResult(
  error: Error | string,
  eventID: string,
  keys?: { [key: string]: AttributeValue }
): WebhookProcessingErrorResult {
  return {
    status: 'error',
    eventID,
    keys,
    error: typeof error === 'string' ? new Error(error) : error,
  }
}

function createDuplicateResult(
  eventID: string,
  keys: { [key: string]: AttributeValue }
): WebhookProcessingResult {
  return {
    status: 'duplicate',
    eventID,
    keys,
  }
}

function createSuccessResult(
  eventID: string,
  keys: { [key: string]: AttributeValue }
): WebhookProcessingResult {
  return {
    status: 'success',
    eventID,
    keys,
  }
}
