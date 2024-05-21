import { Api, StackContext, use } from 'sst/constructs'
import { StorageStack } from './StorageStack'

export function ApiStack({ stack }: StackContext) {
  const { table } = use(StorageStack)

  // Create the API
  const api = new Api(stack, 'Api', {
    defaults: {
      function: {
        bind: [table],
      },
    },
    routes: {
      'POST /webhooks/bigcommerce': {
        function: {
          handler: 'packages/functions/src/capture-webhooks.handler',
          environment: {
            WEBHOOK_ORIGIN: 'bigcommerce',
            ENABLE_WEBHOOK_SIGNATURE_VALIDATION: 'true',
          },
        },
      },
    },
  })

  // Show the API endpoint in the output
  stack.addOutputs({
    ApiEndpoint: api.url,
  })

  // Return the API resource
  return {
    api,
  }
}
