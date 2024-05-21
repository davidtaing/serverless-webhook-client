import crypto from 'crypto'
import middy from '@middy/core'
import {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
  Context,
} from 'aws-lambda'
import { webhookKeyMappers } from './utils'
import { WebhookRepository } from '../repository'
import { WebhookOrigin } from '../types'

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

export const validateWebhookOrigin = (): APIGatewayProxyV2Middleware => {
  const before: APIGatewayProxyV2MiddlewareFn = async request => {
    const webhookOrigin =
      process.env.WEBHOOK_ORIGIN === 'bigcommerce' ||
      process.env.WEBHOOK_ORIGIN === 'stripe'
        ? process.env.WEBHOOK_ORIGIN
        : null

    if (!webhookOrigin) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'Webhook Not Supported: origin not supported',
        }),
      }
    }

    Object.assign(request.context, { webhookOrigin })

    return
  }

  return {
    before,
  }
}

export const validateWebhookSignature = (): APIGatewayProxyV2Middleware => {
  const before: APIGatewayProxyV2MiddlewareFn = async request => {
    if (!ENABLE_WEBHOOK_SIGNATURE_VALIDATION) {
      return
    }

    const rawBody = request.event.body
    if (!rawBody) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Invalid Webhook Signature' }),
      }
    }

    const comparisonSignature = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('base64url')
      .toString()

    const signature = request.event.headers['signature']

    if (signature !== comparisonSignature) {
      return {
        statusCode: 401,
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

export const rejectDuplicateWebhooks = (): APIGatewayProxyV2Middleware => {
  const before: APIGatewayProxyV2MiddlewareFn = async request => {
    const { webhookOrigin, body: payload } = request.context as Context & {
      webhookOrigin: WebhookOrigin
      body: any
    }

    const key = webhookKeyMappers[webhookOrigin](payload)

    const { error, response } = await WebhookRepository.get(key)

    if (error) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: error.message }),
      }
    }

    if (response?.data) {
      return {
        // return a 200 status code to prevent the webhook from being retried by the provider
        statusCode: 200,
        body: JSON.stringify({
          message:
            'Unable to process webhook: Duplicate Received, either the webhook is already being processed or has been completed.',
        }),
      }
    }

    return // no duplicates
  }

  return { before }
}
