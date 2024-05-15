import { SSTConfig } from 'sst'
import { StorageStack } from './stacks/StorageStack'
import { ApiStack } from './stacks/ApiStack'

export default {
  config(_input) {
    return {
      name: 'serverless-webhook-client',
      region: 'us-east-1',
    }
  },
  stacks(app) {
    app.stack(StorageStack).stack(ApiStack)
  },
} satisfies SSTConfig
