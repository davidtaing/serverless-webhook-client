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
      'POST /webhooks/bigcommerce': 'packages/functions/src/capture.handler',
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
