# API 接口规范

[English](../../API.md) / 简体中文

> 文档版本：**API v0.1 草案** · 更新：**2026-10-01（Asia/Hong_Kong）**
> 基线：SRS v0.1、架构 v0.2、Git `b74cd1647a3e85796f3b1c9ae5c1cdac677c62bf`。
> **设计契约，待评审与实现，不是运行中服务的实测文档。** 基线仅包含数据库初始化代码，尚无 FastAPI 路由、请求 / 响应模型、应用入口和 API 测试。下列所有接口均待实现。

> **阅读方式：** 先从接口导航找到目标接口，再从上到下阅读该接口。每处集中列出认证、参数、完整请求 / 响应示例、字段表、错误和规则；公共约定统一说明后，在接口处按需重复，不要求来回翻模型字典。本次仅调整已有契约的阅读结构，不改变 API 行为。

**快速导航：** [公共约定](#common-conventions) · [接口导航](#api-index) · [错误字典](#error-dictionary) · [调用流程](#workflow) · [验收清单](#acceptance) · [待确认事项](#review-decisions)

## 1. 依据与范围

- [需求规格](../requirements/REQUIREMENTS_CN.md)：FR-01–FR-14、BR-01–BR-12、AC-01–AC-08。
- [架构设计](../architecture/ARCHITECTURE_CN.md)：第 4 节数据与事务、第 8–11 节接口与安全，特别遵循第 4.21 节及 ADR-008 的 v1 限制。
- [Future Work](../future/FUTURE_CN.md)：延期能力与永久排除项。
- [数据库 Schema](../../backend/database/init/01_init_schema.py)：以上述已提交基线核对字段、长度和约束；不以本地未提交代码为批准依据，不运行初始化脚本。

业务范围以 SRS 为准，数据库预留能力不等于开放功能。本文补充的序列化、分页、字段组合和错误处理属于**提请评审的 API 设计**，不是已有实现或此前已批准的会议结论；第 8 节列出关键待确认项。中英文版本须同步维护，业务变更应先更新 SRS / 架构 / 验收。

v1 仅支持：**一场一个职位、单选、一人一票、强制匿名、得票最高者当选**。

不定义账号管理 `/users`、注册、Refresh Token、审计查询、导出、邮件、实时投票率、照片上传、投票回执、已存选票查询 / 撤回 / 修改 / 删除、多轮、多票、实名投票或自动平票裁决。架构第 8 节的 `/users` 是资源预留，后台账号管理仍属 FW-08。账户由获授权的 Seed / 部署流程准备。

<a id="common-conventions"></a>

## 2. 公共约定

### 2.1 传输与认证

| 项目 | 契约 |
| --- | --- |
| 基础路径 | `/api/v1`；部署域名和端口待定。 |
| 格式 | JSON；带 JSON 正文的请求使用 `Content-Type: application/json`；JSON 响应使用 `application/json`。正式部署必须 HTTPS。 |
| 认证 | 除登录外均使用 `Authorization: Bearer <access-token>`；由验证后的 JWT 取得身份，不信任客户端自报身份。 |
| 身份失效 | 缺失 / 无效 / 过期 Token，或账户不再 ACTIVE，返回 `401 AUTHENTICATION_REQUIRED`，附 `WWW-Authenticate: Bearer`。 |
| 角色 | `ADMIN` 管理选举；`USER` 经名册授权才可投票。ADMIN 不具有 v1 投票角色。 |
| 缓存 | 认证、本人参与状态、选票、结果的成功及错误响应使用 `Cache-Control: no-store`。 |
| 输入白名单 | 只接收声明的 body / query 字段；未知字段或不应存在的 body 返回 `422 VALIDATION_ERROR`。 |

认证后仍需逐次检查账户有效性、角色、对象归属和选举资格；前端隐藏按钮不代替后端授权。管理员名册操作中的 `user_id` 指管理目标，不是操作者身份。

### 2.2 类型、时间与更新

| 类型 / 规则 | 草案约定 |
| --- | --- |
| `ID` | 正十进制字符串，匹配 `^[1-9][0-9]*$`，数值不超过 `18446744073709551615`；路径同样约束。避免 MySQL BIGINT UNSIGNED 在 JavaScript Number 中精度丢失。 |
| `Timestamp` | RFC 3339，显式时区、秒精度；输入接受 `Z` 或偏移，输出 UTC `Z`。`2026-10-02T10:00:00+08:00` 与 `2026-10-02T02:00:00Z` 是同一时刻。实现须统一数据库 DATETIME 的 UTC 读写。 |
| 时间窗 | 沿用 SRS AC-08：`starts_at <= server_now <= ends_at`，含两端；晚于 ends_at 才算超时。使用取得锁后重新读取的服务器时间，不相信浏览器时钟。 |
| 整数 | JSON 整数，不接受布尔、小数或字符串冒充。查询参数中的 page / page_size 使用正整数字符串。 |
| 文本 | 字符数限制；必填名称、标题、简介不能仅为空白。可在校验前去除首尾空白，但密码不得修改。响应作为纯文本渲染。 |
| PATCH | 仅更新显式字段；缺省保持原值；仅明确可空字段接受 null；空对象返回 `422`。 |
| 只读 | ID、状态、创建者、时间戳及推导值不得回写；状态使用专用接口。 |

已知但 v1 禁用的 `OPTIONAL_ANONYMOUS` / `IDENTIFIED` 写入返回 `400 PRIVACY_MODE_VIOLATION`；未知模式字符串返回 `422`。`vote_quota` 仅接受整数 1。已发布结果不增加 `PUBLISHED` 状态，而以 `results_published_at` 表示。

### 2.3 响应、分页与错误

普通响应：`{"data": <模型>}`；`204` 无正文，不能带 data。各接口列出的所有响应字段均存在，可空字段返回 null。

选举、候选人、名册列表使用分页：page 默认 1，最小 1；page_size 默认 20，范围 1–100。超出末页返回空数组，但 total 保留真实总数。先按权限过滤，再计算 total 和分页；ID 排序按数值而不是字符串。

```json
{
  "data": [],
  "meta": {"page": 1, "page_size": 20, "total": 0}
}
```

错误统一封装；客户端判断 code，不依赖 message 文案。details 可省略，只能含字段路径及静态原因，不回显输入、密码、Token 或候选人选择。实现须统一转换框架默认校验错误，不能混用另一套 detail 格式。

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed.",
    "details": [{"field": "body.candidate_id", "reason": "Expected a positive decimal ID string."}]
  }
}
```

<a id="api-index"></a>

## 3. 接口导航

点击接口名称即可跳转。下表使用完整 /api/v1 路径；每个接口再次列出权限与状态检查。原先集中、紧凑的模型汇总已拆为接口内逐字段表。

| 模块 | 接口 | 方法 | 完整路径 | 权限 | 成功状态 |
| --- | --- | --- | --- | --- | --- |
| 身份认证 | [登录](#endpoint-1) | `POST` | `/api/v1/auth/login` | 公开 | 200 |
| 身份认证 | [当前身份](#endpoint-2) | `GET` | `/api/v1/auth/me` | 已认证 | 200 |
| 选举管理 | [选举列表](#endpoint-3) | `GET` | `/api/v1/elections` | 已认证 | 200 |
| 选举管理 | [创建选举](#endpoint-4) | `POST` | `/api/v1/elections` | ADMIN | 201 |
| 选举管理 | [选举详情](#endpoint-5) | `GET` | `/api/v1/elections/{election_id}` | 已认证、可见范围内 | 200 |
| 选举管理 | [修改草稿选举](#endpoint-6) | `PATCH` | `/api/v1/elections/{election_id}` | ADMIN | 200 |
| 选举管理 | [开启投票](#endpoint-7) | `POST` | `/api/v1/elections/{election_id}/open` | ADMIN | 200 |
| 选举管理 | [关闭投票](#endpoint-8) | `POST` | `/api/v1/elections/{election_id}/close` | ADMIN | 200 |
| 候选人管理 | [候选人列表](#endpoint-9) | `GET` | `/api/v1/elections/{election_id}/candidates` | ADMIN / 合资格 USER | 200 |
| 候选人管理 | [添加候选人](#endpoint-10) | `POST` | `/api/v1/elections/{election_id}/candidates` | ADMIN | 201 |
| 候选人管理 | [修改候选人](#endpoint-11) | `PATCH` | `/api/v1/elections/{election_id}/candidates/{candidate_id}` | ADMIN | 200 |
| 候选人管理 | [删除草稿候选人](#endpoint-12) | `DELETE` | `/api/v1/elections/{election_id}/candidates/{candidate_id}` | ADMIN | 204 |
| 选民名册 | [名册列表](#endpoint-13) | `GET` | `/api/v1/elections/{election_id}/voters` | ADMIN | 200 |
| 选民名册 | [添加选民](#endpoint-14) | `POST` | `/api/v1/elections/{election_id}/voters` | ADMIN | 201 |
| 选民名册 | [移除选民](#endpoint-15) | `DELETE` | `/api/v1/elections/{election_id}/voters/{user_id}` | ADMIN | 204 |
| 选票与投票 | [获取选票视图](#endpoint-16) | `GET` | `/api/v1/elections/{election_id}/ballot` | 合资格 USER | 200 |
| 选票与投票 | [查询本人参与状态](#endpoint-17) | `GET` | `/api/v1/elections/{election_id}/participation` | USER | 200 |
| 选票与投票 | [提交匿名选票](#endpoint-18) | `POST` | `/api/v1/elections/{election_id}/votes` | 合资格 USER | 201 |
| 计票与结果 | [计票与查询结果](#endpoint-19) | `GET` | `/api/v1/elections/{election_id}/results` | ADMIN / 发布后 USER | 200 |
| 计票与结果 | [发布结果](#endpoint-20) | `POST` | `/api/v1/elections/{election_id}/results/publish` | ADMIN | 200 |

## 4. 逐接口说明

下方每个接口可独立阅读。示例为虚构数据，可能展示不同生命周期阶段；Token 和域名为占位值。204 明确无字段、无 JSON，不用空对象模拟空响应。

<a id="endpoint-1"></a>

### 4.1 登录

使用账户名与密码获取访问 Token 和当前身份。

#### 基本信息

| 项目 | 内容 |
| --- | --- |
| 方法 | `POST` |
| 完整路径 | `/api/v1/auth/login` |
| 认证 | 无需认证。 |
| 权限 | 公开 |
| 选举状态 | 与选举状态无关。 |
| 成功状态 | 200 |
| 请求格式 | HTTPS；JSON 正文，Content-Type: application/json。 |

#### 请求参数

**路径参数**

无。

**查询参数**

无。未声明的查询字段返回 422 VALIDATION_ERROR。

**JSON 请求体** — `Login`

| 字段 | 类型 | 必填 | 可空 | 默认值 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `username` | `string` | 是 | 否 | — | 非空白登录名，最多 50 字符。 |
| `password` | `string` | 是 | 否 | — | 非空密码，不得 trim 或修改；哈希 / 密码政策尚待确认。 |

仅表内字段可写。未知 / 只读字段或错误 JSON 类型返回 422 VALIDATION_ERROR；JSON 整数不接受布尔、小数或字符串冒充。

**本接口类型说明：** ID 为匹配 `^[1-9][0-9]*$` 的正十进制字符串，最大 `18446744073709551615`。Timestamp 为带时区、秒精度的 RFC 3339；输入允许 Z / 偏移，输出统一 UTC Z。名称、标题与必填简介不得仅为空白；密码只要求非空且不做 trim。

#### 请求示例

```http
POST /api/v1/auth/login HTTP/1.1
Host: api.example.invalid
Content-Type: application/json

