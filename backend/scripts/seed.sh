#!/usr/bin/env bash
EP="--endpoint-url http://localhost:8000"

# User 1 (matches mockClaims.sub in local.js, so GET returns data immediately)
aws dynamodb put-item --table-name TasksTable $EP --item '{
  "taskId":{"S":"seed-1"}, "userId":{"S":"test-user-123"},
  "title":{"S":"Finish project report"}, "description":{"S":"Demo seed task"},
  "priority":{"S":"high"}, "dueDate":{"S":"2025-06-15"},
  "status":{"S":"pending"}, "createdAt":{"S":"2025-01-01T00:00:00Z"}
}'

# User 2 (second user, satisfies the "at least 2 users" requirement)
aws dynamodb put-item --table-name TasksTable $EP --item '{
  "taskId":{"S":"seed-2"}, "userId":{"S":"second-user-456"},
  "title":{"S":"Review architecture"}, "description":{"S":"Owned by another user"},
  "priority":{"S":"medium"}, "dueDate":{"S":"2025-07-01"},
  "status":{"S":"done"}, "createdAt":{"S":"2025-01-02T00:00:00Z"}
}'