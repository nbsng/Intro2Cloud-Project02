const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, QueryCommand } = require("@aws-sdk/lib-dynamodb");

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

    console.log(`[INFO] Processing GET /tasks request for userId: ${userId}`);

    if (!userId) {
        console.warn("[WARN] Unauthorized access attempt: Missing userId in Cognito claims.");
        return { statusCode: 401, headers, body: JSON.stringify({ error: "Unauthorized" }) };
    }

    try {
        let filterExpressions = [];
        let expressionAttributeValues = { ":uid": userId };
        let expressionAttributeNames = {};

        // Xu ly query parameters (loc theo priority / dueDate)
        if (event.queryStringParameters) {
            const { priority, dueDate } = event.queryStringParameters;
            if (priority && priority !== 'all') {
                filterExpressions.push("#priority = :priority");
                expressionAttributeNames["#priority"] = "priority";
                expressionAttributeValues[":priority"] = priority;
            }
            if (dueDate) {
                filterExpressions.push("#dueDate = :dueDate");
                expressionAttributeNames["#dueDate"] = "dueDate";
                expressionAttributeValues[":dueDate"] = dueDate;
            }
        }

        // Truy van vao GSI userId-index
        let queryParams = {
            TableName: process.env.TABLE_NAME,
            IndexName: "userId-index",
            KeyConditionExpression: "userId = :uid",
            ExpressionAttributeValues: expressionAttributeValues
        };

        if (filterExpressions.length > 0) {
            queryParams.FilterExpression = filterExpressions.join(" AND ");
            queryParams.ExpressionAttributeNames = expressionAttributeNames;
            console.log(`[INFO] Applying filters: ${queryParams.FilterExpression}`);
        }

        console.log(`[INFO] Executing DynamoDB Query on table: ${process.env.TABLE_NAME} using userId-index`);
        const command = new QueryCommand(queryParams);
        const response = await docClient.send(command);

        // NE-5: bang chung StatusCode 200 cua loi goi DynamoDB
        console.log("[NE-5] DynamoDB Query StatusCode:", response.$metadata.httpStatusCode);
        console.log(`[SUCCESS] DynamoDB Query successful. Retrieved ${response.Items.length} tasks for userId: ${userId}`);

        return { statusCode: 200, headers, body: JSON.stringify(response.Items) };

    } catch (error) {
        console.error(`[ERROR] Failed to query DynamoDB for userId: ${userId}. Error details:`, error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: "Internal server error" }) };
    }
};
