import { StackContext, Table } from "sst/constructs";

export function StorageStack({ stack }: StackContext) {
  const table = new Table(stack, "Webhooks", {
    fields: {
      PK: "string",
      created: "string",
      origin: "string",
      event_type: "string",
      status: "string",
      payload: "string",
    },
    primaryIndex: { partitionKey: "PK", sortKey: "created" },
    globalIndexes: {
      OriginIndex: { partitionKey: "origin", sortKey: "created" },
    },
  });

  return {
    table,
  };
}
