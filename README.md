# Intro2Cloud-Project02 — Serverless Task Manager

Ứng dụng web Quản lý Công việc theo kiến trúc serverless trên AWS
(CloudFront + S3 private, API Gateway, Lambda trong VPC, DynamoDB qua VPC Endpoint, Cognito).

---

## Cấu trúc thư mục

```
.
├── frontend/
│   ├── index.html
│   ├── css/styles.css
│   └── js/
│       ├── config.js        # cấu hình + cờ LOCAL_DEV
│       └── app.js
└── backend/
    ├── package.json
    ├── .env                 # cấu hình local (KHÔNG commit)
    ├── local.js             # server Express giả lập API Gateway khi chạy local
    ├── src/
    │   ├── getTasks/index.js
    │   ├── createTask/index.js
    │   ├── updateTask/index.js
    │   └── deleteTask/index.js
    └── scripts/
      └── setup-local.js
```

---

## A. Chạy Local

### Yêu cầu

- **Node.js 20.x** (khớp runtime Lambda khi deploy)
- **Docker** (chạy DynamoDB Local)

### A.1) Bật DynamoDB Local

```bash
docker run -d -p 8000:8000 amazon/dynamodb-local -jar DynamoDBLocal.jar -sharedDb
```

Cờ `-sharedDb` cho DynamoDB Local dùng chung một database duy nhất (không phân tách theo
region/credential) — tránh lỗi `ResourceNotFoundException` khó hiểu.

Nếu container không chạy, script ở bước A.3 sẽ thông báo lỗi kết nối.

### A.2) Cấu hình backend — `backend/.env`

```env
LOCAL_DYNAMODB=true
LOCAL_DYNAMODB_ENDPOINT=http://localhost:8000
TABLE_NAME=TasksTable
CORS_ORIGIN=http://localhost:5500
```

> Lambda handler đọc các biến này: khi `LOCAL_DYNAMODB=true` thì client DynamoDB trỏ về
> `LOCAL_DYNAMODB_ENDPOINT` (DynamoDB Local); khi không set (trên AWS) thì dùng IAM Role + VPC Endpoint.
> `CORS_ORIGIN` phải khớp **origin của frontend** (cổng 5500).

### A.3) Tạo bảng và seed dữ liệu

```bash
cd backend
npm install
node scripts/setup-local.js
```

Kiểm tra dữ liệu:

- Chạy backend và gọi GET `/tasks` (mục A.4/A.6).
- Kết quả phải trả về 2 task với 2 `userId` khác nhau (`test-user-123` va `second-user-456`).

### A.4) Chạy backend

```bash
cd backend
npm run local        # -> Local API: http://localhost:3000/tasks
```

### A.5) Cấu hình & chạy frontend

Trong `frontend/js/config.js`, bật chế độ local:

```js
window.APP_CONFIG = {
  LOCAL_DEV: true, // local: true | deploy: false
  API_BASE_URL: "http://localhost:3000/tasks",
  COGNITO_DOMAIN: "https://<your-cognito-domain>",
  COGNITO_CLIENT_ID: "<your-client-id>",
  REDIRECT_URI: "http://localhost:5500/",
};
```

Chạy frontend:

```bash
cd frontend
npx serve -l 5500
```

Mở trình duyệt: `http://localhost:5500`

### A.6) Kiểm thử nhanh bằng curl / Postman (tùy chọn, không cần frontend)

```bash
# GET
curl http://localhost:3000/tasks

# POST
curl -X POST http://localhost:3000/tasks \
  -H "Content-Type: application/json" \
  -d '{"title":"Task moi","dueDate":"2025-08-01","priority":"low"}'

# PUT
curl -X PUT http://localhost:3000/tasks/seed-1 \
  -H "Content-Type: application/json" -d '{"status":"done"}'

# DELETE
curl -X DELETE http://localhost:3000/tasks/seed-1
```

### Ghi chú khi chạy local

- **Chế độ local bỏ qua đăng nhập Cognito**: `local.js` tự gán mock userId `test-user-123`.
  Đây là cơ chế dành riêng cho phát triển; xác thực thật được kiểm chứng trên môi trường AWS.
- **Lỗi CORS** → kiểm tra `CORS_ORIGIN` trong `.env` có khớp cổng frontend (5500) không.
- **`ResourceNotFoundException`** → DynamoDB Local chưa có bảng (container vừa khởi động lại lam
  mat du lieu); chay lai `node scripts/setup-local.js`.
- **Thử quyền sở hữu**: cập nhật/xóa `seed-2` (thuộc `second-user-456`) sẽ trả về **403** —
  đúng với `ConditionExpression: userId = :uid`.

---

## B. Deploy lên AWS

> Lambda nằm **trong VPC** và gọi DynamoDB qua **VPC Gateway Endpoint**
> .Loại API là **REST API** (không dùng HTTP API). S3 phải **private**,
> chỉ phục vụ qua CloudFront + OAC. Trước khi deploy frontend, đặt `LOCAL_DEV: false` và **không**
> set `LOCAL_DYNAMODB` / `LOCAL_DYNAMODB_ENDPOINT` cho Lambda.

### B.1) Mạng — VPC

