#!/usr/bin/env bash
aws dynamodb create-table \
  --table-name TasksTable \
  --attribute-definitions \
      AttributeName=taskId,AttributeType=S \
      AttributeName=userId,AttributeType=S \
  --key-schema AttributeName=taskId,KeyType=HASH \
  --global-secondary-indexes '[{
      "IndexName": "userId-index",
      "KeySchema": [{ "AttributeName": "userId", "KeyType": "HASH" }],
      "Projection": { "ProjectionType": "ALL" }
  }]' \
  --billing-mode PAY_PER_REQUEST \
  --endpoint-url http://localhost:8000