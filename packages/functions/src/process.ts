import {
  AttributeValue,
  DynamoDBBatchResponse,
  DynamoDBRecord,
  DynamoDBStreamHandler,
} from 'aws-lambda'
import { WebhookStatus } from '@serverless-webhook-client/core/types'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
  DynamoDBDocumentClient,
  UpdateCommand,
  UpdateCommandInput,
} from '@aws-sdk/lib-dynamodb'
import to from 'await-to-js'
import { Table } from 'sst/node/table'
import { pino } from 'pino'

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
  const promises = event.Records.map(processWebhook)
  const results = (await (
    await Promise.allSettled(promises)
  ).filter(
    promiseResult => promiseResult.status === 'fulfilled'
  )) as PromiseFulfilledResult<WebhookProcessingResult>[]

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
    return {
      status: 'error',
      eventID,
      keys,
      error: new Error(
        'Invalid record: dynamodb field or dynamodb child fields are missing.'
      ),
    }
  }

  const isDuplicate = newImage.status.S === WebhookStatus.PROCESSING
  if (isDuplicate) {
    return {
      status: 'duplicate',
      eventID,
      keys,
    }
  }

  const setProcessingResult = await updateWebhookStatus(
    keys,
    eventID,
    WebhookStatus.PROCESSING
  )

  if (setProcessingResult) {
    return setProcessingResult
  }

  const [error] = await to(doWork())
  if (error) {
    const setFailedResult = await updateWebhookStatus(
      keys,
      eventID,
      WebhookStatus.FAILED
    )

    if (setFailedResult) {
      return setFailedResult
    }

    return {
      status: 'error',
      eventID,
      keys,
      error,
    }
  }

  const setCompletedResult = await updateWebhookStatus(
    keys,
    eventID,
    WebhookStatus.COMPLETED
  )

  if (setCompletedResult) {
    return setCompletedResult
  }

  return {
    status: 'success',
    eventID,
    keys,
  }
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
    return { status: 'error', eventID, keys, error }
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
