const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");
const crypto = require("crypto");

const client = new DynamoDBClient(
  process.env.LOCAL_DYNAMODB
    ? {
        endpoint: "http://localhost:8000",
        region: "local",
        credentials: { accessKeyId: "local", secretAccessKey: "local" },
      }
    : {}, // production: real IAM role + VPC Endpoint, unchanged
);
const docClient = DynamoDBDocumentClient.from(client);

exports.handler = async (event) => {
  const origin = process.env.CORS_ORIGIN;
  const headers = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "OPTIONS,GET,POST,PUT,DELETE",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
  };

  const claims = event.requestContext?.authorizer?.claims;
  const userId = claims?.sub || claims?.["cognito:username"];

  console.log(`[INFO] Processing POST /tasks request for userId: ${userId}`);

  if (!userId) {
    console.warn(
      "[WARN] Unauthorized access attempt: Missing userId in Cognito claims.",
    );
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ error: "Unauthorized" }),
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");

    // Validate truong bat buoc
    if (!body.title || !body.dueDate) {
      console.warn(
        "[WARN] Invalid input: missing required field 'title' or 'dueDate'.",
      );
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: "Missing required fields: title hoac dueDate",
        }),
      };
    }

    console.log(`[INFO] Creating new task with title: "${body.title}"`);

    const taskId = crypto.randomUUID();
    const timestamp = new Date().toISOString();

    const newTask = {
      taskId: taskId,
      userId: userId,
      title: body.title,
      description: body.description || "",
      priority: body.priority || "low",
      dueDate: body.dueDate,
      status: body.status || "pending",
      createdAt: timestamp,
    };

    console.log(
      `[INFO] Executing DynamoDB PutItem on table: ${process.env.TABLE_NAME} for taskId: ${taskId}`,
    );
    const command = new PutCommand({
      TableName: process.env.TABLE_NAME,
      Item: newTask,
    });

    const response = await docClient.send(command);

    // NE-5: bang chung StatusCode 200 cua loi goi DynamoDB
    console.log(
      "[NE-5] DynamoDB PutItem StatusCode:",
      response.$metadata.httpStatusCode,
    );
    console.log(`[SUCCESS] Task ${taskId} created for userId: ${userId}`);

    return { statusCode: 201, headers, body: JSON.stringify(newTask) };
  } catch (error) {
    console.error(
      `[ERROR] Failed to create task in DynamoDB. Error details:`,
      error,
    );
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
