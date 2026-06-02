// backend/scripts/setup-local.js
// Tao bang + GSI va seed 2 user tren DynamoDB Local
// Chay:  node scripts/setup-local.js   (tu thu muc backend/)
require("dotenv").config();

const {
  DynamoDBClient,
  CreateTableCommand,
  waitUntilTableExists,
} = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");

const TABLE_NAME = process.env.TABLE_NAME || "TasksTable";
const ENDPOINT = process.env.LOCAL_DYNAMODB_ENDPOINT || "http://localhost:8000";

const client = new DynamoDBClient({
  endpoint: ENDPOINT,
  region: "local",
  credentials: { accessKeyId: "local", secretAccessKey: "local" },
});
const docClient = DynamoDBDocumentClient.from(client);

const seedItems = [
  {
    taskId: "seed-1",
    userId: "test-user-123", // khop mock userId trong local.js -> GET tra du lieu ngay
    title: "Finish project report",
    description: "Demo seed task",
    priority: "high",
    dueDate: "2025-06-15",
    status: "pending",
    createdAt: "2025-01-01T00:00:00Z",
  },
  {
    taskId: "seed-2",
    userId: "second-user-456", // user thu 2 -> thoa yeu cau "it nhat 2 users"
    title: "Review architecture",
    description: "Owned by another user",
    priority: "medium",
    dueDate: "2025-07-01",
    status: "done",
    createdAt: "2025-01-02T00:00:00Z",
  },
];

async function createTable() {
  try {
    await client.send(
      new CreateTableCommand({
        TableName: TABLE_NAME,
        AttributeDefinitions: [
          { AttributeName: "taskId", AttributeType: "S" },
          { AttributeName: "userId", AttributeType: "S" },
        ],
        KeySchema: [{ AttributeName: "taskId", KeyType: "HASH" }],
        GlobalSecondaryIndexes: [
          {
            IndexName: "userId-index",
            KeySchema: [{ AttributeName: "userId", KeyType: "HASH" }],
            Projection: { ProjectionType: "ALL" },
          },
        ],
        BillingMode: "PAY_PER_REQUEST",
      }),
    );
    await waitUntilTableExists(
      { client, maxWaitTime: 30 },
      { TableName: TABLE_NAME },
    );
    console.log(`[OK] Da tao bang "${TABLE_NAME}" + GSI userId-index`);
  } catch (err) {
    if (err.name === "ResourceInUseException") {
      console.log(`[SKIP] Bang "${TABLE_NAME}" da ton tai — bo qua buoc tao`);
    } else {
      throw err;
    }
  }
}

async function seed() {
  for (const item of seedItems) {
    await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
    console.log(`[OK] Seed task ${item.taskId} (userId: ${item.userId})`);
  }
}

(async () => {
  try {
    console.log(`Endpoint: ${ENDPOINT}`);
    await createTable();
    await seed();
    console.log("[DONE] Setup local hoan tat.");
  } catch (err) {
    console.error("[ERROR] Setup that bai:", err.message);
    console.error("→ Kiem tra DynamoDB Local da chay o", ENDPOINT, "chua?");
    process.exit(1);
  }
})();