- Tạo **Custom VPC** CIDR `10.0.0.0/16`.
- 2 **Private Subnet** ở 2 AZ: `10.0.1.0/24` (ap-southeast-1a), `10.0.2.0/24` (ap-southeast-1b) — đảm bảo HA.
- **VPC Gateway Endpoint** cho `com.amazonaws.ap-southeast-1.dynamodb`, gắn vào Route Table của các private subnet.
- **Security Group** cho Lambda: outbound chỉ cho port 443 tới DynamoDB Prefix List.
- **KHÔNG tạo NAT Gateway.**

### B.2) Database — DynamoDB

- Tạo table **TasksTable**: partition key `taskId` (String).
- GSI **userId-index**: partition key `userId` (String), Projection **ALL**.
- Billing mode **PAY_PER_REQUEST**.
- **Seed ≥ 2 user** (≥ 2 `userId` khác nhau) để demo/kiểm thử.

### B.3) Compute — 4 Lambda Function (Node.js 20.x)

Triển khai **riêng biệt** 4 function từ `backend/src`:

| Function           | Handler         | Route                |
| ------------------ | --------------- | -------------------- |
| GetTasksFunction   | `index.handler` | GET `/tasks`         |
| CreateTaskFunction | `index.handler` | POST `/tasks`        |
| UpdateTaskFunction | `index.handler` | PUT `/tasks/{id}`    |
| DeleteTaskFunction | `index.handler` | DELETE `/tasks/{id}` |

- Mỗi function bật **VpcConfig**: gắn 2 private subnet + security group ở B.1.
- Biến môi trường mỗi function:
  ```env
  TABLE_NAME=TasksTable
  CORS_ORIGIN=https://<your-cloudfront-domain>
  ```

### B.4) Bảo mật — IAM (Least Privilege)

- **4 IAM Role riêng**, mỗi role chỉ cấp quyền tối thiểu:
  - DynamoDB: chỉ `GetItem/PutItem/UpdateItem/DeleteItem/Query` **trên đúng ARN của TasksTable** (không dùng `*`).
  - Logs: `CreateLogGroup/CreateLogStream/PutLogEvents`.
  - VPC: `ec2:CreateNetworkInterface/DescribeNetworkInterfaces/DeleteNetworkInterface`.

### B.5) Xác thực — Cognito

- Tạo **Cognito User Pool** + **App Client**.
- Tạo ≥ 2 user trong Pool để demo.
- App Client callback/redirect: thêm domain CloudFront (và `http://localhost:5500/` nếu cần test local có login).

### B.6) API — API Gateway (REST API)

- Loại **REST API** , deployment stage **prod**, HTTPS mặc định.
- Map 4 route ở B.3 tới 4 Lambda tương ứng.
- Gắn **Cognito Authorizer** cho tất cả route `/tasks` (request thiếu token hợp lệ → 401).
- **CORS**: `Access-Control-Allow-Origin` = **đúng domain CloudFront** (không dùng `*`).
- Throttling: Rate 100 req/s, Burst 50; cân nhắc Lambda Reserved Concurrency phù hợp Free Tier.

### B.7) Frontend — S3 Private + CloudFront + OAC

- Tạo S3 bucket **private** (bật cả 4 Block Public Access; **không** bật Static Website Hosting).
- Tạo CloudFront distribution với origin là bucket, dùng **OAC**; Bucket Policy chỉ cho phép
  CloudFront Service Principal đọc.
- Cập nhật `frontend/js/config.js`:
  ```js
  window.APP_CONFIG = {
    LOCAL_DEV: false,
    API_BASE_URL:
      "https://<api-id>.execute-api.ap-southeast-1.amazonaws.com/prod/tasks",
    COGNITO_DOMAIN: "https://<your-cognito-domain>",
    COGNITO_CLIENT_ID: "<your-client-id>",
    REDIRECT_URI: "https://<your-cloudfront-domain>/",
  };
  ```
- Upload frontend lên S3 rồi invalidate cache:
  ```bash
  aws s3 sync frontend/ s3://<your-bucket>/
  aws cloudfront create-invalidation --distribution-id <id> --paths "/*"
  ```

> Lấy `API_BASE_URL`, `COGNITO_*` **sau khi** tạo API Gateway và Cognito, rồi mới điền vào
> `config.js` và sync — thứ tự này quan trọng.

### B.8) Giám sát & Chi phí

- **CloudWatch Dashboard** ≥ 5 widget (Invocations, Duration, Errors, Throttles, API Latency, 4xx/5xx).
- **2 Alarm** + **SNS** gửi email: `Lambda Errors > 10/5m`, `API 5XXError > 5/5m`.
- **AWS Budget** $0.01/tháng, cảnh báo tại 80% và 100%.

---

## Chuyển đổi local ↔ AWS

|                              | Local                         | AWS                     |
| ---------------------------- | ----------------------------- | ----------------------- |
| `config.js` → `LOCAL_DEV`    | `true`                        | `false`                 |
| `config.js` → `API_BASE_URL` | `http://localhost:3000/tasks` | URL API Gateway prod    |
| `.env` → `LOCAL_DYNAMODB`    | `true`                        | (không set)             |
| Xác thực                     | bỏ qua (mock userId)          | Cognito Authorizer thật |
| Kết nối DynamoDB             | DynamoDB Local (cổng 8000)    | VPC Gateway Endpoint    |
