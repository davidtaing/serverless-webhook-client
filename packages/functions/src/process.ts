import { APIGatewayProxyHandlerV2 } from 'aws-lambda'

// Arbitrary error rate to simulate processing errors
const ERROR_RATE = 0.1

export const handler: APIGatewayProxyHandlerV2 = async event => {
  const offsetMilliseconds = Math.floor(Math.random() * 100)
  const delay = 200 + offsetMilliseconds

  console.log(`Simulating processing with a ${delay}ms delay`)
  await new Promise(resolve => setTimeout(resolve, delay))

  // Randomly return an error with a 10% error rate
  if (Math.random() < ERROR_RATE) {
    console.log('Simulated processing error')
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to process webhook' }),
    }
  }

  const id = 1234

  console.log(`Succesfully processed webhook ${id}`)

  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'hello world' }),
  }
}
