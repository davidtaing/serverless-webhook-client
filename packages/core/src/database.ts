import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'

const dynamoClient = new DynamoDBClient()
export const docClient = DynamoDBDocumentClient.from(dynamoClient)
