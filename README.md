# HTTP Switcher — HTTP 请求中转服务

将应用接收到的 HTTP 回调/事件请求，透明地转发到内网宿主机的指定接口。

## 工作原理

```
应用                        公共机 (公网)                    内网宿主机
   │                              │                                │
   │  POST /any/path              │                                │
   │  X-Target-URL: http://...    │                                │
   ├─────────────────────────────>│                                │
   │                              │  解析目标 URL / Method / Headers │
   │                              ├────── GET/POST/DELETE ─────────>│
   │                              │<───────── 响应 ────────────────┤
   │<──── 原样返回响应 ───────────┤                                │
```

应用向公共机发 POST（或其他配置的 HTTP 方法），公共机解析出真正的目标 **URL**、**HTTP 方法**、**请求头**、**请求体**，然后主动向内网宿主机发起请求，并将响应原样返回给应用。

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量（复制并修改）
cp .env.example .env

# 3. 启动
npm start
```

服务默认监听 `http://0.0.0.0:8080`。

## 使用方式

### 方式一：通过自定义 Header（推荐）

```bash
curl -X POST http://公共机IP:8080/any/path \
  -H "X-Target-URL: http://宿主机IP:3000/api/users" \
  -H "X-Target-Method: GET"
```

| Header | 说明 | 必填 |
|--------|------|------|
| `X-Target-URL` | 完整目标 URL | 是 |
| `X-Target-Method` | 目标 HTTP 方法（默认沿用 POST） | 否 |
| `X-Target-Headers` | Base64 编码的 JSON，覆盖请求头 | 否 |

### 方式二：通过 JSON Body

```bash
curl -X POST http://公共机IP:8080/any/path \
  -H "Content-Type: application/json" \
  -d '{
    "target_url": "http://宿主机IP:3000/api/users",
    "target_method": "PUT",
    "target_headers": { "Authorization": "Bearer xxx" },
    "target_body": { "name": "test" }
  }'
```

### 方式三：Body 嵌套路径（兼容各种消息格式）

事件推送的结构可能不固定。系统会**按配置的路径链依次尝试**，直到找到第一个有效值：

```json
{
  "data": {
    "target_url": "http://宿主机IP:3000/api/data"
  }
}
```

默认路径链：

| 字段 | 回退顺序 |
|------|----------|
| `target_url` | `target_url` → `data.target_url` → `content.url` → `action.value.target_url` |
| `target_method` | `target_method` → `data.target_method` → `content.method` |

## 安全

### API Key 认证

在 `.env` 中设置 `API_KEY` 后，请求必须携带 Header：

```
X-API-Key: your-secret-key
```

认证失败返回 `401`。

### IP 白名单

限制只接受特定来源 IP 的请求：

```env
ENABLE_IP_WHITELIST=true
ALLOWED_IPS=192.168.1.100,10.0.0.50
```

### 目标 URL 网段白名单

限制只转发到内网指定网段，防止被用作 SSRF 攻击：

```env
ENABLE_URL_WHITELIST=true
ALLOWED_CIDR_BLOCKS=192.168.0.0/16,10.0.0.0/8
```

## 配置项

所有配置通过环境变量（`.env` 文件）注入：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `8080` | 服务监听端口 |
| `ALLOWED_METHODS` | `POST` | 允许的入站 HTTP 方法（逗号分隔） |
| `API_KEY` | 空 | API 安全认证密钥（空=不启用） |
| `REQUEST_TIMEOUT` | `30000` | 转发超时（毫秒） |
| `TARGET_URL_HEADER` | `X-Target-URL` | Header 中目标 URL 字段名 |
| `TARGET_METHOD_HEADER` | `X-Target-Method` | Header 中目标方法字段名 |
| `TARGET_HEADERS_HEADER` | `X-Target-Headers` | Header 中自定义请求头字段名（Base64 JSON） |
| `BODY_TARGET_URL_PATHS` | `target_url,data.target_url,...` | Body 中目标 URL 路径链（逗号分隔） |
| `BODY_TARGET_METHOD_PATHS` | `target_method,data.target_method,...` | Body 中目标方法路径链 |
| `BODY_TARGET_HEADERS_PATHS` | `target_headers,data.target_headers` | Body 中自定义请求头路径链 |
| `BODY_TARGET_BODY_PATHS` | `target_body,data.target_body` | Body 中自定义请求体路径链 |
| `LOG_LEVEL` | `info` | 日志级别 |
| `BODY_SIZE_LIMIT` | `10mb` | 请求体大小限制 |

完整配置说明见 [.env.example](.env.example)。

## 部署

### PM2

```bash
npm run pm2:start    # 启动
npm run pm2:stop     # 停止
npm run pm2:logs     # 查看日志
```

### Docker

```bash
npm run docker:build
npm run docker:run
```

或手动：

```bash
docker build -t http-switcher .
docker run -d \
  -p 8080:8080 \
  --env-file .env \
  http-switcher
```

## 日志

结构化日志，每条请求记录：

```json
{
  "requestId": "uuid",
  "method": "POST",
  "url": "/any",
  "targetUrl": "http://宿主机IP:3000/api/data",
  "targetMethod": "GET",
  "status": 200,
  "duration": 15
}
```

开发环境带彩色格式化输出，生产环境为标准 JSON 格式，可对接日志收集系统。

## 开发

```bash
# 执行测试
node src/test.js

# 开发模式（文件变更自动重启）
npm run dev
```

测试覆盖：路径解析（含数组索引、多路径回退）、API Key 认证中间件、端到端转发流程。

## 项目结构

```
├── src/
│   ├── app.js                  # 主入口，路由 & 错误处理
│   ├── config.js               # 集中配置（从环境变量读取）
│   ├── test.js                 # 单元 + 端到端测试
│   ├── middleware/
│   │   ├── parser.js           # 目标 URL/Method/Headers/Body 解析
│   │   └── security.js         # API Key 认证 + IP 白名单 + CIDR 限制
│   ├── services/
│   │   └── proxy.js            # axios 转发 & 流式响应透传
│   └── utils/
│       └── logger.js           # pino 日志
├── ecosystem.config.js         # PM2 配置
├── Dockerfile                  # Docker 多阶段构建
├── .env.example                # 所有可配置项及说明
└── package.json
```

## 注意事项

- 若宿主机在内网且公共机无法直接解析域名，请在目标 URL 中使用 IP 地址
- 生产环境务必启用至少一种安全措施（API Key、IP 白名单或 CIDR 限制）
- 服务默认仅接受 POST 入站请求，如需其他入站方法，修改 `ALLOWED_METHODS`