{
  "username": "demo_voter",
  "password": "<demo-password>"
}
```

域名、ID 和凭据均为示例，不代表实际服务测试。

#### 成功响应

**HTTP 200** · Content-Type: application/json。下方完整展开 `Token` 响应；所有字段均出现，仅明确可空字段允许 null。

`Cache-Control: no-store`

| 字段 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| `data` | `object` | 否 | 成功数据。 |
| `data.access_token` | `string` | 否 | JWT 凭据，不得写日志。 |
| `data.token_type` | `string` | 否 | 固定 bearer。 |
| `data.expires_in` | `integer` | 否 | 来自部署配置的正整数秒；示例 3600 不代表已决定有效期。 |
| `data.user` | `object` | 否 | 当前认证账户，字段在下方展开，不含密码或哈希。 |
| `data.user.id` | `ID` | 否 | 账户标识。 |
| `data.user.username` | `string` | 否 | 登录名，1–50 字符。 |
| `data.user.display_name` | `string` | 否 | 显示名，1–100 字符。 |
| `data.user.role` | `string` | 否 | ADMIN 或 USER，由服务端确认角色。 |
| `data.user.status` | `string` | 否 | ACTIVE 或 DISABLED；受保护请求要求 ACTIVE。 |
| `data.user.created_at` | `Timestamp` | 否 | 账户创建时间。 |
| `data.user.updated_at` | `Timestamp` | 否 | 账户最后更新时间。 |

**完整成功示例**

```json
{
  "data": {
    "access_token": "<access-token>",
    "token_type": "bearer",
    "expires_in": 3600,
    "user": {
      "id": "21",
      "username": "demo_voter",
      "display_name": "Demo Voter",
      "role": "USER",
      "status": "ACTIVE",
      "created_at": "2026-10-01T01:00:00Z",
      "updated_at": "2026-10-01T01:00:00Z"
    }
  }
}
```

expires_in=3600 仅演示返回类型，不表示已批准 Token 有效期。

#### 错误响应

| HTTP | error.code | 触发条件 |
| --- | --- | --- |
| 401 | `INVALID_CREDENTIALS` | 统一登录失败，含禁用账户。 |
| 422 | `VALIDATION_ERROR` | JSON 损坏、类型 / 字段 / 路径 / query 不合法、未知字段、空 PATCH。 |
| 500 | `INTERNAL_ERROR` | 非预期内部错误；不得披露 SQL、凭据或堆栈。 |

错误结构：error.code 和 error.message 为必有字符串；可选 error.details 为含字符串 field / reason 的对象数组，禁止回显原始输入。受保护接口返回 401 时附 WWW-Authenticate: Bearer。

客户端按 error.code 分支处理，不依赖 message 文案；错误不得暴露 SQL、堆栈、密码、Token 或原始投票输入。

错误响应同样使用 Cache-Control: no-store。

**示例：HTTP 401**

```json
{
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Generic login failure, including disabled accounts."
  }
}
```

#### 业务规则与重试

- 请求：Login；无 query。成功：200 Token。
- 检查密码及账户状态；未知用户、错误密码、禁用账户统一返回 `401 INVALID_CREDENTIALS`，避免账户枚举。
- JWT 有效期、签名配置来自环境而非写死示例；哈希算法、前端 Token 存放方式尚待确认。不新增注册、刷新 Token 或服务端注销接口。

[返回接口导航](#api-index)

---

<a id="endpoint-2"></a>

### 4.2 当前身份

查询当前访问 Token 对应的账户身份。

#### 基本信息

| 项目 | 内容 |
| --- | --- |
| 方法 | `GET` |
| 完整路径 | `/api/v1/auth/me` |
| 认证 | 必需：`Authorization: Bearer <access-token>`；账户须持续为 ACTIVE。 |
| 权限 | 已认证 |
| 选举状态 | 与选举状态无关。 |
| 成功状态 | 200 |
| 请求格式 | HTTPS；无请求体，无需 Content-Type。 |

#### 请求参数

**路径参数**

无。

**查询参数**

无。未声明的查询字段返回 422 VALIDATION_ERROR。

**JSON 请求体**

无。不要发送 JSON（包括空对象）；额外请求体返回 422 VALIDATION_ERROR。

**本接口类型说明：** ID 为匹配 `^[1-9][0-9]*$` 的正十进制字符串，最大 `18446744073709551615`。Timestamp 为带时区、秒精度的 RFC 3339；输入允许 Z / 偏移，输出统一 UTC Z。名称、标题与必填简介不得仅为空白；密码只要求非空且不做 trim。

#### 请求示例

```http
GET /api/v1/auth/me HTTP/1.1
Host: api.example.invalid
Authorization: Bearer <access-token>
```

域名、ID 和凭据均为示例，不代表实际服务测试。

#### 成功响应

**HTTP 200** · Content-Type: application/json。下方完整展开 `User` 响应；所有字段均出现，仅明确可空字段允许 null。

`Cache-Control: no-store`

| 字段 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| `data` | `object` | 否 | 成功数据。 |
| `data.id` | `ID` | 否 | 账户标识。 |
| `data.username` | `string` | 否 | 登录名，1–50 字符。 |
| `data.display_name` | `string` | 否 | 显示名，1–100 字符。 |
| `data.role` | `string` | 否 | ADMIN 或 USER，由服务端确认角色。 |
| `data.status` | `string` | 否 | ACTIVE 或 DISABLED；受保护请求要求 ACTIVE。 |
| `data.created_at` | `Timestamp` | 否 | 账户创建时间。 |
| `data.updated_at` | `Timestamp` | 否 | 账户最后更新时间。 |

**完整成功示例**

```json
{
  "data": {
    "id": "21",
    "username": "demo_voter",
    "display_name": "Demo Voter",
    "role": "USER",
    "status": "ACTIVE",
    "created_at": "2026-10-01T01:00:00Z",
    "updated_at": "2026-10-01T01:00:00Z"
  }
}
```

#### 错误响应

| HTTP | error.code | 触发条件 |
| --- | --- | --- |
| 401 | `AUTHENTICATION_REQUIRED` | 身份缺失 / 无效 / 过期 / 账户不再 ACTIVE。 |
| 403 | `PERMISSION_DENIED` | 已认证但角色无权执行操作。 |
| 422 | `VALIDATION_ERROR` | JSON 损坏、类型 / 字段 / 路径 / query 不合法、未知字段、空 PATCH。 |
| 500 | `INTERNAL_ERROR` | 非预期内部错误；不得披露 SQL、凭据或堆栈。 |

错误结构：error.code 和 error.message 为必有字符串；可选 error.details 为含字符串 field / reason 的对象数组，禁止回显原始输入。受保护接口返回 401 时附 WWW-Authenticate: Bearer。

客户端按 error.code 分支处理，不依赖 message 文案；错误不得暴露 SQL、堆栈、密码、Token 或原始投票输入。

错误响应同样使用 Cache-Control: no-store。

**示例：HTTP 401**

```json
{
  "error": {
    "code": "AUTHENTICATION_REQUIRED",
    "message": "Missing/invalid/expired identity or account no longer ACTIVE."
  }
}
```

#### 业务规则与重试

- 请求：无 body / query。成功：200 User。
- 从验证后的 JWT 获取账户；账户被禁用时，即使 Token 未过期也返回 `401 AUTHENTICATION_REQUIRED`。
- 不接受 user_id 参数查询他人。

只读操作：重试 / 轮询必须有次数及超时上限；读取不预留额度、不发布结果。

[返回接口导航](#api-index)

---

<a id="endpoint-3"></a>

### 4.3 选举列表

分页查询当前调用者可见的选举。

#### 基本信息

| 项目 | 内容 |
| --- | --- |
| 方法 | `GET` |
| 完整路径 | `/api/v1/elections` |
| 认证 | 必需：`Authorization: Bearer <access-token>`；账户须持续为 ACTIVE。 |
| 权限 | 已认证 |
| 选举状态 | 任意可见状态，可用 status 筛选。 |
| 成功状态 | 200 |
| 请求格式 | HTTPS；无请求体，无需 Content-Type。 |

#### 请求参数

**路径参数**

无。

**查询参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `page` | `integer` | 否 | 1 | 正整数字符串，最小 1。 |
| `page_size` | `integer` | 否 | 20 | 正整数字符串，范围 1–100。 |
| `status` | `string` | 否 | — | DRAFT / OPEN / CLOSED；缺省表示不按状态筛选。 |

先按权限过滤再计算总数和分页。超出最后一页返回 data: []，保留真实 total；未知查询字段返回 422。

**JSON 请求体**

无。不要发送 JSON（包括空对象）；额外请求体返回 422 VALIDATION_ERROR。

**本接口类型说明：** ID 为匹配 `^[1-9][0-9]*$` 的正十进制字符串，最大 `18446744073709551615`。Timestamp 为带时区、秒精度的 RFC 3339；输入允许 Z / 偏移，输出统一 UTC Z。名称、标题与必填简介不得仅为空白；密码只要求非空且不做 trim。

#### 请求示例

```http
GET /api/v1/elections?page=1&page_size=20 HTTP/1.1
Host: api.example.invalid
Authorization: Bearer <access-token>
```

域名、ID 和凭据均为示例，不代表实际服务测试。

#### 成功响应

**HTTP 200** · Content-Type: application/json。下方完整展开 `Election[]` 响应；所有字段均出现，仅明确可空字段允许 null。

| 字段 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| `data` | `object[]` | 否 | 成功数据。 |
| `data[].id` | `ID` | 否 | 选举标识。 |
| `data[].title` | `string` | 否 | 选举名称，1–200 字符且不得仅为空白。 |
| `data[].position_title` | `string` | 否 | 唯一竞选职位，1–100 字符且不得仅为空白。 |
| `data[].description` | `string` | 是 | 可选说明，最多 10000 字符。 |
| `data[].created_by` | `ID` | 否 | 从已认证 ADMIN 取得创建者，不接受客户端指定。 |
| `data[].status` | `string` | 否 | DRAFT、OPEN 或 CLOSED；没有 PUBLISHED 状态。 |
| `data[].privacy_mode` | `string` | 否 | v1 仅 FORCED_ANONYMOUS。 |
| `data[].starts_at` | `Timestamp` | 否 | 投票开始，必须早于 ends_at。 |
| `data[].ends_at` | `Timestamp` | 否 | 投票结束；合法时间窗 starts_at <= server_now <= ends_at，含两端。 |
| `data[].results_published_at` | `Timestamp` | 是 | 发布前 null，发布后为服务器确定的发布时间。 |
| `data[].created_at` | `Timestamp` | 否 | 选举创建时间。 |
| `data[].updated_at` | `Timestamp` | 否 | 选举最后更新时间。 |
| `meta` | `object` | 否 | 权限过滤后的分页信息。 |
| `meta.page` | `integer` | 否 | 当前页，最小 1。 |
| `meta.page_size` | `integer` | 否 | 每页数量，1–100。 |
| `meta.total` | `integer` | 否 | 可见记录总数，非负；越界页仍返回真实总数。 |

**完整成功示例**

```json
{
  "data": [
    {
      "id": "1001",
      "title": "Class Representative Election",
      "position_title": "Class Representative",
      "description": "One seat; one choice per voter.",
      "created_by": "11",
      "status": "DRAFT",
      "privacy_mode": "FORCED_ANONYMOUS",
      "starts_at": "2026-10-02T02:00:00Z",
      "ends_at": "2026-10-02T04:00:00Z",
      "results_published_at": null,
      "created_at": "2026-10-01T01:00:00Z",
      "updated_at": "2026-10-01T01:00:00Z"
    }
  ],
  "meta": {
    "page": 1,
    "page_size": 20,
    "total": 1
  }
}
```

#### 错误响应

| HTTP | error.code | 触发条件 |
| --- | --- | --- |
| 401 | `AUTHENTICATION_REQUIRED` | 身份缺失 / 无效 / 过期 / 账户不再 ACTIVE。 |
| 403 | `PERMISSION_DENIED` | 已认证但角色无权执行操作。 |
| 422 | `VALIDATION_ERROR` | JSON 损坏、类型 / 字段 / 路径 / query 不合法、未知字段、空 PATCH。 |
| 500 | `INTERNAL_ERROR` | 非预期内部错误；不得披露 SQL、凭据或堆栈。 |

错误结构：error.code 和 error.message 为必有字符串；可选 error.details 为含字符串 field / reason 的对象数组，禁止回显原始输入。受保护接口返回 401 时附 WWW-Authenticate: Bearer。

客户端按 error.code 分支处理，不依赖 message 文案；错误不得暴露 SQL、堆栈、密码、Token 或原始投票输入。

**示例：HTTP 422**

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Malformed JSON, invalid types/fields/paths/query, unknown fields or empty PATCH."
  }
}
```

#### 业务规则与重试

- Query：page、page_size，以及可选 status（DRAFT / OPEN / CLOSED）；无 body。
- ADMIN 可见全部；USER 可见本人名册内选举及所有已发布选举。按数值 id 降序，先过滤权限后分页。
- 成功：200 Election[] + meta；空集合为 data=[]、total=0。不含实时票数、他人名册或未发布结果。

只读操作：重试 / 轮询必须有次数及超时上限；读取不预留额度、不发布结果。

