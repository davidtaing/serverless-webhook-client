import crypto from 'crypto'
import middy from '@middy/core'
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda'
import { logger } from '../../logger'

const secret = 'xPpcHHoAOM'
const ENABLE_WEBHOOK_SIGNATURE_VALIDATION =
  process.env.ENABLE_WEBHOOK_SIGNATURE_VALIDATION === 'true'

export type APIGatewayProxyV2Middleware = middy.MiddlewareObj<
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2
>
export type APIGatewayProxyV2MiddlewareFn = middy.MiddlewareFn<
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2
>

export const verifySignatureMiddleware = (): APIGatewayProxyV2Middleware => {
  const before: APIGatewayProxyV2MiddlewareFn = async request => {
    if (!ENABLE_WEBHOOK_SIGNATURE_VALIDATION) {
      return
    }

    const rawBody = request.event.body
    const signature = request.event.headers['signature']

    if (!rawBody || !signature) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid Webhook Signature' }),
      }
    }

    const comparisonSignature = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('base64url')
      .toString()

    if (signature !== comparisonSignature) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid Webhook Signature' }),
      }
    }

    Object.assign(request.context, {
      rawBody,
      signature,
      body: JSON.parse(rawBody),
    })
  }

  return {
    before: before,
  }
}
