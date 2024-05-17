import { DynamoDBRecord } from 'aws-lambda'
import {
  WebhookProcessingErrorResult,
  WebhookProcessingInput,
  WebhookProcessingResult,
} from '.'
import { unmarshall } from '@aws-sdk/util-dynamodb'
import { AttributeValue } from '@aws-sdk/client-dynamodb'
import { GetCommandOutput } from '@aws-sdk/lib-dynamodb'

export function createErrorResult(
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

export function createDuplicateResult(
  eventID: string,
  keys: { [key: string]: AttributeValue }
): WebhookProcessingResult {
  return {
    status: 'duplicate',
    eventID,
    keys,
  }
}

export function createSuccessResult(
  eventID: string,
  keys: { [key: string]: AttributeValue }
): WebhookProcessingResult {
  return {
    status: 'success',
    eventID,
    keys,
  }
}

export function mapDynamoDBRecordToWebhookProcessingInput(
  record: DynamoDBRecord
) {
  if (
    !record.eventID ||
    !record?.dynamodb?.Keys ||
    !record?.dynamodb?.NewImage
  ) {
    throw new Error('TODO: handle invalid records')
  }

  const unmarshalledKeys = unmarshall(
    record.dynamodb.Keys as Record<string, AttributeValue>
  )
  const unmarshalledRecord = unmarshall(
    record.dynamodb.NewImage as Record<string, AttributeValue>
  )

  const formattedRecord: WebhookProcessingInput = {
    keys: { PK: unmarshalledKeys.PK, created_at: unmarshalledKeys.created_at },
    item: {
      PK: unmarshalledRecord.PK,
      created_at: unmarshalledRecord.created_at,
      status: unmarshalledRecord.status,
      origin: unmarshalledRecord.origin,
      event_type: unmarshalledRecord.event_type,
      retries: unmarshalledRecord.retries,
      payload: unmarshalledRecord.payload,
    },
    itemIdentifier: record.eventID,
  }

  return formattedRecord
}