[返回接口导航](#api-index)

---

<a id="endpoint-4"></a>

### 4.4 创建选举

在一个事务中创建草稿选举及其初始合资格名册。

#### 基本信息

| 项目 | 内容 |
| --- | --- |
| 方法 | `POST` |
| 完整路径 | `/api/v1/elections` |
| 认证 | 必需：`Authorization: Bearer <access-token>`；账户须持续为 ACTIVE。 |
| 权限 | ADMIN |
| 选举状态 | 创建 DRAFT。 |
| 成功状态 | 201 |
| 请求格式 | HTTPS；JSON 正文，Content-Type: application/json。 |

#### 请求参数

**路径参数**

无。

**查询参数**

无。未声明的查询字段返回 422 VALIDATION_ERROR。

**JSON 请求体** — `ElectionCreate`

| 字段 | 类型 | 必填 | 可空 | 默认值 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `title` | `string` | 是 | 否 | — | 选举名称，1–200 字符且不得仅为空白。 |
| `position_title` | `string` | 是 | 否 | — | 唯一竞选职位，1–100 字符且不得仅为空白。 |
| `description` | `string` | 否 | 是 | `null` | 可选说明，最多 10000 字符。 |
| `starts_at` | `Timestamp` | 是 | 否 | — | 投票开始，必须早于 ends_at。 |
| `ends_at` | `Timestamp` | 是 | 否 | — | 投票结束；合法时间窗 starts_at <= server_now <= ends_at，含两端。 |
| `privacy_mode` | `string` | 否 | 否 | `FORCED_ANONYMOUS` | v1 仅 FORCED_ANONYMOUS。 |
| `voter_ids` | `ID[]` | 是 | 否 | — | 已有 ACTIVE USER 的非空、不重复 ID 数组。原子创建初始名册，不新增数据库列。 |

仅表内字段可写。未知 / 只读字段或错误 JSON 类型返回 422 VALIDATION_ERROR；JSON 整数不接受布尔、小数或字符串冒充。

按最终合并值校验 starts_at < ends_at。OPTIONAL_ANONYMOUS / IDENTIFIED 返回 400 PRIVACY_MODE_VIOLATION，未知模式返回 422。

**本接口类型说明：** ID 为匹配 `^[1-9][0-9]*$` 的正十进制字符串，最大 `18446744073709551615`。Timestamp 为带时区、秒精度的 RFC 3339；输入允许 Z / 偏移，输出统一 UTC Z。名称、标题与必填简介不得仅为空白；密码只要求非空且不做 trim。

#### 请求示例

```http
POST /api/v1/elections HTTP/1.1
Host: api.example.invalid
Authorization: Bearer <access-token>
Content-Type: application/json

{
  "title": "Class Representative Election",
  "position_title": "Class Representative",
  "description": "One seat; one choice per voter.",
  "starts_at": "2026-10-02T02:00:00Z",
  "ends_at": "2026-10-02T04:00:00Z",
  "voter_ids": [
    "21",
    "22"
  ]
}
```

域名、ID 和凭据均为示例，不代表实际服务测试。

#### 成功响应

**HTTP 201** · Content-Type: application/json。下方完整展开 `Election` 响应；所有字段均出现，仅明确可空字段允许 null。

| 字段 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| `data` | `object` | 否 | 成功数据。 |
| `data.id` | `ID` | 否 | 选举标识。 |
| `data.title` | `string` | 否 | 选举名称，1–200 字符且不得仅为空白。 |
| `data.position_title` | `string` | 否 | 唯一竞选职位，1–100 字符且不得仅为空白。 |
| `data.description` | `string` | 是 | 可选说明，最多 10000 字符。 |
| `data.created_by` | `ID` | 否 | 从已认证 ADMIN 取得创建者，不接受客户端指定。 |
| `data.status` | `string` | 否 | DRAFT、OPEN 或 CLOSED；没有 PUBLISHED 状态。 |
| `data.privacy_mode` | `string` | 否 | v1 仅 FORCED_ANONYMOUS。 |
| `data.starts_at` | `Timestamp` | 否 | 投票开始，必须早于 ends_at。 |
| `data.ends_at` | `Timestamp` | 否 | 投票结束；合法时间窗 starts_at <= server_now <= ends_at，含两端。 |
| `data.results_published_at` | `Timestamp` | 是 | 发布前 null，发布后为服务器确定的发布时间。 |
| `data.created_at` | `Timestamp` | 否 | 选举创建时间。 |
| `data.updated_at` | `Timestamp` | 否 | 选举最后更新时间。 |

**完整成功示例**

```json
{
  "data": {
    "id": "1001",
    "title": "Class Representative Election",
    "position_title": "Class Representative",
    "description": "One seat; one choice per voter.",
    "created_by": "11",
    "status": "DRAFT",
    "privacy_mode": "FORCED_ANONYMOUS",
    "starts_at": "2026-10-02T02:00:00Z",
    "ends_at": "2026-10-02T04:00:00Z",
    "results_published_at": null,
    "created_at": "2026-10-01T01:00:00Z",
    "updated_at": "2026-10-01T01:00:00Z"
  }
}
```

#### 错误响应

| HTTP | error.code | 触发条件 |
| --- | --- | --- |
| 400 | `PRIVACY_MODE_VIOLATION` | 请求启用已知但 v1 禁止的匿名模式。 |
| 401 | `AUTHENTICATION_REQUIRED` | 身份缺失 / 无效 / 过期 / 账户不再 ACTIVE。 |
| 403 | `PERMISSION_DENIED` | 已认证但角色无权执行操作。 |
| 404 | `USER_NOT_FOUND` | 管理员指定的名册账户不存在。 |
| 422 | `VALIDATION_ERROR` | JSON 损坏、类型 / 字段 / 路径 / query 不合法、未知字段、空 PATCH。 |
| 422 | `INVALID_TIME_RANGE` | 合并后的 starts_at 不早于 ends_at。 |
| 422 | `INVALID_VOTER` | 已有账户非 ACTIVE 或非 USER。 |
| 500 | `INTERNAL_ERROR` | 非预期内部错误；不得披露 SQL、凭据或堆栈。 |

错误结构：error.code 和 error.message 为必有字符串；可选 error.details 为含字符串 field / reason 的对象数组，禁止回显原始输入。受保护接口返回 401 时附 WWW-Authenticate: Bearer。

客户端按 error.code 分支处理，不依赖 message 文案；错误不得暴露 SQL、堆栈、密码、Token 或原始投票输入。

**示例：HTTP 422**

```json
{
  "error": {
    "code": "INVALID_TIME_RANGE",
    "message": "Merged starts_at does not precede ends_at."
  }
}
```

#### 业务规则与重试

- ADMIN；请求 ElectionCreate；成功 201 Election，状态 DRAFT。
- starts_at 必须早于 ends_at。voter_ids 必须不重复，且每个目标均为已有 ACTIVE USER；账户 ID 由获授权的 Seed / 部署资料提供。
- 在同一事务创建选举和初始名册，额度均为 1；任一账户不合法则全部回滚。created_by 从当前 ADMIN 取得。之后添加候选人。
- 错误：`USER_NOT_FOUND`、`INVALID_VOTER`、`INVALID_TIME_RANGE`、`PRIVACY_MODE_VIOLATION`；重复 voter_ids 属于 `VALIDATION_ERROR`。

- 创建选举 / 候选人不承诺严格幂等，超时先查询核对；名册重复新增 409。重复删除可 404，但不产生第二次删除效果。

[返回接口导航](#api-index)

---

<a id="endpoint-5"></a>

### 4.5 选举详情

查询单场选举基本信息，不附带名册或票数。

#### 基本信息

| 项目 | 内容 |
| --- | --- |
| 方法 | `GET` |
| 完整路径 | `/api/v1/elections/{election_id}` |
| 认证 | 必需：`Authorization: Bearer <access-token>`；账户须持续为 ACTIVE。 |
| 权限 | 已认证、可见范围内 |
| 选举状态 | 任意可见状态。 |
| 成功状态 | 200 |
| 请求格式 | HTTPS；无请求体，无需 Content-Type。 |

#### 请求参数

**路径参数**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `election_id` | `ID` | 是 | 目标选举。 |

**查询参数**

无。未声明的查询字段返回 422 VALIDATION_ERROR。

**JSON 请求体**

无。不要发送 JSON（包括空对象）；额外请求体返回 422 VALIDATION_ERROR。

**本接口类型说明：** ID 为匹配 `^[1-9][0-9]*$` 的正十进制字符串，最大 `18446744073709551615`。Timestamp 为带时区、秒精度的 RFC 3339；输入允许 Z / 偏移，输出统一 UTC Z。名称、标题与必填简介不得仅为空白；密码只要求非空且不做 trim。

#### 请求示例

```http
GET /api/v1/elections/1001 HTTP/1.1
Host: api.example.invalid
Authorization: Bearer <access-token>
```

域名、ID 和凭据均为示例，不代表实际服务测试。

#### 成功响应

**HTTP 200** · Content-Type: application/json。下方完整展开 `Election` 响应；所有字段均出现，仅明确可空字段允许 null。

| 字段 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| `data` | `object` | 否 | 成功数据。 |
| `data.id` | `ID` | 否 | 选举标识。 |
| `data.title` | `string` | 否 | 选举名称，1–200 字符且不得仅为空白。 |
| `data.position_title` | `string` | 否 | 唯一竞选职位，1–100 字符且不得仅为空白。 |
| `data.description` | `string` | 是 | 可选说明，最多 10000 字符。 |
| `data.created_by` | `ID` | 否 | 从已认证 ADMIN 取得创建者，不接受客户端指定。 |
| `data.status` | `string` | 否 | DRAFT、OPEN 或 CLOSED；没有 PUBLISHED 状态。 |
| `data.privacy_mode` | `string` | 否 | v1 仅 FORCED_ANONYMOUS。 |
| `data.starts_at` | `Timestamp` | 否 | 投票开始，必须早于 ends_at。 |
| `data.ends_at` | `Timestamp` | 否 | 投票结束；合法时间窗 starts_at <= server_now <= ends_at，含两端。 |
| `data.results_published_at` | `Timestamp` | 是 | 发布前 null，发布后为服务器确定的发布时间。 |
| `data.created_at` | `Timestamp` | 否 | 选举创建时间。 |
| `data.updated_at` | `Timestamp` | 否 | 选举最后更新时间。 |

**完整成功示例**

```json
{
  "data": {
    "id": "1001",
    "title": "Class Representative Election",
    "position_title": "Class Representative",
    "description": "One seat; one choice per voter.",
    "created_by": "11",
    "status": "DRAFT",
    "privacy_mode": "FORCED_ANONYMOUS",
    "starts_at": "2026-10-02T02:00:00Z",
    "ends_at": "2026-10-02T04:00:00Z",
    "results_published_at": null,
    "created_at": "2026-10-01T01:00:00Z",
    "updated_at": "2026-10-01T01:00:00Z"
  }
}
```

#### 错误响应

| HTTP | error.code | 触发条件 |
| --- | --- | --- |
| 401 | `AUTHENTICATION_REQUIRED` | 身份缺失 / 无效 / 过期 / 账户不再 ACTIVE。 |
| 403 | `PERMISSION_DENIED` | 已认证但角色无权执行操作。 |
| 404 | `ELECTION_NOT_FOUND` | 选举不存在，或详情超出可见范围。 |
| 422 | `VALIDATION_ERROR` | JSON 损坏、类型 / 字段 / 路径 / query 不合法、未知字段、空 PATCH。 |
| 500 | `INTERNAL_ERROR` | 非预期内部错误；不得披露 SQL、凭据或堆栈。 |

错误结构：error.code 和 error.message 为必有字符串；可选 error.details 为含字符串 field / reason 的对象数组，禁止回显原始输入。受保护接口返回 401 时附 WWW-Authenticate: Bearer。

客户端按 error.code 分支处理，不依赖 message 文案；错误不得暴露 SQL、堆栈、密码、Token 或原始投票输入。

**示例：HTTP 404**

```json
{
  "error": {
    "code": "ELECTION_NOT_FOUND",
    "message": "Election absent, or detail outside visibility."
  }
}
```

#### 业务规则与重试

- 无 body / query；成功 200 Election。可见性同列表。
- 不存在或不在可见范围内统一返回 `404 ELECTION_NOT_FOUND`。不附带候选人、其他选民和得票。

只读操作：重试 / 轮询必须有次数及超时上限；读取不预留额度、不发布结果。

[返回接口导航](#api-index)

---

<a id="endpoint-6"></a>

### 4.6 修改草稿选举

修改草稿选举的指定字段，未提交字段保持原值。

#### 基本信息

| 项目 | 内容 |
| --- | --- |
| 方法 | `PATCH` |
| 完整路径 | `/api/v1/elections/{election_id}` |
| 认证 | 必需：`Authorization: Bearer <access-token>`；账户须持续为 ACTIVE。 |
| 权限 | ADMIN |
| 选举状态 | 仅 DRAFT。 |
| 成功状态 | 200 |
| 请求格式 | HTTPS；JSON 正文，Content-Type: application/json。 |

#### 请求参数

**路径参数**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `election_id` | `ID` | 是 | 目标选举。 |

**查询参数**

无。未声明的查询字段返回 422 VALIDATION_ERROR。

**JSON 请求体** — `ElectionPatch`

| 字段 | 类型 | 必填 | 可空 | 默认值 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `title` | `string` | 否 | 否 | `保持原值` | 选举名称，1–200 字符且不得仅为空白。 |
| `position_title` | `string` | 否 | 否 | `保持原值` | 唯一竞选职位，1–100 字符且不得仅为空白。 |
| `description` | `string` | 否 | 是 | `保持原值` | 可选说明，最多 10000 字符。 |
| `starts_at` | `Timestamp` | 否 | 否 | `保持原值` | 投票开始，必须早于 ends_at。 |
| `ends_at` | `Timestamp` | 否 | 否 | `保持原值` | 投票结束；合法时间窗 starts_at <= server_now <= ends_at，含两端。 |
| `privacy_mode` | `string` | 否 | 否 | `保持原值` | v1 仅 FORCED_ANONYMOUS。 |

至少提交一个表内字段。缺省字段保持原值，只有可空字段可通过 null 清空；空对象返回 422 VALIDATION_ERROR。

仅表内字段可写。未知 / 只读字段或错误 JSON 类型返回 422 VALIDATION_ERROR；JSON 整数不接受布尔、小数或字符串冒充。

按最终合并值校验 starts_at < ends_at。OPTIONAL_ANONYMOUS / IDENTIFIED 返回 400 PRIVACY_MODE_VIOLATION，未知模式返回 422。

**本接口类型说明：** ID 为匹配 `^[1-9][0-9]*$` 的正十进制字符串，最大 `18446744073709551615`。Timestamp 为带时区、秒精度的 RFC 3339；输入允许 Z / 偏移，输出统一 UTC Z。名称、标题与必填简介不得仅为空白；密码只要求非空且不做 trim。

#### 请求示例

```http
PATCH /api/v1/elections/1001 HTTP/1.1
Host: api.example.invalid
Authorization: Bearer <access-token>
Content-Type: application/json

{
  "description": "Updated election description."
}
```

域名、ID 和凭据均为示例，不代表实际服务测试。

#### 成功响应

**HTTP 200** · Content-Type: application/json。下方完整展开 `Election` 响应；所有字段均出现，仅明确可空字段允许 null。

| 字段 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| `data` | `object` | 否 | 成功数据。 |
| `data.id` | `ID` | 否 | 选举标识。 |
| `data.title` | `string` | 否 | 选举名称，1–200 字符且不得仅为空白。 |
| `data.position_title` | `string` | 否 | 唯一竞选职位，1–100 字符且不得仅为空白。 |
| `data.description` | `string` | 是 | 可选说明，最多 10000 字符。 |
| `data.created_by` | `ID` | 否 | 从已认证 ADMIN 取得创建者，不接受客户端指定。 |
| `data.status` | `string` | 否 | DRAFT、OPEN 或 CLOSED；没有 PUBLISHED 状态。 |
| `data.privacy_mode` | `string` | 否 | v1 仅 FORCED_ANONYMOUS。 |
| `data.starts_at` | `Timestamp` | 否 | 投票开始，必须早于 ends_at。 |
| `data.ends_at` | `Timestamp` | 否 | 投票结束；合法时间窗 starts_at <= server_now <= ends_at，含两端。 |
| `data.results_published_at` | `Timestamp` | 是 | 发布前 null，发布后为服务器确定的发布时间。 |
| `data.created_at` | `Timestamp` | 否 | 选举创建时间。 |
| `data.updated_at` | `Timestamp` | 否 | 选举最后更新时间。 |

**完整成功示例**

```json
{
  "data": {
    "id": "1001",
    "title": "Class Representative Election",
    "position_title": "Class Representative",
    "description": "Updated election description.",
    "created_by": "11",
    "status": "DRAFT",
    "privacy_mode": "FORCED_ANONYMOUS",
    "starts_at": "2026-10-02T02:00:00Z",
    "ends_at": "2026-10-02T04:00:00Z",
    "results_published_at": null,
    "created_at": "2026-10-01T01:00:00Z",
    "updated_at": "2026-10-01T01:05:00Z"
  }
}
```

#### 错误响应

| HTTP | error.code | 触发条件 |
| --- | --- | --- |
| 400 | `PRIVACY_MODE_VIOLATION` | 请求启用已知但 v1 禁止的匿名模式。 |
| 401 | `AUTHENTICATION_REQUIRED` | 身份缺失 / 无效 / 过期 / 账户不再 ACTIVE。 |
| 403 | `PERMISSION_DENIED` | 已认证但角色无权执行操作。 |
| 404 | `ELECTION_NOT_FOUND` | 选举不存在，或详情超出可见范围。 |
| 409 | `ELECTION_NOT_EDITABLE` | 修改要求 DRAFT。 |
| 422 | `VALIDATION_ERROR` | JSON 损坏、类型 / 字段 / 路径 / query 不合法、未知字段、空 PATCH。 |
| 422 | `INVALID_TIME_RANGE` | 合并后的 starts_at 不早于 ends_at。 |
| 500 | `INTERNAL_ERROR` | 非预期内部错误；不得披露 SQL、凭据或堆栈。 |

错误结构：error.code 和 error.message 为必有字符串；可选 error.details 为含字符串 field / reason 的对象数组，禁止回显原始输入。受保护接口返回 401 时附 WWW-Authenticate: Bearer。

客户端按 error.code 分支处理，不依赖 message 文案；错误不得暴露 SQL、堆栈、密码、Token 或原始投票输入。

**示例：HTTP 409**

```json
{
  "error": {
    "code": "ELECTION_NOT_EDITABLE",
    "message": "Mutation requires DRAFT."
  }
}
```

#### 业务规则与重试

- ADMIN；仅 DRAFT；请求 ElectionPatch；成功 200 Election。
- 合并新旧字段后检查时间范围；拒绝 id、created_by、status、results_published_at、voter_ids。修改资格用名册接口。
- 与 open 并发时，草稿修改不能在选举已 OPEN 后提交。
- 错误：`ELECTION_NOT_FOUND`、`ELECTION_NOT_EDITABLE`、`INVALID_TIME_RANGE`、`PRIVACY_MODE_VIOLATION`。

[返回接口导航](#api-index)

---

<a id="endpoint-7"></a>

### 4.7 开启投票

在规定时间窗内，将已准备好的选举从 DRAFT 开启为 OPEN。

#### 基本信息

| 项目 | 内容 |
| --- | --- |
| 方法 | `POST` |
| 完整路径 | `/api/v1/elections/{election_id}/open` |
| 认证 | 必需：`Authorization: Bearer <access-token>`；账户须持续为 ACTIVE。 |
| 权限 | ADMIN |
| 选举状态 | DRAFT → OPEN；starts_at <= server_now <= ends_at。 |
| 成功状态 | 200 |
| 请求格式 | HTTPS；无请求体，无需 Content-Type。 |

#### 请求参数

**路径参数**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `election_id` | `ID` | 是 | 目标选举。 |

**查询参数**

无。未声明的查询字段返回 422 VALIDATION_ERROR。

**JSON 请求体**

无。不要发送 JSON（包括空对象）；额外请求体返回 422 VALIDATION_ERROR。

**本接口类型说明：** ID 为匹配 `^[1-9][0-9]*$` 的正十进制字符串，最大 `18446744073709551615`。Timestamp 为带时区、秒精度的 RFC 3339；输入允许 Z / 偏移，输出统一 UTC Z。名称、标题与必填简介不得仅为空白；密码只要求非空且不做 trim。

#### 请求示例

```http
POST /api/v1/elections/1001/open HTTP/1.1
Host: api.example.invalid
Authorization: Bearer <access-token>
```

域名、ID 和凭据均为示例，不代表实际服务测试。

#### 成功响应

**HTTP 200** · Content-Type: application/json。下方完整展开 `Election` 响应；所有字段均出现，仅明确可空字段允许 null。

| 字段 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| `data` | `object` | 否 | 成功数据。 |
| `data.id` | `ID` | 否 | 选举标识。 |
| `data.title` | `string` | 否 | 选举名称，1–200 字符且不得仅为空白。 |
| `data.position_title` | `string` | 否 | 唯一竞选职位，1–100 字符且不得仅为空白。 |
| `data.description` | `string` | 是 | 可选说明，最多 10000 字符。 |
| `data.created_by` | `ID` | 否 | 从已认证 ADMIN 取得创建者，不接受客户端指定。 |
| `data.status` | `string` | 否 | DRAFT、OPEN 或 CLOSED；没有 PUBLISHED 状态。 |
| `data.privacy_mode` | `string` | 否 | v1 仅 FORCED_ANONYMOUS。 |
| `data.starts_at` | `Timestamp` | 否 | 投票开始，必须早于 ends_at。 |
| `data.ends_at` | `Timestamp` | 否 | 投票结束；合法时间窗 starts_at <= server_now <= ends_at，含两端。 |
| `data.results_published_at` | `Timestamp` | 是 | 发布前 null，发布后为服务器确定的发布时间。 |
| `data.created_at` | `Timestamp` | 否 | 选举创建时间。 |
| `data.updated_at` | `Timestamp` | 否 | 选举最后更新时间。 |

**完整成功示例**

```json
{
  "data": {
    "id": "1001",
    "title": "Class Representative Election",
    "position_title": "Class Representative",
    "description": "One seat; one choice per voter.",
    "created_by": "11",
    "status": "OPEN",
    "privacy_mode": "FORCED_ANONYMOUS",
    "starts_at": "2026-10-02T02:00:00Z",
    "ends_at": "2026-10-02T04:00:00Z",
    "results_published_at": null,
    "created_at": "2026-10-01T01:00:00Z",
    "updated_at": "2026-10-02T02:00:00Z"
  }
}
```

#### 错误响应

| HTTP | error.code | 触发条件 |
| --- | --- | --- |
| 401 | `AUTHENTICATION_REQUIRED` | 身份缺失 / 无效 / 过期 / 账户不再 ACTIVE。 |
| 403 | `PERMISSION_DENIED` | 已认证但角色无权执行操作。 |
| 404 | `ELECTION_NOT_FOUND` | 选举不存在，或详情超出可见范围。 |
| 409 | `INVALID_STATE_TRANSITION` | 不合法或重复 open / close。 |
| 409 | `ELECTION_NOT_READY` | 无合法候选人 / 有效选民，或 MVP 配置不合法。 |
| 409 | `VOTING_NOT_STARTED` | 服务器时间早于 starts_at。 |
| 409 | `VOTING_ENDED` | 服务器时间晚于 ends_at。 |
| 422 | `VALIDATION_ERROR` | JSON 损坏、类型 / 字段 / 路径 / query 不合法、未知字段、空 PATCH。 |
| 500 | `INTERNAL_ERROR` | 非预期内部错误；不得披露 SQL、凭据或堆栈。 |

错误结构：error.code 和 error.message 为必有字符串；可选 error.details 为含字符串 field / reason 的对象数组，禁止回显原始输入。受保护接口返回 401 时附 WWW-Authenticate: Bearer。

客户端按 error.code 分支处理，不依赖 message 文案；错误不得暴露 SQL、堆栈、密码、Token 或原始投票输入。

**示例：HTTP 409**

```json
{
  "error": {
    "code": "VOTING_NOT_STARTED",
    "message": "Server time is before starts_at."
  }
}
```

#### 业务规则与重试

- ADMIN；无 body / query；仅 DRAFT → OPEN；成功 200 Election。
- 要求处于含两端时间窗，至少一个候选人且全部候选人资料合法、至少一个 ACTIVE USER 名册成员；全部额度为 1，匿名模式为 FORCED_ANONYMOUS。
- 检查与状态流转须原子完成；重复 open 和重开 CLOSED 均返回 `INVALID_STATE_TRANSITION`。不引入定时调度器。
- 错误：`ELECTION_NOT_FOUND`、`INVALID_STATE_TRANSITION`、`ELECTION_NOT_READY`、`VOTING_NOT_STARTED`、`VOTING_ENDED`。

- 重复 open / close 返回 409，先 GET 选举确认状态。重复发布按草案返回原时间，不覆盖。

[返回接口导航](#api-index)

---

<a id="endpoint-8"></a>

### 4.8 关闭投票

停止接收选票，使选举可以进入最终计票流程。

#### 基本信息

| 项目 | 内容 |
| --- | --- |
| 方法 | `POST` |
| 完整路径 | `/api/v1/elections/{election_id}/close` |
| 认证 | 必需：`Authorization: Bearer <access-token>`；账户须持续为 ACTIVE。 |
| 权限 | ADMIN |
| 选举状态 | OPEN → CLOSED；允许提前或到期后关闭。 |
| 成功状态 | 200 |
| 请求格式 | HTTPS；无请求体，无需 Content-Type。 |

#### 请求参数

**路径参数**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `election_id` | `ID` | 是 | 目标选举。 |

**查询参数**

无。未声明的查询字段返回 422 VALIDATION_ERROR。

**JSON 请求体**

无。不要发送 JSON（包括空对象）；额外请求体返回 422 VALIDATION_ERROR。

**本接口类型说明：** ID 为匹配 `^[1-9][0-9]*$` 的正十进制字符串，最大 `18446744073709551615`。Timestamp 为带时区、秒精度的 RFC 3339；输入允许 Z / 偏移，输出统一 UTC Z。名称、标题与必填简介不得仅为空白；密码只要求非空且不做 trim。

#### 请求示例

```http
POST /api/v1/elections/1001/close HTTP/1.1
Host: api.example.invalid
Authorization: Bearer <access-token>
```

域名、ID 和凭据均为示例，不代表实际服务测试。

#### 成功响应

**HTTP 200** · Content-Type: application/json。下方完整展开 `Election` 响应；所有字段均出现，仅明确可空字段允许 null。

| 字段 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| `data` | `object` | 否 | 成功数据。 |
| `data.id` | `ID` | 否 | 选举标识。 |
| `data.title` | `string` | 否 | 选举名称，1–200 字符且不得仅为空白。 |
| `data.position_title` | `string` | 否 | 唯一竞选职位，1–100 字符且不得仅为空白。 |
| `data.description` | `string` | 是 | 可选说明，最多 10000 字符。 |
| `data.created_by` | `ID` | 否 | 从已认证 ADMIN 取得创建者，不接受客户端指定。 |
| `data.status` | `string` | 否 | DRAFT、OPEN 或 CLOSED；没有 PUBLISHED 状态。 |
| `data.privacy_mode` | `string` | 否 | v1 仅 FORCED_ANONYMOUS。 |
| `data.starts_at` | `Timestamp` | 否 | 投票开始，必须早于 ends_at。 |
| `data.ends_at` | `Timestamp` | 否 | 投票结束；合法时间窗 starts_at <= server_now <= ends_at，含两端。 |
| `data.results_published_at` | `Timestamp` | 是 | 发布前 null，发布后为服务器确定的发布时间。 |
| `data.created_at` | `Timestamp` | 否 | 选举创建时间。 |
| `data.updated_at` | `Timestamp` | 否 | 选举最后更新时间。 |

**完整成功示例**

```json
{
  "data": {
    "id": "1001",
    "title": "Class Representative Election",
    "position_title": "Class Representative",
    "description": "One seat; one choice per voter.",
    "created_by": "11",
    "status": "CLOSED",
    "privacy_mode": "FORCED_ANONYMOUS",
    "starts_at": "2026-10-02T02:00:00Z",
    "ends_at": "2026-10-02T04:00:00Z",
    "results_published_at": null,
    "created_at": "2026-10-01T01:00:00Z",
    "updated_at": "2026-10-02T04:00:00Z"
  }
}
```

#### 错误响应

| HTTP | error.code | 触发条件 |
| --- | --- | --- |
| 401 | `AUTHENTICATION_REQUIRED` | 身份缺失 / 无效 / 过期 / 账户不再 ACTIVE。 |
| 403 | `PERMISSION_DENIED` | 已认证但角色无权执行操作。 |
| 404 | `ELECTION_NOT_FOUND` | 选举不存在，或详情超出可见范围。 |
| 409 | `INVALID_STATE_TRANSITION` | 不合法或重复 open / close。 |
| 422 | `VALIDATION_ERROR` | JSON 损坏、类型 / 字段 / 路径 / query 不合法、未知字段、空 PATCH。 |
| 500 | `INTERNAL_ERROR` | 非预期内部错误；不得披露 SQL、凭据或堆栈。 |

错误结构：error.code 和 error.message 为必有字符串；可选 error.details 为含字符串 field / reason 的对象数组，禁止回显原始输入。受保护接口返回 401 时附 WWW-Authenticate: Bearer。

客户端按 error.code 分支处理，不依赖 message 文案；错误不得暴露 SQL、堆栈、密码、Token 或原始投票输入。

**示例：HTTP 409**

```json
{
  "error": {
    "code": "INVALID_STATE_TRANSITION",
    "message": "Invalid or repeated open/close."
  }
}
```

#### 业务规则与重试

- ADMIN；无 body / query；仅 OPEN → CLOSED；成功 200 Election。
- 可提前关闭，也可在 ends_at 后关闭以便计票发布。重复 close 返回 `INVALID_STATE_TRANSITION`。
- 对选举行取排他锁，等待在途投票事务后提交 CLOSED，commit 后才响应成功。到期后即使状态仍为 OPEN，也必须停止接受投票。
- 错误：`ELECTION_NOT_FOUND`、`INVALID_STATE_TRANSITION`。

- 重复 open / close 返回 409，先 GET 选举确认状态。重复发布按草案返回原时间，不覆盖。

[返回接口导航](#api-index)

---

<a id="endpoint-9"></a>

### 4.9 候选人列表

根据角色与投票资格查询候选人分页列表。

#### 基本信息

| 项目 | 内容 |
| --- | --- |
| 方法 | `GET` |
| 完整路径 | `/api/v1/elections/{election_id}/candidates` |
| 认证 | 必需：`Authorization: Bearer <access-token>`；账户须持续为 ACTIVE。 |
| 权限 | ADMIN / 合资格 USER |
| 选举状态 | ADMIN 任意状态；USER 仅含边界时间窗内的 OPEN。 |
| 成功状态 | 200 |
| 请求格式 | HTTPS；无请求体，无需 Content-Type。 |

#### 请求参数

**路径参数**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `election_id` | `ID` | 是 | 目标选举。 |

**查询参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `page` | `integer` | 否 | 1 | 正整数字符串，最小 1。 |
| `page_size` | `integer` | 否 | 20 | 正整数字符串，范围 1–100。 |

先按权限过滤再计算总数和分页。超出最后一页返回 data: []，保留真实 total；未知查询字段返回 422。

**JSON 请求体**

无。不要发送 JSON（包括空对象）；额外请求体返回 422 VALIDATION_ERROR。

**本接口类型说明：** ID 为匹配 `^[1-9][0-9]*$` 的正十进制字符串，最大 `18446744073709551615`。Timestamp 为带时区、秒精度的 RFC 3339；输入允许 Z / 偏移，输出统一 UTC Z。名称、标题与必填简介不得仅为空白；密码只要求非空且不做 trim。

#### 请求示例

```http
GET /api/v1/elections/1001/candidates?page=1&page_size=20 HTTP/1.1
Host: api.example.invalid
Authorization: Bearer <access-token>
```

域名、ID 和凭据均为示例，不代表实际服务测试。

#### 成功响应

**HTTP 200** · Content-Type: application/json。下方完整展开 `Candidate[]` 响应；所有字段均出现，仅明确可空字段允许 null。

| 字段 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| `data` | `object[]` | 否 | 成功数据。 |
| `data[].id` | `ID` | 否 | 候选人标识，须结合所属选举校验。 |
| `data[].election_id` | `ID` | 否 | 所属选举。 |
| `data[].name` | `string` | 否 | 1–100 字符，非空白；允许同名。 |
| `data[].position_title` | `string` | 否 | 只读，从 Election.position_title 推导，不重复保存职位。 |
| `data[].description` | `string` | 否 | 必填简介，1–10000 字符且非空白。 |
| `data[].photo_url` | `string` | 是 | 可选 HTTPS URL，最多 500 字符；不提供上传或后端代抓取。 |
| `data[].display_order` | `integer` | 否 | 0–2147483647，默认 0；升序后按候选人数值 id 排序。 |
| `data[].created_at` | `Timestamp` | 否 | 候选人创建时间。 |
| `data[].updated_at` | `Timestamp` | 否 | 候选人最后更新时间。 |
| `meta` | `object` | 否 | 权限过滤后的分页信息。 |
| `meta.page` | `integer` | 否 | 当前页，最小 1。 |
| `meta.page_size` | `integer` | 否 | 每页数量，1–100。 |
| `meta.total` | `integer` | 否 | 可见记录总数，非负；越界页仍返回真实总数。 |

**完整成功示例**

```json
{
  "data": [
    {
      "id": "101",
      "election_id": "1001",
      "name": "Candidate A",
      "description": "A fictional introduction.",
      "photo_url": null,
      "display_order": 0,
      "position_title": "Class Representative",
      "created_at": "2026-10-01T01:10:00Z",
      "updated_at": "2026-10-01T01:10:00Z"
    },
    {
      "id": "102",
      "election_id": "1001",
      "name": "Candidate B",
      "description": "A fictional introduction.",
      "photo_url": null,
      "display_order": 1,
      "position_title": "Class Representative",
      "created_at": "2026-10-01T01:10:00Z",
      "updated_at": "2026-10-01T01:10:00Z"
    }
  ],
  "meta": {
    "page": 1,
    "page_size": 20,
    "total": 2
  }
}
```

#### 错误响应

| HTTP | error.code | 触发条件 |
| --- | --- | --- |
| 401 | `AUTHENTICATION_REQUIRED` | 身份缺失 / 无效 / 过期 / 账户不再 ACTIVE。 |
| 403 | `PERMISSION_DENIED` | 已认证但角色无权执行操作。 |
| 403 | `NOT_ELIGIBLE` | 不在名册却查看选票 / 候选人或投票。 |
| 404 | `ELECTION_NOT_FOUND` | 选举不存在，或详情超出可见范围。 |
| 409 | `ELECTION_NOT_OPEN` | 查看选票 / 投票要求 OPEN。 |
| 409 | `VOTING_NOT_STARTED` | 服务器时间早于 starts_at。 |
| 409 | `VOTING_ENDED` | 服务器时间晚于 ends_at。 |
| 422 | `VALIDATION_ERROR` | JSON 损坏、类型 / 字段 / 路径 / query 不合法、未知字段、空 PATCH。 |
| 500 | `INTERNAL_ERROR` | 非预期内部错误；不得披露 SQL、凭据或堆栈。 |

错误结构：error.code 和 error.message 为必有字符串；可选 error.details 为含字符串 field / reason 的对象数组，禁止回显原始输入。受保护接口返回 401 时附 WWW-Authenticate: Bearer。

客户端按 error.code 分支处理，不依赖 message 文案；错误不得暴露 SQL、堆栈、密码、Token 或原始投票输入。

**示例：HTTP 403**

```json
{
  "error": {
    "code": "NOT_ELIGIBLE",
    "message": "Non-member attempts ballot/candidate viewing or voting."
  }
}
```

#### 业务规则与重试

- Query：page、page_size；无 body；成功 200 Candidate[] + meta。按 display_order、数值 id 升序。
- ADMIN 任意状态可读；USER 须在名册内、选举 OPEN 且处于时间窗，与选票入口保持一致，不能绕过 FR-07 / FR-08。
- 已投票但合资格的 USER 可读，不返回其先前选择。关闭后普通用户通过已发布结果查看结果。
- 错误：`ELECTION_NOT_FOUND`、`NOT_ELIGIBLE`、`ELECTION_NOT_OPEN`、`VOTING_NOT_STARTED`、`VOTING_ENDED`。

只读操作：重试 / 轮询必须有次数及超时上限；读取不预留额度、不发布结果。

[返回接口导航](#api-index)

---

<a id="endpoint-10"></a>

### 4.10 添加候选人

向草稿选举添加候选人，继承该场唯一竞选职位。

#### 基本信息

| 项目 | 内容 |
| --- | --- |
| 方法 | `POST` |
| 完整路径 | `/api/v1/elections/{election_id}/candidates` |
| 认证 | 必需：`Authorization: Bearer <access-token>`；账户须持续为 ACTIVE。 |
| 权限 | ADMIN |
| 选举状态 | 仅 DRAFT。 |
| 成功状态 | 201 |
| 请求格式 | HTTPS；JSON 正文，Content-Type: application/json。 |

#### 请求参数

**路径参数**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `election_id` | `ID` | 是 | 目标选举。 |

**查询参数**

无。未声明的查询字段返回 422 VALIDATION_ERROR。

**JSON 请求体** — `CandidateCreate`

| 字段 | 类型 | 必填 | 可空 | 默认值 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `name` | `string` | 是 | 否 | — | 1–100 字符，非空白；允许同名。 |
| `description` | `string` | 是 | 否 | — | 必填简介，1–10000 字符且非空白。 |
| `photo_url` | `string` | 否 | 是 | `null` | 可选 HTTPS URL，最多 500 字符；不提供上传或后端代抓取。 |
| `display_order` | `integer` | 否 | 否 | `0` | 0–2147483647，默认 0；升序后按候选人数值 id 排序。 |

仅表内字段可写。未知 / 只读字段或错误 JSON 类型返回 422 VALIDATION_ERROR；JSON 整数不接受布尔、小数或字符串冒充。

**本接口类型说明：** ID 为匹配 `^[1-9][0-9]*$` 的正十进制字符串，最大 `18446744073709551615`。Timestamp 为带时区、秒精度的 RFC 3339；输入允许 Z / 偏移，输出统一 UTC Z。名称、标题与必填简介不得仅为空白；密码只要求非空且不做 trim。

#### 请求示例

```http
POST /api/v1/elections/1001/candidates HTTP/1.1
Host: api.example.invalid
Authorization: Bearer <access-token>
Content-Type: application/json

{
  "name": "Candidate A",
  "description": "A fictional introduction.",
  "photo_url": null,
  "display_order": 0
}
```

域名、ID 和凭据均为示例，不代表实际服务测试。

#### 成功响应

**HTTP 201** · Content-Type: application/json。下方完整展开 `Candidate` 响应；所有字段均出现，仅明确可空字段允许 null。

| 字段 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| `data` | `object` | 否 | 成功数据。 |
| `data.id` | `ID` | 否 | 候选人标识，须结合所属选举校验。 |
| `data.election_id` | `ID` | 否 | 所属选举。 |
| `data.name` | `string` | 否 | 1–100 字符，非空白；允许同名。 |
| `data.position_title` | `string` | 否 | 只读，从 Election.position_title 推导，不重复保存职位。 |
| `data.description` | `string` | 否 | 必填简介，1–10000 字符且非空白。 |
| `data.photo_url` | `string` | 是 | 可选 HTTPS URL，最多 500 字符；不提供上传或后端代抓取。 |
| `data.display_order` | `integer` | 否 | 0–2147483647，默认 0；升序后按候选人数值 id 排序。 |
| `data.created_at` | `Timestamp` | 否 | 候选人创建时间。 |
| `data.updated_at` | `Timestamp` | 否 | 候选人最后更新时间。 |

**完整成功示例**

```json
{
  "data": {
    "id": "101",
    "election_id": "1001",
    "name": "Candidate A",
    "description": "A fictional introduction.",
    "photo_url": null,
    "display_order": 0,
    "position_title": "Class Representative",
    "created_at": "2026-10-01T01:10:00Z",
    "updated_at": "2026-10-01T01:10:00Z"
  }
}
```

#### 错误响应

| HTTP | error.code | 触发条件 |
| --- | --- | --- |
| 401 | `AUTHENTICATION_REQUIRED` | 身份缺失 / 无效 / 过期 / 账户不再 ACTIVE。 |
| 403 | `PERMISSION_DENIED` | 已认证但角色无权执行操作。 |
| 404 | `ELECTION_NOT_FOUND` | 选举不存在，或详情超出可见范围。 |
| 409 | `ELECTION_NOT_EDITABLE` | 修改要求 DRAFT。 |
| 422 | `VALIDATION_ERROR` | JSON 损坏、类型 / 字段 / 路径 / query 不合法、未知字段、空 PATCH。 |
| 500 | `INTERNAL_ERROR` | 非预期内部错误；不得披露 SQL、凭据或堆栈。 |

错误结构：error.code 和 error.message 为必有字符串；可选 error.details 为含字符串 field / reason 的对象数组，禁止回显原始输入。受保护接口返回 401 时附 WWW-Authenticate: Bearer。

客户端按 error.code 分支处理，不依赖 message 文案；错误不得暴露 SQL、堆栈、密码、Token 或原始投票输入。

**示例：HTTP 409**

```json
{
  "error": {
    "code": "ELECTION_NOT_EDITABLE",
    "message": "Mutation requires DRAFT."
  }
}
```

#### 业务规则与重试

- ADMIN；仅 DRAFT；请求 CandidateCreate；成功 201 Candidate。
- election_id 来自路径，position_title 继承选举；均不得在 body 指定。不要求候选人具有账户，不按姓名去重。
- 错误：`ELECTION_NOT_FOUND`、`ELECTION_NOT_EDITABLE`。

- 创建选举 / 候选人不承诺严格幂等，超时先查询核对；名册重复新增 409。重复删除可 404，但不产生第二次删除效果。

[返回接口导航](#api-index)

---

<a id="endpoint-11"></a>

### 4.11 修改候选人

修改本场草稿选举候选人的指定字段。

#### 基本信息

| 项目 | 内容 |
| --- | --- |
| 方法 | `PATCH` |
| 完整路径 | `/api/v1/elections/{election_id}/candidates/{candidate_id}` |
| 认证 | 必需：`Authorization: Bearer <access-token>`；账户须持续为 ACTIVE。 |
| 权限 | ADMIN |
| 选举状态 | 仅 DRAFT。 |
| 成功状态 | 200 |
| 请求格式 | HTTPS；JSON 正文，Content-Type: application/json。 |

#### 请求参数

**路径参数**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `election_id` | `ID` | 是 | 目标选举。 |
| `candidate_id` | `ID` | 是 | 必须属于本场选举的候选人。 |

**查询参数**

无。未声明的查询字段返回 422 VALIDATION_ERROR。

**JSON 请求体** — `CandidatePatch`

| 字段 | 类型 | 必填 | 可空 | 默认值 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `name` | `string` | 否 | 否 | `保持原值` | 1–100 字符，非空白；允许同名。 |
| `description` | `string` | 否 | 否 | `保持原值` | 必填简介，1–10000 字符且非空白。 |
| `photo_url` | `string` | 否 | 是 | `保持原值` | 可选 HTTPS URL，最多 500 字符；不提供上传或后端代抓取。 |
| `display_order` | `integer` | 否 | 否 | `保持原值` | 0–2147483647，默认 0；升序后按候选人数值 id 排序。 |

至少提交一个表内字段。缺省字段保持原值，只有可空字段可通过 null 清空；空对象返回 422 VALIDATION_ERROR。

仅表内字段可写。未知 / 只读字段或错误 JSON 类型返回 422 VALIDATION_ERROR；JSON 整数不接受布尔、小数或字符串冒充。

**本接口类型说明：** ID 为匹配 `^[1-9][0-9]*$` 的正十进制字符串，最大 `18446744073709551615`。Timestamp 为带时区、秒精度的 RFC 3339；输入允许 Z / 偏移，输出统一 UTC Z。名称、标题与必填简介不得仅为空白；密码只要求非空且不做 trim。

#### 请求示例

```http
PATCH /api/v1/elections/1001/candidates/101 HTTP/1.1
Host: api.example.invalid
Authorization: Bearer <access-token>
Content-Type: application/json

{
  "description": "Updated candidate introduction."
}
```

域名、ID 和凭据均为示例，不代表实际服务测试。

#### 成功响应

**HTTP 200** · Content-Type: application/json。下方完整展开 `Candidate` 响应；所有字段均出现，仅明确可空字段允许 null。

| 字段 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| `data` | `object` | 否 | 成功数据。 |
| `data.id` | `ID` | 否 | 候选人标识，须结合所属选举校验。 |
| `data.election_id` | `ID` | 否 | 所属选举。 |
| `data.name` | `string` | 否 | 1–100 字符，非空白；允许同名。 |
| `data.position_title` | `string` | 否 | 只读，从 Election.position_title 推导，不重复保存职位。 |
| `data.description` | `string` | 否 | 必填简介，1–10000 字符且非空白。 |
| `data.photo_url` | `string` | 是 | 可选 HTTPS URL，最多 500 字符；不提供上传或后端代抓取。 |
| `data.display_order` | `integer` | 否 | 0–2147483647，默认 0；升序后按候选人数值 id 排序。 |
| `data.created_at` | `Timestamp` | 否 | 候选人创建时间。 |
| `data.updated_at` | `Timestamp` | 否 | 候选人最后更新时间。 |

**完整成功示例**

```json
{
  "data": {
    "id": "101",
    "election_id": "1001",
    "name": "Candidate A",
    "description": "Updated candidate introduction.",
    "photo_url": null,
    "display_order": 0,
    "position_title": "Class Representative",
    "created_at": "2026-10-01T01:10:00Z",
    "updated_at": "2026-10-01T01:15:00Z"
  }
}
```

#### 错误响应

| HTTP | error.code | 触发条件 |
| --- | --- | --- |
| 401 | `AUTHENTICATION_REQUIRED` | 身份缺失 / 无效 / 过期 / 账户不再 ACTIVE。 |
| 403 | `PERMISSION_DENIED` | 已认证但角色无权执行操作。 |
| 404 | `ELECTION_NOT_FOUND` | 选举不存在，或详情超出可见范围。 |
| 404 | `CANDIDATE_NOT_FOUND` | 管理目标候选人不存在或跨选举。 |
| 409 | `ELECTION_NOT_EDITABLE` | 修改要求 DRAFT。 |
| 422 | `VALIDATION_ERROR` | JSON 损坏、类型 / 字段 / 路径 / query 不合法、未知字段、空 PATCH。 |
| 500 | `INTERNAL_ERROR` | 非预期内部错误；不得披露 SQL、凭据或堆栈。 |

错误结构：error.code 和 error.message 为必有字符串；可选 error.details 为含字符串 field / reason 的对象数组，禁止回显原始输入。受保护接口返回 401 时附 WWW-Authenticate: Bearer。

客户端按 error.code 分支处理，不依赖 message 文案；错误不得暴露 SQL、堆栈、密码、Token 或原始投票输入。

**示例：HTTP 404**

```json
{
  "error": {
    "code": "CANDIDATE_NOT_FOUND",
    "message": "Candidate-management target absent or cross-election."
  }
}
```

#### 业务规则与重试

- ADMIN；仅 DRAFT；请求 CandidatePatch；成功 200 Candidate。
- 校验 candidate_id 属于路径中的选举，不能只按全局 ID 更新；不得转移 election_id 或单独改职位。
- 错误：`ELECTION_NOT_FOUND`、`CANDIDATE_NOT_FOUND`、`ELECTION_NOT_EDITABLE`。

[返回接口导航](#api-index)

---

<a id="endpoint-12"></a>

### 4.12 删除草稿候选人

删除草稿选举中未被选票引用的候选人。

#### 基本信息

| 项目 | 内容 |
| --- | --- |
| 方法 | `DELETE` |
| 完整路径 | `/api/v1/elections/{election_id}/candidates/{candidate_id}` |
| 认证 | 必需：`Authorization: Bearer <access-token>`；账户须持续为 ACTIVE。 |
| 权限 | ADMIN |
| 选举状态 | 仅 DRAFT。 |
| 成功状态 | 204 |
| 请求格式 | HTTPS；无请求体，无需 Content-Type。 |

#### 请求参数

**路径参数**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `election_id` | `ID` | 是 | 目标选举。 |
| `candidate_id` | `ID` | 是 | 必须属于本场选举的候选人。 |

**查询参数**

无。未声明的查询字段返回 422 VALIDATION_ERROR。

**JSON 请求体**

无。不要发送 JSON（包括空对象）；额外请求体返回 422 VALIDATION_ERROR。

**本接口类型说明：** ID 为匹配 `^[1-9][0-9]*$` 的正十进制字符串，最大 `18446744073709551615`。Timestamp 为带时区、秒精度的 RFC 3339；输入允许 Z / 偏移，输出统一 UTC Z。名称、标题与必填简介不得仅为空白；密码只要求非空且不做 trim。

#### 请求示例

```http
DELETE /api/v1/elections/1001/candidates/101 HTTP/1.1
Host: api.example.invalid
Authorization: Bearer <access-token>
```

域名、ID 和凭据均为示例，不代表实际服务测试。

#### 成功响应

**204 No Content。** 无字段、无 JSON，不得返回 data 包装。

```http
HTTP/1.1 204 No Content
```

#### 错误响应

| HTTP | error.code | 触发条件 |
| --- | --- | --- |
| 401 | `AUTHENTICATION_REQUIRED` | 身份缺失 / 无效 / 过期 / 账户不再 ACTIVE。 |
| 403 | `PERMISSION_DENIED` | 已认证但角色无权执行操作。 |
| 404 | `ELECTION_NOT_FOUND` | 选举不存在，或详情超出可见范围。 |
| 404 | `CANDIDATE_NOT_FOUND` | 管理目标候选人不存在或跨选举。 |
| 409 | `ELECTION_NOT_EDITABLE` | 修改要求 DRAFT。 |
| 409 | `RESOURCE_CONFLICT` | 存在引用或不可变记录，不能安全修改。 |
| 422 | `VALIDATION_ERROR` | JSON 损坏、类型 / 字段 / 路径 / query 不合法、未知字段、空 PATCH。 |
| 500 | `INTERNAL_ERROR` | 非预期内部错误；不得披露 SQL、凭据或堆栈。 |

错误结构：error.code 和 error.message 为必有字符串；可选 error.details 为含字符串 field / reason 的对象数组，禁止回显原始输入。受保护接口返回 401 时附 WWW-Authenticate: Bearer。

客户端按 error.code 分支处理，不依赖 message 文案；错误不得暴露 SQL、堆栈、密码、Token 或原始投票输入。

**示例：HTTP 409**

```json
{
  "error": {
    "code": "RESOURCE_CONFLICT",
    "message": "Existing reference/immutable record prevents safe mutation."
  }
}
```

#### 业务规则与重试

- ADMIN；仅 DRAFT；无 body / query；成功 204 无正文。
- 候选人须属于本场且未被选票引用。禁止级联删除选票；已有引用返回 `RESOURCE_CONFLICT`。
- 不存在、跨选举或重复删除返回 `CANDIDATE_NOT_FOUND`；另可能返回 `ELECTION_NOT_FOUND`、`ELECTION_NOT_EDITABLE`。

- 创建选举 / 候选人不承诺严格幂等，超时先查询核对；名册重复新增 409。重复删除可 404，但不产生第二次删除效果。

[返回接口导航](#api-index)

---

<a id="endpoint-13"></a>

### 4.13 名册列表

供管理员查看名册元数据，不暴露个人投票历史。

#### 基本信息

| 项目 | 内容 |
| --- | --- |
| 方法 | `GET` |
| 完整路径 | `/api/v1/elections/{election_id}/voters` |
| 认证 | 必需：`Authorization: Bearer <access-token>`；账户须持续为 ACTIVE。 |
| 权限 | ADMIN |
| 选举状态 | 任意状态。 |
| 成功状态 | 200 |
| 请求格式 | HTTPS；无请求体，无需 Content-Type。 |

#### 请求参数

**路径参数**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `election_id` | `ID` | 是 | 目标选举。 |

**查询参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `page` | `integer` | 否 | 1 | 正整数字符串，最小 1。 |
| `page_size` | `integer` | 否 | 20 | 正整数字符串，范围 1–100。 |

先按权限过滤再计算总数和分页。超出最后一页返回 data: []，保留真实 total；未知查询字段返回 422。

**JSON 请求体**

无。不要发送 JSON（包括空对象）；额外请求体返回 422 VALIDATION_ERROR。

**本接口类型说明：** ID 为匹配 `^[1-9][0-9]*$` 的正十进制字符串，最大 `18446744073709551615`。Timestamp 为带时区、秒精度的 RFC 3339；输入允许 Z / 偏移，输出统一 UTC Z。名称、标题与必填简介不得仅为空白；密码只要求非空且不做 trim。

#### 请求示例

```http
GET /api/v1/elections/1001/voters?page=1&page_size=20 HTTP/1.1
Host: api.example.invalid
Authorization: Bearer <access-token>
```

域名、ID 和凭据均为示例，不代表实际服务测试。

#### 成功响应

**HTTP 200** · Content-Type: application/json。下方完整展开 `Voter[]` 响应；所有字段均出现，仅明确可空字段允许 null。

| 字段 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| `data` | `object[]` | 否 | 成功数据。 |
| `data[].election_id` | `ID` | 否 | 名册复合键中的选举标识。 |
| `data[].user_id` | `ID` | 否 | 名册复合键中的账户标识；没有独立行 ID。 |
| `data[].display_name` | `string` | 否 | 来自已有账户的显示名，1–100 字符。 |
| `data[].vote_quota` | `integer` | 否 | v1 固定为 1。 |
| `data[].created_at` | `Timestamp` | 否 | 名册创建时间，不是投票时间。 |
| `data[].updated_at` | `Timestamp` | 否 | 名册更新时间，不是投票时间。 |
| `meta` | `object` | 否 | 权限过滤后的分页信息。 |
| `meta.page` | `integer` | 否 | 当前页，最小 1。 |
| `meta.page_size` | `integer` | 否 | 每页数量，1–100。 |
| `meta.total` | `integer` | 否 | 可见记录总数，非负；越界页仍返回真实总数。 |

**完整成功示例**

```json
{
  "data": [
    {
      "election_id": "1001",
      "user_id": "21",
      "display_name": "Demo Voter",
      "vote_quota": 1,
      "created_at": "2026-10-01T01:00:00Z",
      "updated_at": "2026-10-01T01:00:00Z"
    },
    {
      "election_id": "1001",
      "user_id": "22",
      "display_name": "Demo Voter 2",
      "vote_quota": 1,
      "created_at": "2026-10-01T01:00:00Z",
      "updated_at": "2026-10-01T01:00:00Z"
    }
  ],
  "meta": {
    "page": 1,
    "page_size": 20,
    "total": 2
  }
}
```

#### 错误响应

| HTTP | error.code | 触发条件 |
| --- | --- | --- |
| 401 | `AUTHENTICATION_REQUIRED` | 身份缺失 / 无效 / 过期 / 账户不再 ACTIVE。 |
| 403 | `PERMISSION_DENIED` | 已认证但角色无权执行操作。 |
| 404 | `ELECTION_NOT_FOUND` | 选举不存在，或详情超出可见范围。 |
| 422 | `VALIDATION_ERROR` | JSON 损坏、类型 / 字段 / 路径 / query 不合法、未知字段、空 PATCH。 |
| 500 | `INTERNAL_ERROR` | 非预期内部错误；不得披露 SQL、凭据或堆栈。 |

错误结构：error.code 和 error.message 为必有字符串；可选 error.details 为含字符串 field / reason 的对象数组，禁止回显原始输入。受保护接口返回 401 时附 WWW-Authenticate: Bearer。

客户端按 error.code 分支处理，不依赖 message 文案；错误不得暴露 SQL、堆栈、密码、Token 或原始投票输入。

**示例：HTTP 403**

```json
{
  "error": {
    "code": "PERMISSION_DENIED",
    "message": "Authenticated caller has the wrong role."
  }
}
```

#### 业务规则与重试

- ADMIN；任意选举状态；query 为 page、page_size；无 body；成功 200 Voter[] + meta。
- 按数值 user_id 升序，只返回名册元数据，不返回 ballot ID、投票内容、投票时间或个人投票历史。
- USER 无权列出其他选民；错误：`ELECTION_NOT_FOUND`、`PERMISSION_DENIED`。

只读操作：重试 / 轮询必须有次数及超时上限；读取不预留额度、不发布结果。

[返回接口导航](#api-index)

---

<a id="endpoint-14"></a>

### 4.14 添加选民

将一个已有有效选民账户加入草稿选举名册。

#### 基本信息

| 项目 | 内容 |
| --- | --- |
| 方法 | `POST` |
| 完整路径 | `/api/v1/elections/{election_id}/voters` |
| 认证 | 必需：`Authorization: Bearer <access-token>`；账户须持续为 ACTIVE。 |
| 权限 | ADMIN |
| 选举状态 | 仅 DRAFT。 |
| 成功状态 | 201 |
| 请求格式 | HTTPS；JSON 正文，Content-Type: application/json。 |

#### 请求参数

**路径参数**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `election_id` | `ID` | 是 | 目标选举。 |

**查询参数**

无。未声明的查询字段返回 422 VALIDATION_ERROR。

**JSON 请求体** — `VoterCreate`

| 字段 | 类型 | 必填 | 可空 | 默认值 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `user_id` | `ID` | 是 | 否 | — | 待添加的已有 ACTIVE USER 账户，不是调用者身份。 |
| `vote_quota` | `integer` | 否 | 否 | `1` | v1 固定为 1。 |

仅表内字段可写。未知 / 只读字段或错误 JSON 类型返回 422 VALIDATION_ERROR；JSON 整数不接受布尔、小数或字符串冒充。

**本接口类型说明：** ID 为匹配 `^[1-9][0-9]*$` 的正十进制字符串，最大 `18446744073709551615`。Timestamp 为带时区、秒精度的 RFC 3339；输入允许 Z / 偏移，输出统一 UTC Z。名称、标题与必填简介不得仅为空白；密码只要求非空且不做 trim。

#### 请求示例

```http
POST /api/v1/elections/1001/voters HTTP/1.1
Host: api.example.invalid
Authorization: Bearer <access-token>
Content-Type: application/json

{
  "user_id": "23",
  "vote_quota": 1
}
```

域名、ID 和凭据均为示例，不代表实际服务测试。

#### 成功响应

**HTTP 201** · Content-Type: application/json。下方完整展开 `Voter` 响应；所有字段均出现，仅明确可空字段允许 null。

| 字段 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| `data` | `object` | 否 | 成功数据。 |
| `data.election_id` | `ID` | 否 | 名册复合键中的选举标识。 |
| `data.user_id` | `ID` | 否 | 名册复合键中的账户标识；没有独立行 ID。 |
| `data.display_name` | `string` | 否 | 来自已有账户的显示名，1–100 字符。 |
| `data.vote_quota` | `integer` | 否 | v1 固定为 1。 |
| `data.created_at` | `Timestamp` | 否 | 名册创建时间，不是投票时间。 |
| `data.updated_at` | `Timestamp` | 否 | 名册更新时间，不是投票时间。 |

**完整成功示例**

```json
{
  "data": {
    "election_id": "1001",
    "user_id": "23",
    "display_name": "Demo Voter 3",
    "vote_quota": 1,
    "created_at": "2026-10-01T01:20:00Z",
    "updated_at": "2026-10-01T01:20:00Z"
  }
}
```

#### 错误响应

| HTTP | error.code | 触发条件 |
| --- | --- | --- |
| 401 | `AUTHENTICATION_REQUIRED` | 身份缺失 / 无效 / 过期 / 账户不再 ACTIVE。 |
| 403 | `PERMISSION_DENIED` | 已认证但角色无权执行操作。 |
| 404 | `ELECTION_NOT_FOUND` | 选举不存在，或详情超出可见范围。 |
| 404 | `USER_NOT_FOUND` | 管理员指定的名册账户不存在。 |
| 409 | `ELECTION_NOT_EDITABLE` | 修改要求 DRAFT。 |
| 409 | `VOTER_ALREADY_EXISTS` | 资格重复；不得新增第二行。 |
| 422 | `VALIDATION_ERROR` | JSON 损坏、类型 / 字段 / 路径 / query 不合法、未知字段、空 PATCH。 |
| 422 | `INVALID_VOTER` | 已有账户非 ACTIVE 或非 USER。 |
| 500 | `INTERNAL_ERROR` | 非预期内部错误；不得披露 SQL、凭据或堆栈。 |

错误结构：error.code 和 error.message 为必有字符串；可选 error.details 为含字符串 field / reason 的对象数组，禁止回显原始输入。受保护接口返回 401 时附 WWW-Authenticate: Bearer。

客户端按 error.code 分支处理，不依赖 message 文案；错误不得暴露 SQL、堆栈、密码、Token 或原始投票输入。

**示例：HTTP 409**

```json
{
  "error": {
    "code": "VOTER_ALREADY_EXISTS",
    "message": "Duplicate membership; do not create another row."
  }
}
```

#### 业务规则与重试

- ADMIN；仅 DRAFT；请求 VoterCreate；成功 201 Voter。
- 目标须为已有 ACTIVE USER。按 (election_id, user_id) 去重；重复时 `409 VOTER_ALREADY_EXISTS` 且不新增行。
- 不提供批量导入、额度编辑或账户创建；非 1 额度返回 `422 VALIDATION_ERROR`。
- 其他错误：`ELECTION_NOT_FOUND`、`USER_NOT_FOUND`、`INVALID_VOTER`、`ELECTION_NOT_EDITABLE`。

- 创建选举 / 候选人不承诺严格幂等，超时先查询核对；名册重复新增 409。重复删除可 404，但不产生第二次删除效果。

[返回接口导航](#api-index)

---

<a id="endpoint-15"></a>

### 4.15 移除选民

移除草稿选举中的一条资格记录，不删除用户账户。

#### 基本信息

| 项目 | 内容 |
| --- | --- |
| 方法 | `DELETE` |
| 完整路径 | `/api/v1/elections/{election_id}/voters/{user_id}` |
| 认证 | 必需：`Authorization: Bearer <access-token>`；账户须持续为 ACTIVE。 |
| 权限 | ADMIN |
| 选举状态 | 仅 DRAFT。 |
| 成功状态 | 204 |
| 请求格式 | HTTPS；无请求体，无需 Content-Type。 |

#### 请求参数

**路径参数**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `election_id` | `ID` | 是 | 目标选举。 |
| `user_id` | `ID` | 是 | 待移除的名册成员，不是操作者身份。 |

**查询参数**

无。未声明的查询字段返回 422 VALIDATION_ERROR。

**JSON 请求体**

无。不要发送 JSON（包括空对象）；额外请求体返回 422 VALIDATION_ERROR。

**本接口类型说明：** ID 为匹配 `^[1-9][0-9]*$` 的正十进制字符串，最大 `18446744073709551615`。Timestamp 为带时区、秒精度的 RFC 3339；输入允许 Z / 偏移，输出统一 UTC Z。名称、标题与必填简介不得仅为空白；密码只要求非空且不做 trim。

#### 请求示例

```http
DELETE /api/v1/elections/1001/voters/23 HTTP/1.1
Host: api.example.invalid
Authorization: Bearer <access-token>
```

域名、ID 和凭据均为示例，不代表实际服务测试。

#### 成功响应

**204 No Content。** 无字段、无 JSON，不得返回 data 包装。

```http
HTTP/1.1 204 No Content
```

#### 错误响应

| HTTP | error.code | 触发条件 |
| --- | --- | --- |
| 401 | `AUTHENTICATION_REQUIRED` | 身份缺失 / 无效 / 过期 / 账户不再 ACTIVE。 |
| 403 | `PERMISSION_DENIED` | 已认证但角色无权执行操作。 |
| 404 | `ELECTION_NOT_FOUND` | 选举不存在，或详情超出可见范围。 |
| 404 | `VOTER_NOT_FOUND` | 目标名册资格不存在。 |
| 409 | `ELECTION_NOT_EDITABLE` | 修改要求 DRAFT。 |
| 409 | `RESOURCE_CONFLICT` | 存在引用或不可变记录，不能安全修改。 |
| 422 | `VALIDATION_ERROR` | JSON 损坏、类型 / 字段 / 路径 / query 不合法、未知字段、空 PATCH。 |
| 500 | `INTERNAL_ERROR` | 非预期内部错误；不得披露 SQL、凭据或堆栈。 |

错误结构：error.code 和 error.message 为必有字符串；可选 error.details 为含字符串 field / reason 的对象数组，禁止回显原始输入。受保护接口返回 401 时附 WWW-Authenticate: Bearer。

客户端按 error.code 分支处理，不依赖 message 文案；错误不得暴露 SQL、堆栈、密码、Token 或原始投票输入。

**示例：HTTP 404**

```json
{
  "error": {
    "code": "VOTER_NOT_FOUND",
    "message": "Target membership does not exist."
  }
}
```

#### 业务规则与重试

- ADMIN；仅 DRAFT；无 body / query；成功 204 无正文。
- 只删除目标资格，不删除账户或参与记录；存在参与记录时 `RESOURCE_CONFLICT`。DRAFT 可移除最后一人，但之后 open 会因未就绪被拒。
- 不存在或重复删除返回 `VOTER_NOT_FOUND`；另可能返回 `ELECTION_NOT_FOUND`、`ELECTION_NOT_EDITABLE`。

- 创建选举 / 候选人不承诺严格幂等，超时先查询核对；名册重复新增 409。重复删除可 404，但不产生第二次删除效果。

[返回接口导航](#api-index)

---

<a id="endpoint-16"></a>

### 4.16 获取选票视图

一次返回展示当前选民投票页面所需的信息。

#### 基本信息

| 项目 | 内容 |
| --- | --- |
| 方法 | `GET` |
| 完整路径 | `/api/v1/elections/{election_id}/ballot` |
| 认证 | 必需：`Authorization: Bearer <access-token>`；账户须持续为 ACTIVE。 |
| 权限 | 合资格 USER |
| 选举状态 | OPEN；starts_at <= server_now <= ends_at。 |
| 成功状态 | 200 |
| 请求格式 | HTTPS；无请求体，无需 Content-Type。 |

#### 请求参数

**路径参数**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `election_id` | `ID` | 是 | 目标选举。 |

**查询参数**

无。未声明的查询字段返回 422 VALIDATION_ERROR。

**JSON 请求体**

无。不要发送 JSON（包括空对象）；额外请求体返回 422 VALIDATION_ERROR。

**本接口类型说明：** ID 为匹配 `^[1-9][0-9]*$` 的正十进制字符串，最大 `18446744073709551615`。Timestamp 为带时区、秒精度的 RFC 3339；输入允许 Z / 偏移，输出统一 UTC Z。名称、标题与必填简介不得仅为空白；密码只要求非空且不做 trim。

#### 请求示例

```http
GET /api/v1/elections/1001/ballot HTTP/1.1
Host: api.example.invalid
Authorization: Bearer <access-token>
```

域名、ID 和凭据均为示例，不代表实际服务测试。

#### 成功响应

**HTTP 200** · Content-Type: application/json。下方完整展开 `BallotView` 响应；所有字段均出现，仅明确可空字段允许 null。

`Cache-Control: no-store`

| 字段 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| `data` | `object` | 否 | 成功数据。 |
| `data.election` | `object` | 否 | 当前选举，status 必须为 OPEN。 |
| `data.election.id` | `ID` | 否 | 选举标识。 |
| `data.election.title` | `string` | 否 | 选举名称，1–200 字符且不得仅为空白。 |
| `data.election.position_title` | `string` | 否 | 唯一竞选职位，1–100 字符且不得仅为空白。 |
| `data.election.description` | `string` | 是 | 可选说明，最多 10000 字符。 |
| `data.election.created_by` | `ID` | 否 | 从已认证 ADMIN 取得创建者，不接受客户端指定。 |
| `data.election.status` | `string` | 否 | DRAFT、OPEN 或 CLOSED；没有 PUBLISHED 状态。 |
| `data.election.privacy_mode` | `string` | 否 | v1 仅 FORCED_ANONYMOUS。 |
| `data.election.starts_at` | `Timestamp` | 否 | 投票开始，必须早于 ends_at。 |
| `data.election.ends_at` | `Timestamp` | 否 | 投票结束；合法时间窗 starts_at <= server_now <= ends_at，含两端。 |
| `data.election.results_published_at` | `Timestamp` | 是 | 发布前 null，发布后为服务器确定的发布时间。 |
| `data.election.created_at` | `Timestamp` | 否 | 选举创建时间。 |
| `data.election.updated_at` | `Timestamp` | 否 | 选举最后更新时间。 |
| `data.candidates` | `object[]` | 否 | 全部候选人，按 display_order、数值 id 排序；不分页。 |
| `data.candidates[].id` | `ID` | 否 | 候选人标识，须结合所属选举校验。 |
| `data.candidates[].election_id` | `ID` | 否 | 所属选举。 |
| `data.candidates[].name` | `string` | 否 | 1–100 字符，非空白；允许同名。 |
| `data.candidates[].position_title` | `string` | 否 | 只读，从 Election.position_title 推导，不重复保存职位。 |
| `data.candidates[].description` | `string` | 否 | 必填简介，1–10000 字符且非空白。 |
| `data.candidates[].photo_url` | `string` | 是 | 可选 HTTPS URL，最多 500 字符；不提供上传或后端代抓取。 |
| `data.candidates[].display_order` | `integer` | 否 | 0–2147483647，默认 0；升序后按候选人数值 id 排序。 |
| `data.candidates[].created_at` | `Timestamp` | 否 | 候选人创建时间。 |
| `data.candidates[].updated_at` | `Timestamp` | 否 | 候选人最后更新时间。 |
| `data.participation` | `object` | 否 | 仅调用者状态，不含已存选票或先前选择。 |
| `data.participation.election_id` | `ID` | 否 | 被查询的选举；仅当前调用者参与状态。 |
| `data.participation.eligible` | `boolean` | 否 | 当前 ACTIVE USER 是否在名册内；不代表当前开放投票。 |
| `data.participation.vote_quota` | `integer` | 否 | 名册成员为 1，否则为 0。 |
| `data.participation.used_votes` | `integer` | 否 | 从本人参与记录计算的 0 或 1，不查选票选择；非成员为 0。 |
| `data.participation.remaining_votes` | `integer` | 否 | vote_quota - used_votes，取 0 或 1；非成员为 0。 |

**完整成功示例**

```json
{
  "data": {
    "election": {
      "id": "1001",
      "title": "Class Representative Election",
      "position_title": "Class Representative",
      "description": "One seat; one choice per voter.",
      "created_by": "11",
      "status": "OPEN",
      "privacy_mode": "FORCED_ANONYMOUS",
      "starts_at": "2026-10-02T02:00:00Z",
      "ends_at": "2026-10-02T04:00:00Z",
      "results_published_at": null,
      "created_at": "2026-10-01T01:00:00Z",
      "updated_at": "2026-10-02T02:00:00Z"
    },
    "candidates": [
      {
        "id": "101",
        "election_id": "1001",
        "name": "Candidate A",
        "description": "A fictional introduction.",
        "photo_url": null,
        "display_order": 0,
        "position_title": "Class Representative",
        "created_at": "2026-10-01T01:10:00Z",
        "updated_at": "2026-10-01T01:10:00Z"
      },
      {
        "id": "102",
        "election_id": "1001",
        "name": "Candidate B",
        "description": "A fictional introduction.",
        "photo_url": null,
        "display_order": 1,
        "position_title": "Class Representative",
        "created_at": "2026-10-01T01:10:00Z",
        "updated_at": "2026-10-01T01:10:00Z"
      }
    ],
    "participation": {
      "election_id": "1001",
      "eligible": true,
      "vote_quota": 1,
      "used_votes": 0,
      "remaining_votes": 1
    }
  }
}
```

候选人不分页。已投票的合资格调用者仍可读，used_votes=1、remaining_votes=0，但永不返回先前选择。

#### 错误响应

| HTTP | error.code | 触发条件 |
| --- | --- | --- |
| 401 | `AUTHENTICATION_REQUIRED` | 身份缺失 / 无效 / 过期 / 账户不再 ACTIVE。 |
| 403 | `PERMISSION_DENIED` | 已认证但角色无权执行操作。 |
| 403 | `NOT_ELIGIBLE` | 不在名册却查看选票 / 候选人或投票。 |
| 404 | `ELECTION_NOT_FOUND` | 选举不存在，或详情超出可见范围。 |
| 409 | `ELECTION_NOT_OPEN` | 查看选票 / 投票要求 OPEN。 |
| 409 | `VOTING_NOT_STARTED` | 服务器时间早于 starts_at。 |
| 409 | `VOTING_ENDED` | 服务器时间晚于 ends_at。 |
| 422 | `VALIDATION_ERROR` | JSON 损坏、类型 / 字段 / 路径 / query 不合法、未知字段、空 PATCH。 |
| 500 | `INTERNAL_ERROR` | 非预期内部错误；不得披露 SQL、凭据或堆栈。 |

错误结构：error.code 和 error.message 为必有字符串；可选 error.details 为含字符串 field / reason 的对象数组，禁止回显原始输入。受保护接口返回 401 时附 WWW-Authenticate: Bearer。

客户端按 error.code 分支处理，不依赖 message 文案；错误不得暴露 SQL、堆栈、密码、Token 或原始投票输入。

错误响应同样使用 Cache-Control: no-store。

**示例：HTTP 403**

```json
{
  "error": {
    "code": "NOT_ELIGIBLE",
    "message": "Non-member attempts ballot/candidate viewing or voting."
  }
}
```

#### 业务规则与重试

- 合资格 ACTIVE USER；无 body / query；成功 200 BallotView。
- 必须在名册内、状态 OPEN 且处于时间窗。返回按 display_order、数值 id 排序的全部候选人及本人参与状态，不分页。
- 已投票者可读，remaining_votes=0；不提供先前选择。本接口不预留额度，不读取已存选票。
- 错误：`ELECTION_NOT_FOUND`、`NOT_ELIGIBLE`、`ELECTION_NOT_OPEN`、`VOTING_NOT_STARTED`、`VOTING_ENDED`。ADMIN 调用为 `PERMISSION_DENIED`。

只读操作：重试 / 轮询必须有次数及超时上限；读取不预留额度、不发布结果。

[返回接口导航](#api-index)

---

<a id="endpoint-17"></a>

### 4.17 查询本人参与状态

仅查询本人资格、已用和剩余投票额度。

#### 基本信息

| 项目 | 内容 |
| --- | --- |
| 方法 | `GET` |
| 完整路径 | `/api/v1/elections/{election_id}/participation` |
| 认证 | 必需：`Authorization: Bearer <access-token>`；账户须持续为 ACTIVE。 |
| 权限 | USER |
| 选举状态 | DRAFT / OPEN / CLOSED，不要求已发布。 |
| 成功状态 | 200 |
| 请求格式 | HTTPS；无请求体，无需 Content-Type。 |

#### 请求参数

**路径参数**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `election_id` | `ID` | 是 | 目标选举。 |

**查询参数**

无。未声明的查询字段返回 422 VALIDATION_ERROR。

**JSON 请求体**

无。不要发送 JSON（包括空对象）；额外请求体返回 422 VALIDATION_ERROR。

**本接口类型说明：** ID 为匹配 `^[1-9][0-9]*$` 的正十进制字符串，最大 `18446744073709551615`。Timestamp 为带时区、秒精度的 RFC 3339；输入允许 Z / 偏移，输出统一 UTC Z。名称、标题与必填简介不得仅为空白；密码只要求非空且不做 trim。

#### 请求示例

```http
GET /api/v1/elections/1001/participation HTTP/1.1
Host: api.example.invalid
Authorization: Bearer <access-token>
```

域名、ID 和凭据均为示例，不代表实际服务测试。

#### 成功响应

**HTTP 200** · Content-Type: application/json。下方完整展开 `Participation` 响应；所有字段均出现，仅明确可空字段允许 null。

`Cache-Control: no-store`

| 字段 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| `data` | `object` | 否 | 成功数据。 |
| `data.election_id` | `ID` | 否 | 被查询的选举；仅当前调用者参与状态。 |
| `data.eligible` | `boolean` | 否 | 当前 ACTIVE USER 是否在名册内；不代表当前开放投票。 |
| `data.vote_quota` | `integer` | 否 | 名册成员为 1，否则为 0。 |
| `data.used_votes` | `integer` | 否 | 从本人参与记录计算的 0 或 1，不查选票选择；非成员为 0。 |
| `data.remaining_votes` | `integer` | 否 | vote_quota - used_votes，取 0 或 1；非成员为 0。 |

**完整成功示例**

```json
{
  "data": {
    "election_id": "1001",
    "eligible": true,
    "vote_quota": 1,
    "used_votes": 1,
    "remaining_votes": 0
  }
}
```

选举存在但本人不在名册时，eligible=false 且三个计数均为 0，不披露其他用户。

#### 错误响应

| HTTP | error.code | 触发条件 |
| --- | --- | --- |
| 401 | `AUTHENTICATION_REQUIRED` | 身份缺失 / 无效 / 过期 / 账户不再 ACTIVE。 |
| 403 | `PERMISSION_DENIED` | 已认证但角色无权执行操作。 |
| 404 | `ELECTION_NOT_FOUND` | 选举不存在，或详情超出可见范围。 |
| 422 | `VALIDATION_ERROR` | JSON 损坏、类型 / 字段 / 路径 / query 不合法、未知字段、空 PATCH。 |
| 500 | `INTERNAL_ERROR` | 非预期内部错误；不得披露 SQL、凭据或堆栈。 |

错误结构：error.code 和 error.message 为必有字符串；可选 error.details 为含字符串 field / reason 的对象数组，禁止回显原始输入。受保护接口返回 401 时附 WWW-Authenticate: Bearer。

客户端按 error.code 分支处理，不依赖 message 文案；错误不得暴露 SQL、堆栈、密码、Token 或原始投票输入。

错误响应同样使用 Cache-Control: no-store。

**示例：HTTP 404**

```json
{
  "error": {
    "code": "ELECTION_NOT_FOUND",
    "message": "Election absent, or detail outside visibility."
  }
}
```

#### 业务规则与重试

- ACTIVE USER；无 body / query；成功 200 Participation。不接受 user_id 查他人。
- DRAFT、OPEN、CLOSED 均可查，不依赖结果发布。选举不存在为 `ELECTION_NOT_FOUND`；已有选举但本人不在名册则 eligible=false、三个计数均为 0。
- 这是选举详情可见性的明确例外：用于解释无资格，不泄露名册。ADMIN 调用为 `PERMISSION_DENIED`。
- 不返回用户身份、候选人、ballot_id、投票时间。超时恢复时仅提供已提交状态快照，不保证尚在执行的请求以后不会成功。

只读操作：重试 / 轮询必须有次数及超时上限；读取不预留额度、不发布结果。

[返回接口导航](#api-index)

---

<a id="endpoint-18"></a>

### 4.18 提交匿名选票

提交一张不可撤回的匿名单选票，并消耗唯一投票额度。

#### 基本信息

| 项目 | 内容 |
| --- | --- |
| 方法 | `POST` |
| 完整路径 | `/api/v1/elections/{election_id}/votes` |
| 认证 | 必需：`Authorization: Bearer <access-token>`；账户须持续为 ACTIVE。 |
| 权限 | 合资格 USER |
| 选举状态 | OPEN；starts_at <= server_now <= ends_at；剩余额度为 1。 |
| 成功状态 | 201 |
| 请求格式 | HTTPS；JSON 正文，Content-Type: application/json。 |

#### 请求参数

**路径参数**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `election_id` | `ID` | 是 | 目标选举。 |

**查询参数**

无。未声明的查询字段返回 422 VALIDATION_ERROR。

**JSON 请求体** — `VoteCreate`

| 字段 | 类型 | 必填 | 可空 | 默认值 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `candidate_id` | `ID` | 是 | 否 | — | 仅一名本场候选人。不接收身份、匿名选项或额度字段。 |

仅表内字段可写。未知 / 只读字段或错误 JSON 类型返回 422 VALIDATION_ERROR；JSON 整数不接受布尔、小数或字符串冒充。

**本接口类型说明：** ID 为匹配 `^[1-9][0-9]*$` 的正十进制字符串，最大 `18446744073709551615`。Timestamp 为带时区、秒精度的 RFC 3339；输入允许 Z / 偏移，输出统一 UTC Z。名称、标题与必填简介不得仅为空白；密码只要求非空且不做 trim。

#### 请求示例

```http
POST /api/v1/elections/1001/votes HTTP/1.1
Host: api.example.invalid
Authorization: Bearer <access-token>
Content-Type: application/json

{
  "candidate_id": "101"
}
```

域名、ID 和凭据均为示例，不代表实际服务测试。

#### 成功响应

**HTTP 201** · Content-Type: application/json。下方完整展开 `VoteAccepted` 响应；所有字段均出现，仅明确可空字段允许 null。

`Cache-Control: no-store`

| 字段 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| `data` | `object` | 否 | 成功数据。 |
| `data.election_id` | `ID` | 否 | 接收选票的选举。 |
| `data.accepted` | `boolean` | 否 | 固定 true，不证明选择了哪位候选人。 |

**完整成功示例**

```json
{
  "data": {
    "election_id": "1001",
    "accepted": true
  }
}
```

不含 ballot ID、候选人回显、回执 URL、投票时间或定位选票的 Location 头。accepted=true 不是具体选择的回执。

#### 错误响应

| HTTP | error.code | 触发条件 |
| --- | --- | --- |
| 400 | `INVALID_CANDIDATE` | 提交的候选人不存在或不属于该场选举。 |
| 401 | `AUTHENTICATION_REQUIRED` | 身份缺失 / 无效 / 过期 / 账户不再 ACTIVE。 |
| 403 | `PERMISSION_DENIED` | 已认证但角色无权执行操作。 |
| 403 | `NOT_ELIGIBLE` | 不在名册却查看选票 / 候选人或投票。 |
| 404 | `ELECTION_NOT_FOUND` | 选举不存在，或详情超出可见范围。 |
| 409 | `ELECTION_NOT_OPEN` | 查看选票 / 投票要求 OPEN。 |
| 409 | `VOTING_NOT_STARTED` | 服务器时间早于 starts_at。 |
| 409 | `VOTING_ENDED` | 服务器时间晚于 ends_at。 |
| 409 | `VOTE_QUOTA_EXHAUSTED` | 当前调用者已用完唯一额度。 |
| 422 | `VALIDATION_ERROR` | JSON 损坏、类型 / 字段 / 路径 / query 不合法、未知字段、空 PATCH。 |
| 500 | `INTERNAL_ERROR` | 非预期内部错误；不得披露 SQL、凭据或堆栈。 |

错误结构：error.code 和 error.message 为必有字符串；可选 error.details 为含字符串 field / reason 的对象数组，禁止回显原始输入。受保护接口返回 401 时附 WWW-Authenticate: Bearer。

客户端按 error.code 分支处理，不依赖 message 文案；错误不得暴露 SQL、堆栈、密码、Token 或原始投票输入。

错误响应同样使用 Cache-Control: no-store。

**示例：HTTP 409**

```json
{
  "error": {
    "code": "VOTE_QUOTA_EXHAUSTED",
    "message": "No remaining vote quota."
  }
}
```

#### 业务规则与重试

- 合资格 ACTIVE USER；请求 VoteCreate；成功 201 VoteAccepted；ADMIN 无权提交。
- 事务内重新检查名册、OPEN、时间窗与剩余额度；不存在或跨选举的 candidate_id 统一 `400 INVALID_CANDIDATE`。
- 原子写入 participation + 匿名 ballot + choice，不累加计票结果。并发第二次请求不得覆盖第一张票。
- commit 后才返回成功；不返回候选人回显、ballot ID、回执 URL、提交时间或定位已存票的 Location 头。没有读取 / 修改 / 删除选票接口。
- 错误：`ELECTION_NOT_FOUND`、`NOT_ELIGIBLE`、`ELECTION_NOT_OPEN`、`VOTING_NOT_STARTED`、`VOTING_ENDED`、`VOTE_QUOTA_EXHAUSTED`、`INVALID_CANDIDATE`。超时恢复规则在本接口下方重复列出。

**超时处理——禁止盲重试**

- 投票超时、断连或 500 不证明失败；事务可能已提交而响应丢失。禁止自动重发。
- 有限次数查询本人 participation：used_votes=1 仅证明已用掉额度，不证明投给谁；不得猜测展示候选人。
- used_votes=0 不证明原请求以后不会成功。保留“结果待确认”，不要自动再次投票；若用户稍后明确重试，仍由一票额度及事务保证最多一张有效票。
- `VOTE_QUOTA_EXHAUSTED` 是 409 失败，不是原请求成功的重放；不返回原选票。
- 轮询和重试必须有超时及次数上限，不引入无限循环；具体时长由实现配置，不伪造性能承诺。

**事务与隐私要求**

复用架构第 4.12 节和 ADR-007：

1. 固定锁顺序 elections → election_voters。
2. 投票取选举行共享锁，事务内重新检查状态及服务器时间；再对当前名册行取排他锁并重新统计 used_votes。
3. 同一事务写 vote_participation、ballots、ballot_choices；任一步失败全部回滚，commit 前不返回成功。
4. v1 强制 ballots.voter_id=NULL；参与记录无 ballot_id，选票无 participation ID。
5. close 取选举行排他锁，等待在途投票；关闭提交后不得再写入新选票。DRAFT 修改和 open 同样须协调，不能先检查 DRAFT 再越过开启时点写入。
6. 候选人票数从 ballot_choices 聚合，不从 participation 计票，也不在投票时累加结果。

防超额不等于严格 HTTP 重放幂等；v1 不提供 Idempotency-Key 或去重表。未来如设计去重，也不能保存身份与 ballot / 候选人的对应。

- 不向任何角色提供已存单张选票查询或反查投票人接口。
- 不记录投票请求体、JWT、密码、完整 Authorization，尤其不得记录 user_id + candidate_id 或 user_id + ballot_id。代理、APM、错误追踪和审计同样遵守。
- 校验错误只给字段路径和静态原因，不回显投票输入；日志关联 ID 不得进入选票表或构成身份到选票索引。
- 当前架构仅保证**直接身份映射解耦**，不承诺密码学匿名或抗时间戳 / 写入顺序相关分析。须明确评审这一威胁模型与 FR-11 / NFR-2 较强表述之间的验收差异，不宣称问题已解决。
- CORS allowlist、Token 保存、限流及部署门禁仍须在实现时确认；本文不变更权限或生产环境。

[返回接口导航](#api-index)

---

<a id="endpoint-19"></a>

### 4.19 计票与查询结果

根据角色复算已关闭选举，或查看其已发布结果。

#### 基本信息

| 项目 | 内容 |
| --- | --- |
| 方法 | `GET` |
| 完整路径 | `/api/v1/elections/{election_id}/results` |
| 认证 | 必需：`Authorization: Bearer <access-token>`；账户须持续为 ACTIVE。 |
| 权限 | ADMIN / 发布后 USER |
| 选举状态 | CLOSED；USER 还要求结果已发布。 |
| 成功状态 | 200 |
| 请求格式 | HTTPS；无请求体，无需 Content-Type。 |

#### 请求参数

**路径参数**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `election_id` | `ID` | 是 | 目标选举。 |

**查询参数**

无。未声明的查询字段返回 422 VALIDATION_ERROR。

**JSON 请求体**

无。不要发送 JSON（包括空对象）；额外请求体返回 422 VALIDATION_ERROR。

**本接口类型说明：** ID 为匹配 `^[1-9][0-9]*$` 的正十进制字符串，最大 `18446744073709551615`。Timestamp 为带时区、秒精度的 RFC 3339；输入允许 Z / 偏移，输出统一 UTC Z。名称、标题与必填简介不得仅为空白；密码只要求非空且不做 trim。

#### 请求示例

```http
GET /api/v1/elections/1001/results HTTP/1.1
Host: api.example.invalid
Authorization: Bearer <access-token>
```

域名、ID 和凭据均为示例，不代表实际服务测试。

#### 成功响应

**HTTP 200** · Content-Type: application/json。下方完整展开 `Result` 响应；所有字段均出现，仅明确可空字段允许 null。

`Cache-Control: no-store`

| 字段 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| `data` | `object` | 否 | 成功数据。 |
| `data.election_id` | `ID` | 否 | 被计票的已关闭选举。 |
| `data.position_title` | `string` | 否 | 继承选举的唯一职位，1–100 字符。 |
| `data.results_published_at` | `Timestamp` | 是 | ADMIN 未发布预览时为 null，否则为原发布时间。 |
| `data.total_votes` | `integer` | 否 | 所有候选人 vote_count 之和，非负整数。 |
| `data.candidates` | `object[]` | 否 | 包含零票候选人；票数降序，再按 display_order、数值 id 升序。 |
| `data.candidates[].candidate_id` | `ID` | 否 | 本选举候选人；同名按 ID 区分。 |
| `data.candidates[].name` | `string` | 否 | 候选人名称，1–100 字符。 |
| `data.candidates[].vote_count` | `integer` | 否 | 该候选人的有效选票数，非负整数。 |
| `data.winner_candidate_id` | `ID` | 是 | 仅唯一正票数最高者；平票 / 零票为 null，不进行裁决。 |

**完整成功示例**

```json
{
  "data": {
    "election_id": "1001",
    "position_title": "Class Representative",
    "results_published_at": "2026-10-02T04:05:00Z",
    "total_votes": 1,
    "candidates": [
      {
        "candidate_id": "101",
        "name": "Candidate A",
        "vote_count": 1
      },
      {
        "candidate_id": "102",
        "name": "Candidate B",
        "vote_count": 0
      }
    ],
    "winner_candidate_id": "101"
  }
}
```

示例为已发布结果。ADMIN 发布前预览的 results_published_at=null；USER 不得获得该预览。

#### 错误响应

| HTTP | error.code | 触发条件 |
| --- | --- | --- |
| 401 | `AUTHENTICATION_REQUIRED` | 身份缺失 / 无效 / 过期 / 账户不再 ACTIVE。 |
| 403 | `PERMISSION_DENIED` | 已认证但角色无权执行操作。 |
| 404 | `ELECTION_NOT_FOUND` | 选举不存在，或详情超出可见范围。 |
| 409 | `ELECTION_NOT_CLOSED` | 计票 / 发布要求 CLOSED。 |
| 409 | `RESULTS_NOT_PUBLISHED` | USER 请求未发布结果。 |
| 422 | `VALIDATION_ERROR` | JSON 损坏、类型 / 字段 / 路径 / query 不合法、未知字段、空 PATCH。 |
| 500 | `INTERNAL_ERROR` | 非预期内部错误；不得披露 SQL、凭据或堆栈。 |

错误结构：error.code 和 error.message 为必有字符串；可选 error.details 为含字符串 field / reason 的对象数组，禁止回显原始输入。受保护接口返回 401 时附 WWW-Authenticate: Bearer。

客户端按 error.code 分支处理，不依赖 message 文案；错误不得暴露 SQL、堆栈、密码、Token 或原始投票输入。

错误响应同样使用 Cache-Control: no-store。

**示例：HTTP 409**

```json
{
  "error": {
    "code": "RESULTS_NOT_PUBLISHED",
    "message": "USER requests an unpublished result."
  }
}
```

#### 业务规则与重试

- 无 body / query；成功 200 Result。
- 仅 CLOSED 可计票。ADMIN 可在发布前复算预览（results_published_at=null）；USER 仅在发布后读取。
- 沿用 SRS：所有 ACTIVE USER 可读已发布结果，包括非名册用户，不擅自新增更细的公开范围策略。
- 从 ballot_choices 聚合并包含零票候选人；GET 不发布、不存快照、不写计数。平票 / 零票的 winner 为 null，不自动选人。
- 错误：`ELECTION_NOT_FOUND`；ADMIN 在未 CLOSED 时 `ELECTION_NOT_CLOSED`；USER 在未发布时统一 `RESULTS_NOT_PUBLISHED`。

只读操作：重试 / 轮询必须有次数及超时上限；读取不预留额度、不发布结果。

[返回接口导航](#api-index)

---

<a id="endpoint-20"></a>

### 4.20 发布结果

发布已关闭选举的计算结果，不接受客户端提交票数。

#### 基本信息

| 项目 | 内容 |
| --- | --- |
| 方法 | `POST` |
| 完整路径 | `/api/v1/elections/{election_id}/results/publish` |
| 认证 | 必需：`Authorization: Bearer <access-token>`；账户须持续为 ACTIVE。 |
| 权限 | ADMIN |
| 选举状态 | CLOSED；无明确赢家时的发布保护仍为草案决定。 |
| 成功状态 | 200 |
| 请求格式 | HTTPS；无请求体，无需 Content-Type。 |

#### 请求参数

**路径参数**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `election_id` | `ID` | 是 | 目标选举。 |

**查询参数**

无。未声明的查询字段返回 422 VALIDATION_ERROR。

**JSON 请求体**

无。不要发送 JSON（包括空对象）；额外请求体返回 422 VALIDATION_ERROR。

**本接口类型说明：** ID 为匹配 `^[1-9][0-9]*$` 的正十进制字符串，最大 `18446744073709551615`。Timestamp 为带时区、秒精度的 RFC 3339；输入允许 Z / 偏移，输出统一 UTC Z。名称、标题与必填简介不得仅为空白；密码只要求非空且不做 trim。

#### 请求示例

```http
POST /api/v1/elections/1001/results/publish HTTP/1.1
Host: api.example.invalid
Authorization: Bearer <access-token>
```

域名、ID 和凭据均为示例，不代表实际服务测试。

#### 成功响应

**HTTP 200** · Content-Type: application/json。下方完整展开 `Result` 响应；所有字段均出现，仅明确可空字段允许 null。

`Cache-Control: no-store`

| 字段 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- |
| `data` | `object` | 否 | 成功数据。 |
| `data.election_id` | `ID` | 否 | 被计票的已关闭选举。 |
| `data.position_title` | `string` | 否 | 继承选举的唯一职位，1–100 字符。 |
| `data.results_published_at` | `Timestamp` | 是 | ADMIN 未发布预览时为 null，否则为原发布时间。 |
| `data.total_votes` | `integer` | 否 | 所有候选人 vote_count 之和，非负整数。 |
| `data.candidates` | `object[]` | 否 | 包含零票候选人；票数降序，再按 display_order、数值 id 升序。 |
| `data.candidates[].candidate_id` | `ID` | 否 | 本选举候选人；同名按 ID 区分。 |
| `data.candidates[].name` | `string` | 否 | 候选人名称，1–100 字符。 |
| `data.candidates[].vote_count` | `integer` | 否 | 该候选人的有效选票数，非负整数。 |
| `data.winner_candidate_id` | `ID` | 是 | 仅唯一正票数最高者；平票 / 零票为 null，不进行裁决。 |

**完整成功示例**

```json
{
  "data": {
    "election_id": "1001",
    "position_title": "Class Representative",
    "results_published_at": "2026-10-02T04:05:00Z",
    "total_votes": 1,
    "candidates": [
      {
        "candidate_id": "101",
        "name": "Candidate A",
        "vote_count": 1
      },
      {
        "candidate_id": "102",
        "name": "Candidate B",
        "vote_count": 0
      }
    ],
    "winner_candidate_id": "101"
  }
}
```

#### 错误响应

| HTTP | error.code | 触发条件 |
| --- | --- | --- |
| 401 | `AUTHENTICATION_REQUIRED` | 身份缺失 / 无效 / 过期 / 账户不再 ACTIVE。 |
| 403 | `PERMISSION_DENIED` | 已认证但角色无权执行操作。 |
| 404 | `ELECTION_NOT_FOUND` | 选举不存在，或详情超出可见范围。 |
| 409 | `ELECTION_NOT_CLOSED` | 计票 / 发布要求 CLOSED。 |
| 409 | `RESULT_NOT_DECIDED` | 没有唯一正票数赢家；草案保护，待 D-06。 |
| 422 | `VALIDATION_ERROR` | JSON 损坏、类型 / 字段 / 路径 / query 不合法、未知字段、空 PATCH。 |
| 500 | `INTERNAL_ERROR` | 非预期内部错误；不得披露 SQL、凭据或堆栈。 |

错误结构：error.code 和 error.message 为必有字符串；可选 error.details 为含字符串 field / reason 的对象数组，禁止回显原始输入。受保护接口返回 401 时附 WWW-Authenticate: Bearer。

客户端按 error.code 分支处理，不依赖 message 文案；错误不得暴露 SQL、堆栈、密码、Token 或原始投票输入。

错误响应同样使用 Cache-Control: no-store。

**示例：HTTP 409**

```json
{
  "error": {
    "code": "RESULT_NOT_DECIDED",
    "message": "No unique positive-vote winner; draft safeguard pending D-06."
  }
}
```

#### 业务规则与重试

- ADMIN；仅 CLOSED；无 body / query；成功 200 Result。客户端不能提交票数、赢家或发布时间。
- 在事务内复算并以服务器时间设置 results_published_at，不新增 PUBLISHED 状态或 results 表。
- 草案重试约定：对选举行取排他锁后在事务内判断发布状态；已发布时返回原结果及原发布时间，不覆盖时间，并发请求不得重复发布。
- 草案异常保护：没有唯一正票数赢家时 `409 RESULT_NOT_DECIDED`，保持未发布；**须完成 D-06 评审**，不是已批准的平票裁决或自动重投规则。
- 其他错误：`ELECTION_NOT_FOUND`、`ELECTION_NOT_CLOSED`。

- 重复 open / close 返回 409，先 GET 选举确认状态。重复发布按草案返回原时间，不覆盖。

[返回接口导航](#api-index)

<a id="error-dictionary"></a>

## 5. HTTP 状态与错误字典

200 为查询 / 状态操作成功，201 为创建 / 投票成功，204 为删除成功且无正文。未定义的方法和路径不是承诺的接口；实现仍须统一处理框架 404 / 405，不泄露堆栈。

| HTTP | error.code | 含义 |
| --- | --- | --- |
| 400 | `INVALID_CANDIDATE` | 提交的候选人不存在或不属于该场选举。 |
| 400 | `PRIVACY_MODE_VIOLATION` | 请求启用已知但 v1 禁止的匿名模式。 |
| 401 | `INVALID_CREDENTIALS` | 统一登录失败，含禁用账户。 |
| 401 | `AUTHENTICATION_REQUIRED` | 身份缺失 / 无效 / 过期 / 账户不再 ACTIVE。 |
| 403 | `PERMISSION_DENIED` | 已认证但角色无权执行操作。 |
| 403 | `NOT_ELIGIBLE` | 不在名册却查看选票 / 候选人或投票。 |
| 404 | `ROUTE_NOT_FOUND` | 请求的 API 路径未定义。 |
| 405 | `METHOD_NOT_ALLOWED` | 该路径不支持此方法，附 Allow 响应头。 |
| 404 | `ELECTION_NOT_FOUND` | 选举不存在，或详情超出可见范围。 |
| 404 | `CANDIDATE_NOT_FOUND` | 管理目标候选人不存在或跨选举。 |
| 404 | `USER_NOT_FOUND` | 管理员指定的名册账户不存在。 |
| 404 | `VOTER_NOT_FOUND` | 目标名册资格不存在。 |
| 409 | `ELECTION_NOT_EDITABLE` | 修改要求 DRAFT。 |
| 409 | `INVALID_STATE_TRANSITION` | 不合法或重复 open / close。 |
| 409 | `ELECTION_NOT_READY` | 无合法候选人 / 有效选民，或 MVP 配置不合法。 |
| 409 | `ELECTION_NOT_OPEN` | 查看选票 / 投票要求 OPEN。 |
| 409 | `VOTING_NOT_STARTED` | 服务器时间早于 starts_at。 |
| 409 | `VOTING_ENDED` | 服务器时间晚于 ends_at。 |
| 409 | `VOTE_QUOTA_EXHAUSTED` | 当前调用者已用完唯一额度。 |
| 409 | `VOTER_ALREADY_EXISTS` | 资格重复；不得新增第二行。 |
| 409 | `RESOURCE_CONFLICT` | 存在引用或不可变记录，不能安全修改。 |
| 409 | `ELECTION_NOT_CLOSED` | 计票 / 发布要求 CLOSED。 |
| 409 | `RESULTS_NOT_PUBLISHED` | USER 请求未发布结果。 |
| 409 | `RESULT_NOT_DECIDED` | 没有唯一正票数赢家；草案保护，待 D-06。 |
| 422 | `VALIDATION_ERROR` | JSON 损坏、类型 / 字段 / 路径 / query 不合法、未知字段、空 PATCH。 |
| 422 | `INVALID_TIME_RANGE` | 合并后的 starts_at 不早于 ends_at。 |
| 422 | `INVALID_VOTER` | 已有账户非 ACTIVE 或非 USER。 |
| 500 | `INTERNAL_ERROR` | 非预期内部错误；不得披露 SQL、凭据或堆栈。 |

业务检查顺序：认证 / 角色 → 选举及对象资格 → 状态 → 时间 → 候选人 → 额度。Schema 校验可能先于业务执行，畸形请求不承诺 401 与 422 的先后。合法投票请求不为 OPEN 时优先 ELECTION_NOT_OPEN；OPEN 但不在时间窗则返回时间错误；最后检查额度。未授权者不能通过错误探测其他选举候选人是否存在。

```json
{"error":{"code":"VOTE_QUOTA_EXHAUSTED","message":"No remaining vote quota."}}
```

<a id="workflow"></a>

## 6. 流程、并发、重试与隐私

### 6.1 最小调用流程

1. ADMIN 登录，`/auth/me` 确认身份；POST /elections 创建 DRAFT 及初始名册。
2. DRAFT 中增改候选人、增删名册；到开始时间后 `/open`。
3. USER 登录，GET /participation 与 /ballot，选定一名候选人，POST /votes 一次。
4. 仅收到 201 后显示成功；进行中禁用重复提交；结果不明按下节处理。
5. ADMIN `/close` 后 GET /results 复算，再 POST /results/publish；USER 读取已发布结果。

以下为 **POSIX shell** 示例，未针对真实服务执行。API_BASE_URL 包含 `/api/v1`；ACCESS_TOKEN 为受控测试账户的 Token。选举须已 OPEN 且处于时间窗，候选人属于该选举；不要把 Token 写入仓库、日志或截图。

```bash
# API_BASE_URL and ACCESS_TOKEN are supplied by the test environment.
curl --fail-with-body --request GET \
  "$API_BASE_URL/elections/1001/ballot" \
  --header "Authorization: Bearer $ACCESS_TOKEN"

# Send once. Do not enable automatic POST retries.
curl --fail-with-body --request POST \
  "$API_BASE_URL/elections/1001/votes" \
  --header "Authorization: Bearer $ACCESS_TOKEN" \
  --header "Content-Type: application/json" \
  --data '{"candidate_id":"101"}'
```

### 6.2 超时与重试

- 投票超时、断连或 500 不证明失败；事务可能已提交而响应丢失。禁止自动重发。
- 有限次数查询本人 participation：used_votes=1 仅证明已用掉额度，不证明投给谁；不得猜测展示候选人。
- used_votes=0 不证明原请求以后不会成功。保留“结果待确认”，不要自动再次投票；若用户稍后明确重试，仍由一票额度及事务保证最多一张有效票。
- `VOTE_QUOTA_EXHAUSTED` 是 409 失败，不是原请求成功的重放；不返回原选票。
- 创建选举 / 候选人不承诺严格幂等，超时先查询核对；名册重复新增 409。重复删除可 404，但不产生第二次删除效果。
- 重复 open / close 返回 409，先 GET 选举确认状态。重复发布按草案返回原时间，不覆盖。
- 轮询和重试必须有超时及次数上限，不引入无限循环；具体时长由实现配置，不伪造性能承诺。

### 6.3 服务端事务

复用架构第 4.12 节和 ADR-007：

1. 固定锁顺序 elections → election_voters。
2. 投票取选举行共享锁，事务内重新检查状态及服务器时间；再对当前名册行取排他锁并重新统计 used_votes。
3. 同一事务写 vote_participation、ballots、ballot_choices；任一步失败全部回滚，commit 前不返回成功。
4. v1 强制 ballots.voter_id=NULL；参与记录无 ballot_id，选票无 participation ID。
5. close 取选举行排他锁，等待在途投票；关闭提交后不得再写入新选票。DRAFT 修改和 open 同样须协调，不能先检查 DRAFT 再越过开启时点写入。
6. 候选人票数从 ballot_choices 聚合，不从 participation 计票，也不在投票时累加结果。

防超额不等于严格 HTTP 重放幂等；v1 不提供 Idempotency-Key 或去重表。未来如设计去重，也不能保存身份与 ballot / 候选人的对应。

### 6.4 隐私边界

- 不向任何角色提供已存单张选票查询或反查投票人接口。
- 不记录投票请求体、JWT、密码、完整 Authorization，尤其不得记录 user_id + candidate_id 或 user_id + ballot_id。代理、APM、错误追踪和审计同样遵守。
- 校验错误只给字段路径和静态原因，不回显投票输入；日志关联 ID 不得进入选票表或构成身份到选票索引。
- 当前架构仅保证**直接身份映射解耦**，不承诺密码学匿名或抗时间戳 / 写入顺序相关分析。须明确评审这一威胁模型与 FR-11 / NFR-2 较强表述之间的验收差异，不宣称问题已解决。
- CORS allowlist、Token 保存、限流及部署门禁仍须在实现时确认；本文不变更权限或生产环境。

<a id="acceptance"></a>

## 7. 需求追踪与验收清单

下表为**待实现后执行的 API / 集成测试**，不是本次已运行测试；静态文档核对不能证明授权、事务或匿名性已实现。

| 需求 | 接口 / 契约 | 核心验收与负向用例 |
| --- | --- | --- |
| FR-01 / AC-01 | POST /elections、GET 列表 / 详情 | 保存 title 与 position_title；初始资格原子写入；无效账户时整体回滚。 |
| FR-02 / BR-07 | 创建 / PATCH、POST /votes | 固定单职位、匿名、额度 1；拒绝多选、多票及实名。 |
| FR-03 | candidates GET / POST / PATCH / DELETE | 简介必填、照片可空、允许同名；拒绝跨选举、OPEN 后修改及有引用删除。 |
| FR-04 | voters GET / POST / DELETE | 去重、不创建额外行；拒绝无效账户和 USER 查看他人名册。 |
| FR-05 | login / me、公共认证 | 错误密码、禁用账户、过期 / 伪造 Token 被拒；响应和日志无凭据。 |
| FR-06 | 每个接口权限 | USER 管理操作 403、ADMIN 投票 403；列表和 total 权限一致。 |
| FR-07 / AC-03 | ballot / candidates / votes | 无资格不能看选票或投票；本人状态只返回 false，不暴露名册。 |
| FR-08 / AC-02 | GET /ballot | 返回职位及全部候选人；已投者剩余 0，不返回原选择。 |
| FR-09 / AC-02 | POST /votes | commit 后才 201；任一步注入失败时三类记录全部回滚。 |
| FR-10 / AC-04 | votes / participation | 同用户并发两次最多一次 201，另一次 409；原票不变。 |
| FR-11 / AC-07 | 模型、响应及日志 | 无身份↔选票映射、ballot ID 回执、请求体日志；单独评审元数据相关风险。 |
| FR-12 / AC-06 | GET /results | 复算一致、包含零票、sum(vote_count)=total_votes；GET 不发布。 |
| FR-13 / AC-05、AC-08 | open / close / votes | start 前 / end 后拒绝，恰好两端按闭区间；提前关闭和并发关闭正确协调。 |
| FR-14 / AC-06 | results / publish | 未发布 USER 不可读；重复发布保留时间；平票或零票不擅自选赢家。 |

补充边界：超过 JavaScript 安全整数但未超 BIGINT 的 ID 字符串往返；0 / 负数 / 溢出 ID；无时区时间；PATCH 缺省与 null；page_size 0 / 101；空列表和越界页；错误 details 脱敏；超时后 participation 暂为 0；账户禁用后持未过期 Token 仍被拒。

<a id="review-decisions"></a>

## 8. 待评审决策与实现交接

| ID | 本草案决定 / 未决点 | 依据与确认要求 |
| --- | --- | --- |
| D-01 | ID 字符串、显式时区 UTC、秒精度、分页 100 上限、额外字段拒绝、API 文本上限。 | 数据库类型和列长度来自架构；序列化及新增限制由本文提出，需前后端确认。时间窗严格保留 SRS 闭区间。 |
| D-02 | USER 列表为本人名册 + 已发布；非名册本人状态返回 false；所有 ACTIVE 用户可读已发布结果。 | 结果范围来自 FR-14；列表及本人状态例外是本草案约定。更细公开策略仍属 FW-13。 |
| D-03 | 创建时 voter_ids 非空并原子建名册；开启至少一个合法候选人和有效选民。 | FR-01 要求资格范围，架构可分步配置；请求组合由本文提出。Seed 必须提供合法账户 ID，不新增用户管理 API。 |
| D-04 | 候选人简介必填，职位继承选举，照片可选且只接受 HTTPS。 | FR-03 与可空数据库列的契约收敛；不重复存职位，不引入上传或照片必填政策。 |
| D-05 | ADMIN 不投票，仅 ACTIVE USER 加名册；DRAFT 写入与开启协调。 | 架构 10.2 / ADR-007；Service 及测试须落实并发锁、有效账户检查。 |
| D-06 | CLOSED 的 ADMIN 可预览；重复发布 200 保持时间；平票 / 零票 winner=null 且暂拒发布。 | FW-10 不定义裁决，架构仅提线下 / 人工处理。拒绝异常发布是**待确认的安全建议**，不是既定业务需求；不新增手动指定赢家或重投 API。 |
| D-07 | 不承诺重放幂等、不开放多票；直接身份解耦不等于不可关联匿名。 | 架构 11.5 / 15；确认超时 UX、日志脱敏、威胁模型与 FR-11 / NFR-2 验收口径。 |
| D-08 | 哈希算法、JWT 有效期、Token 保存、Seed、CORS、客户端超时、限流、部署地址待定。 | 继承架构 Open Issues，示例不是批准配置；没有量化性能验收门槛。 |

实现时优先复用 FastAPI / Pydantic 的路由、校验、response model 和 OpenAPI 生成，不维护第二套字段事实源。当前不提供手写 OpenAPI 文件，也不声称 `/docs` 或 `/openapi.json` 可用；实现后从应用生成并核对 20 个操作及权限、枚举和错误封装，防止 ORM 字段意外泄露。

只有真实 API / 集成测试通过后，才可标记为已实现文档。本次不迁移数据库、不添加依赖、不修改 SRS / 架构结论、不承诺服务可用。

## 9. 修订记录

| 日期 | 版本 | 变更 |
| --- | --- | --- |
| 2026-10-01 | API v0.1 draft | 建立 20 个待实现接口的中英文契约，含模型、错误、隐私、追踪与验收；新增决策明确待评审。 |
| 2026-10-01 | API v0.1 draft — 阅读结构调整 | 重组为 20 份可独立阅读的接口说明，集中参数 / 响应 / 错误字段、完整示例及跳转导航；不改变路径、字段或业务规则。 |
