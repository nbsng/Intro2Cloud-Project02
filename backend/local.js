require("dotenv").config();
console.log("ENV", process.env.LOCAL_DYNAMODB, process.env.TABLE_NAME);
const express = require("express");

const app = express();
app.use(express.json());

const getTasks = require("./src/getTasks/index").handler;
const createTask = require("./src/createTask/index").handler;
const updateTask = require("./src/updateTask/index").handler;
const deleteTask = require("./src/deleteTask/index").handler;

// Fake Cognito claims (replaces the API Gateway Cognito Authorizer locally)
const mockClaims = { sub: "test-user-123", "cognito:username": "tester" };

const buildEvent = (req) => ({
  body: JSON.stringify(req.body || {}),
  pathParameters: req.params,
  queryStringParameters: req.query,
  headers: req.headers,
  requestContext: { authorizer: { claims: mockClaims } },
});

const run = (fn) => async (req, res) => {
  try {
    const result = await fn(buildEvent(req));
    res.status(result.statusCode).set(result.headers).send(result.body);
  } catch (err) {
    console.error(err);
    res.status(500).send(JSON.stringify({ error: err.message }));
  }
};

app.get("/tasks", run(getTasks));
app.post("/tasks", run(createTask));
app.put("/tasks/:id", run(updateTask));
app.delete("/tasks/:id", run(deleteTask));

app.listen(3000, () =>
  console.log("Local API Running: http://localhost:3000/tasks"),
);
