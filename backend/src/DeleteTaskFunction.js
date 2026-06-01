const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, DeleteCommand } = require("@aws-sdk/lib-dynamodb");

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

exports.handler = async (event) => {
    const origin = process.env.CORS_ORIGIN;
    const headers = {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "OPTIONS,GET,POST,PUT,DELETE",
        "Access-Control-Allow-Headers": "Content-Type,Authorization"
    };

    const claims = event.requestContext?.authorizer?.claims;
    const userId = claims?.sub || claims?.['cognito:username'];
    const taskId = event.pathParameters?.id;

    console.log(`[INFO] Processing DELETE /tasks/${taskId} request for userId: ${userId}`);

    if (!userId) {
        console.warn("[WARN] Unauthorized access attempt: Missing userId in Cognito claims.");
        return { statusCode: 401, headers, body: JSON.stringify({ error: "Unauthorized" }) };
    }

    if (!taskId) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing taskId" }) };
    }

    try {
        console.log(`[INFO] Executing DynamoDB DeleteItem on table: ${process.env.TABLE_NAME} for taskId: ${taskId}`);
        const command = new DeleteCommand({
            TableName: process.env.TABLE_NAME,
            Key: { taskId: taskId },
            ConditionExpression: "userId = :uid", // chi chu so huu moi duoc xoa
            ExpressionAttributeValues: { ":uid": userId }
        });

        const response = await docClient.send(command);

        // NE-5: bang chung StatusCode 200 cua loi goi DynamoDB
        console.log("[NE-5] DynamoDB DeleteItem StatusCode:", response.$metadata.httpStatusCode);
        console.log(`[SUCCESS] Task ${taskId} deleted for userId: ${userId}`);

        return { statusCode: 200, headers, body: JSON.stringify({ message: "Deleted successfully" }) };

    } catch (error) {
        console.error(`[ERROR] Failed to delete task ${taskId} in DynamoDB. Error details:`, error);
        if (error.name === "ConditionalCheckFailedException") {
            return { statusCode: 403, headers, body: JSON.stringify({ error: "Khong co quyen hoac task khong ton tai" }) };
        }
        return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
    }
};
