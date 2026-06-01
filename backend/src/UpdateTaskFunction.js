const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  UpdateCommand,
} = require("@aws-sdk/lib-dynamodb");

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
  const taskId = event.pathParameters?.id;

  console.log(
    `[INFO] Processing PUT /tasks/${taskId} request for userId: ${userId}`,
  );

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

  if (!taskId) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "Missing taskId" }),
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");

    // Cap nhat dong: chi cac truong duoc phep sua
    const allowedFields = [
      "title",
      "description",
      "priority",
      "dueDate",
      "status",
    ];
    const updates = [];
    const names = {};
    const values = { ":uid": userId };

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates.push(`#${field} = :${field}`);
        names[`#${field}`] = field;
        values[`:${field}`] = body[field];
      }
    }

    if (updates.length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "No fields to update" }),
      };
    }

    console.log(
      `[INFO] Executing DynamoDB UpdateItem on table: ${process.env.TABLE_NAME} for taskId: ${taskId}`,
    );
    const command = new UpdateCommand({
      TableName: process.env.TABLE_NAME,
      Key: { taskId: taskId },
      UpdateExpression: "set " + updates.join(", "),
      ConditionExpression: "userId = :uid", // chi chu so huu moi duoc sua
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: "ALL_NEW",
    });

    const response = await docClient.send(command);

    // NE-5: bang chung StatusCode 200 cua loi goi DynamoDB
    console.log(
      "[NE-5] DynamoDB UpdateItem StatusCode:",
      response.$metadata.httpStatusCode,
    );
    console.log(`[SUCCESS] Task ${taskId} updated for userId: ${userId}`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response.Attributes),
    };
  } catch (error) {
    console.error(
      `[ERROR] Failed to update task ${taskId} in DynamoDB. Error details:`,
      error,
    );
    if (error.name === "ConditionalCheckFailedException") {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({
          error: "Khong co quyen hoac task khong ton tai",
        }),
      };
    }
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
