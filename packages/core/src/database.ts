import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { NodeHttpHandler } from '@smithy/node-http-handler'

/**
 * Dynamo has a default timeout of 30 seconds.
 * Overriding timeouts to 1 second to improve perf.
 *
 * See: 7 Common DynamoDB Patterns for Modeling and Building an App with Alex
 * De Brie @ getClient function to improve the performance
 * https://youtu.be/Q6-qWdsa8a4?si=WuSLyfR5rmeoF-vr&t=2762
 */
const requestHandler = new NodeHttpHandler({
  connectionTimeout: 1000,
  requestTimeout: 1000,
})

const dynamoClient = new DynamoDBClient({ requestHandler })
export const docClient = DynamoDBDocumentClient.from(dynamoClient)
