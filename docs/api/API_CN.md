# API 接口规范

[English](../../API.md) / 简体中文

> 文档版本：**API v0.1 草案** · 更新：**2026-10-01（Asia/Hong_Kong）**
> 基线：SRS v0.1、架构 v0.2、Git `b74cd1647a3e85796f3b1c9ae5c1cdac677c62bf`。
> **设计契约，待评审与实现，不是运行中服务的实测文档。** 基线仅包含数据库初始化代码，尚无 FastAPI 路由、请求 / 响应模型、应用入口和 API 测试。下列所有接口均待实现。

## 1. 依据与范围

- [需求规格](../requirements/REQUIREMENTS_CN.md)：FR-01–FR-14、BR-01–BR-12、AC-01–AC-08。
- [架构设计](../architecture/ARCHITECTURE_CN.md)：第 4 节数据与事务、第 8–11 节接口与安全，特别遵循第 4.21 节及 ADR-008 的 v1 限制。
- [Future Work](../future/FUTURE_CN.md)：延期能力与永久排除项。
- [数据库 Schema](../../backend/database/init/01_init_schema.py)：以上述已提交基线核对字段、长度和约束；不以本地未提交代码为批准依据，不运行初始化脚本。

业务范围以 SRS 为准，数据库预留能力不等于开放功能。本文补充的序列化、分页、字段组合和错误处理属于**提请评审的 API 设计**，不是已有实现或此前已批准的会议结论；第 8 节列出关键待确认项。中英文版本须同步维护，业务变更应先更新 SRS / 架构 / 验收。

v1 仅支持：**一场一个职位、单选、一人一票、强制匿名、得票最高者当选**。

不定义账号管理 `/users`、注册、Refresh Token、审计查询、导出、邮件、实时投票率、照片上传、投票回执、已存选票查询 / 撤回 / 修改 / 删除、多轮、多票、实名投票或自动平票裁决。架构第 8 节的 `/users` 是资源预留，后台账号管理仍属 FW-08。账户由获授权的 Seed / 部署流程准备。

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

普通响应：`{"data": <模型>}`；`204` 无正文，不能带 data。第 3 节所有响应字段均存在，可空字段返回 null。

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

## 3. 数据模型与字段

下表描述 `data` 内的对象，不要求增加同名数据库表。示例均为虚构数据；不得据此推断服务已部署。

### 3.1 响应模型

| 模型 | 字段、类型及约束 |
| --- | --- |
| `User` | `id: ID`；`username: string(1–50)`；`display_name: string(1–100)`；`role: ADMIN/USER`；`status: ACTIVE/DISABLED`；`created_at, updated_at: Timestamp`。不返回 password / password_hash。 |
| `Token` | `access_token: string`；`token_type: "bearer"`；`expires_in: 正整数秒`，取部署配置，尚未定值；`user: User`。 |
| `Election` | `id: ID`；`title: string(1–200)`；`position_title: string(1–100)`；`description: string(最多 10000) 或 null`；`created_by: ID`；`status: DRAFT/OPEN/CLOSED`；`privacy_mode: FORCED_ANONYMOUS`；`starts_at, ends_at: Timestamp`；`results_published_at: Timestamp 或 null`；`created_at, updated_at: Timestamp`。 |
| `Candidate` | `id, election_id: ID`；`name: string(1–100)`；`position_title: string`，从 Election 推导；`description: string(1–10000)`；`photo_url: HTTPS URL(最多 500 字符) 或 null`；`display_order: 整数 0–2147483647`；`created_at, updated_at: Timestamp`。允许同名，不要求候选人有账户。 |
| `Voter` | `election_id, user_id: ID`（复合键，无独立行 ID）；`display_name: string`（来自账户）；`vote_quota: 1`；`created_at, updated_at: Timestamp`（名册记录时间，非投票时间）。 |
| `Participation` | `election_id: ID`；`eligible: boolean`；`vote_quota, used_votes, remaining_votes: 整数 0 或 1`。有资格时 quota=1，remaining=quota-used；不在名册时 eligible=false 且三个计数全为 0。 |
| `BallotView` | `election: Election`；`candidates: Candidate[]`（全部候选人，不分页）；`participation: Participation`（仅调用者）。不是已存选票资源。 |
| `VoteAccepted` | `election_id: ID`；`accepted: true`。不含候选人回显、ballot_id、回执、提交时间。 |
| `CandidateResult` | `candidate_id: ID`；`name: string`；`vote_count: 非负整数`。 |
| `Result` | `election_id: ID`；`position_title: string`；`results_published_at: Timestamp 或 null`；`total_votes: 非负整数`；`candidates: CandidateResult[]`；`winner_candidate_id: ID 或 null`。 |

计数及剩余额度按已有数据推导，不保存第二份状态。Result 包含零票候选人，按 vote_count 降序，再按候选人 display_order、数值 id 升序；total_votes 等于候选人票数之和。只有存在唯一最高票且总票数大于 0 时才有 winner_candidate_id，平票或零票返回 null，不能把排序作为裁决。发布异常处理见 D-06。

### 3.2 创建与修改请求

| 请求模型 | 可写字段 |
| --- | --- |
| `Login` | 必填 `username: 非空 string，最多 50 字符`、`password: 非空 string`；密码不得 trim。密码政策和哈希算法留待实现决策。 |
| `ElectionCreate` | 必填 title、position_title、starts_at、ends_at（类型及长度同 Election）；必填 `voter_ids: 非空、不重复的 ID[]`；可选 description（默认 null）、privacy_mode（默认且仅允许 FORCED_ANONYMOUS）。 |
| `ElectionPatch` | title、position_title、description、starts_at、ends_at、privacy_mode 的非空子集；仅 description 可置 null；按合并后的值校验 starts_at < ends_at；不接收 voter_ids。 |
| `CandidateCreate` | 必填 name、description；可选 photo_url（默认 null）、display_order（默认 0）；约束同 Candidate。 |
| `CandidatePatch` | CandidateCreate 的非空子集；仅 photo_url 可置 null。 |
| `VoterCreate` | 必填 `user_id: ID`；可选 `vote_quota: 1`（默认 1）。目标须为已有 ACTIVE USER。 |
| `VoteCreate` | 仅必填 `candidate_id: ID`；拒绝 candidate_ids 数组、user_id、voter_id、is_anonymous、ballot_id 和客户端额度。 |

候选人职位取自 elections.position_title，不重复存储。description 即使数据库允许 null，也按 FR-03 要求简介必填。照片草案仅接收 HTTPS URL，不提供上传或服务端代抓取。

### 3.3 请求与响应示例

登录请求（占位密码不是真实凭据）：

```json
{"username":"demo_voter","password":"<demo-password>"}
```

创建选举；初始资格范围由 voter_ids 指定，不是 elections 的新列：

```json
{
  "title": "Class Representative Election",
  "position_title": "Class Representative",
  "description": "One seat; one choice per voter.",
  "starts_at": "2026-10-02T02:00:00Z",
  "ends_at": "2026-10-02T04:00:00Z",
  "voter_ids": ["21", "22"]
}
```

`201` Election：

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

添加候选人：

```json
{"name":"Candidate A","description":"A fictional introduction.","photo_url":null,"display_order":0}
```

添加名册成员：

```json
{"user_id":"23","vote_quota":1}
```

修改候选人简介（其他字段不变）：

```json
{"description":"Updated candidate introduction."}
```

投票请求和 `201` 响应：

```json
{"candidate_id":"101"}
```

```json
{"data":{"election_id":"1001","accepted":true}}
```

投票后查询本人状态（不会暴露先前选择）：

```json
{"data":{"election_id":"1001","eligible":true,"vote_quota":1,"used_votes":1,"remaining_votes":0}}
```

已发布结果（示例只有一张有效票）：

```json
{
  "data": {
    "election_id": "1001",
    "position_title": "Class Representative",
    "results_published_at": "2026-10-02T04:05:00Z",
    "total_votes": 1,
    "candidates": [
      {"candidate_id":"101","name":"Candidate A","vote_count":1},
      {"candidate_id":"102","name":"Candidate B","vote_count":0}
    ],
    "winner_candidate_id": "101"
  }
}
```

## 4. 接口清单与逐项契约

所有路径相对于 `/api/v1`；成功对象使用第 3 节 data 包装，列表使用 data 数组 + meta。未列出的 query / body 不接收。每个接口继承公共 `401`、角色 `403`、Schema `422` 和服务端 `500`；下列“错误”仅突出业务情况。

| # | 方法 | 路径 | 权限 | 成功模型 |
| --- | --- | --- | --- | --- |
| 1 | POST | `/auth/login` | 公开 | 200 Token |
| 2 | GET | `/auth/me` | 已认证 | 200 User |
| 3 | GET | `/elections` | 已认证 | 200 Election[] + meta |
| 4 | POST | `/elections` | ADMIN | 201 Election |
| 5 | GET | `/elections/{election_id}` | 已认证、可见范围内 | 200 Election |
| 6 | PATCH | `/elections/{election_id}` | ADMIN | 200 Election |
| 7 | POST | `/elections/{election_id}/open` | ADMIN | 200 Election |
| 8 | POST | `/elections/{election_id}/close` | ADMIN | 200 Election |
| 9 | GET | `/elections/{election_id}/candidates` | ADMIN / 合资格 USER | 200 Candidate[] + meta |
| 10 | POST | `/elections/{election_id}/candidates` | ADMIN | 201 Candidate |
| 11 | PATCH | `/elections/{election_id}/candidates/{candidate_id}` | ADMIN | 200 Candidate |
| 12 | DELETE | `/elections/{election_id}/candidates/{candidate_id}` | ADMIN | 204 无正文 |
| 13 | GET | `/elections/{election_id}/voters` | ADMIN | 200 Voter[] + meta |
| 14 | POST | `/elections/{election_id}/voters` | ADMIN | 201 Voter |
| 15 | DELETE | `/elections/{election_id}/voters/{user_id}` | ADMIN | 204 无正文 |
| 16 | GET | `/elections/{election_id}/ballot` | 合资格 USER | 200 BallotView |
| 17 | GET | `/elections/{election_id}/participation` | USER | 200 Participation |
| 18 | POST | `/elections/{election_id}/votes` | 合资格 USER | 201 VoteAccepted |
| 19 | GET | `/elections/{election_id}/results` | ADMIN / 发布后 USER | 200 Result |
| 20 | POST | `/elections/{election_id}/results/publish` | ADMIN | 200 Result |

### 4.1 登录

`POST /api/v1/auth/login`

- 请求：Login；无 query。成功：200 Token。
- 检查密码及账户状态；未知用户、错误密码、禁用账户统一返回 `401 INVALID_CREDENTIALS`，避免账户枚举。
- JWT 有效期、签名配置来自环境而非写死示例；哈希算法、前端 Token 存放方式尚待确认。不新增注册、刷新 Token 或服务端注销接口。

### 4.2 当前身份

`GET /api/v1/auth/me`

- 请求：无 body / query。成功：200 User。
- 从验证后的 JWT 获取账户；账户被禁用时，即使 Token 未过期也返回 `401 AUTHENTICATION_REQUIRED`。
- 不接受 user_id 参数查询他人。

### 4.3 选举列表

`GET /api/v1/elections`

- Query：page、page_size，以及可选 status（DRAFT / OPEN / CLOSED）；无 body。
- ADMIN 可见全部；USER 可见本人名册内选举及所有已发布选举。按数值 id 降序，先过滤权限后分页。
- 成功：200 Election[] + meta；空集合为 data=[]、total=0。不含实时票数、他人名册或未发布结果。

### 4.4 创建选举

`POST /api/v1/elections`

- ADMIN；请求 ElectionCreate；成功 201 Election，状态 DRAFT。
- starts_at 必须早于 ends_at。voter_ids 必须不重复，且每个目标均为已有 ACTIVE USER；账户 ID 由获授权的 Seed / 部署资料提供。
- 在同一事务创建选举和初始名册，额度均为 1；任一账户不合法则全部回滚。created_by 从当前 ADMIN 取得。之后添加候选人。
- 错误：`USER_NOT_FOUND`、`INVALID_VOTER`、`INVALID_TIME_RANGE`、`PRIVACY_MODE_VIOLATION`；重复 voter_ids 属于 `VALIDATION_ERROR`。

### 4.5 选举详情

`GET /api/v1/elections/{election_id}`

- 无 body / query；成功 200 Election。可见性同列表。
- 不存在或不在可见范围内统一返回 `404 ELECTION_NOT_FOUND`。不附带候选人、其他选民和得票。

### 4.6 修改草稿选举

`PATCH /api/v1/elections/{election_id}`

- ADMIN；仅 DRAFT；请求 ElectionPatch；成功 200 Election。
- 合并新旧字段后检查时间范围；拒绝 id、created_by、status、results_published_at、voter_ids。修改资格用名册接口。
- 与 open 并发时，草稿修改不能在选举已 OPEN 后提交。
- 错误：`ELECTION_NOT_FOUND`、`ELECTION_NOT_EDITABLE`、`INVALID_TIME_RANGE`、`PRIVACY_MODE_VIOLATION`。

### 4.7 开启投票

`POST /api/v1/elections/{election_id}/open`

- ADMIN；无 body / query；仅 DRAFT → OPEN；成功 200 Election。
- 要求处于含两端时间窗，至少一个候选人且全部候选人资料合法、至少一个 ACTIVE USER 名册成员；全部额度为 1，匿名模式为 FORCED_ANONYMOUS。
- 检查与状态流转须原子完成；重复 open 和重开 CLOSED 均返回 `INVALID_STATE_TRANSITION`。不引入定时调度器。
- 错误：`ELECTION_NOT_FOUND`、`INVALID_STATE_TRANSITION`、`ELECTION_NOT_READY`、`VOTING_NOT_STARTED`、`VOTING_ENDED`。

### 4.8 关闭投票

`POST /api/v1/elections/{election_id}/close`

- ADMIN；无 body / query；仅 OPEN → CLOSED；成功 200 Election。
- 可提前关闭，也可在 ends_at 后关闭以便计票发布。重复 close 返回 `INVALID_STATE_TRANSITION`。
- 对选举行取排他锁，等待在途投票事务后提交 CLOSED，commit 后才响应成功。到期后即使状态仍为 OPEN，也必须停止接受投票。
- 错误：`ELECTION_NOT_FOUND`、`INVALID_STATE_TRANSITION`。

### 4.9 候选人列表

`GET /api/v1/elections/{election_id}/candidates`

- Query：page、page_size；无 body；成功 200 Candidate[] + meta。按 display_order、数值 id 升序。
- ADMIN 任意状态可读；USER 须在名册内、选举 OPEN 且处于时间窗，与选票入口保持一致，不能绕过 FR-07 / FR-08。
- 已投票但合资格的 USER 可读，不返回其先前选择。关闭后普通用户通过已发布结果查看结果。
- 错误：`ELECTION_NOT_FOUND`、`NOT_ELIGIBLE`、`ELECTION_NOT_OPEN`、`VOTING_NOT_STARTED`、`VOTING_ENDED`。

### 4.10 添加候选人

`POST /api/v1/elections/{election_id}/candidates`

- ADMIN；仅 DRAFT；请求 CandidateCreate；成功 201 Candidate。
- election_id 来自路径，position_title 继承选举；均不得在 body 指定。不要求候选人具有账户，不按姓名去重。
- 错误：`ELECTION_NOT_FOUND`、`ELECTION_NOT_EDITABLE`。

### 4.11 修改候选人

`PATCH /api/v1/elections/{election_id}/candidates/{candidate_id}`

- ADMIN；仅 DRAFT；请求 CandidatePatch；成功 200 Candidate。
- 校验 candidate_id 属于路径中的选举，不能只按全局 ID 更新；不得转移 election_id 或单独改职位。
- 错误：`ELECTION_NOT_FOUND`、`CANDIDATE_NOT_FOUND`、`ELECTION_NOT_EDITABLE`。

### 4.12 删除草稿候选人

`DELETE /api/v1/elections/{election_id}/candidates/{candidate_id}`

- ADMIN；仅 DRAFT；无 body / query；成功 204 无正文。
- 候选人须属于本场且未被选票引用。禁止级联删除选票；已有引用返回 `RESOURCE_CONFLICT`。
- 不存在、跨选举或重复删除返回 `CANDIDATE_NOT_FOUND`；另可能返回 `ELECTION_NOT_FOUND`、`ELECTION_NOT_EDITABLE`。

### 4.13 名册列表

`GET /api/v1/elections/{election_id}/voters`

- ADMIN；任意选举状态；query 为 page、page_size；无 body；成功 200 Voter[] + meta。
- 按数值 user_id 升序，只返回名册元数据，不返回 ballot ID、投票内容、投票时间或个人投票历史。
- USER 无权列出其他选民；错误：`ELECTION_NOT_FOUND`、`PERMISSION_DENIED`。

### 4.14 添加选民

`POST /api/v1/elections/{election_id}/voters`

- ADMIN；仅 DRAFT；请求 VoterCreate；成功 201 Voter。
- 目标须为已有 ACTIVE USER。按 (election_id, user_id) 去重；重复时 `409 VOTER_ALREADY_EXISTS` 且不新增行。
- 不提供批量导入、额度编辑或账户创建；非 1 额度返回 `422 VALIDATION_ERROR`。
- 其他错误：`ELECTION_NOT_FOUND`、`USER_NOT_FOUND`、`INVALID_VOTER`、`ELECTION_NOT_EDITABLE`。

### 4.15 移除选民

`DELETE /api/v1/elections/{election_id}/voters/{user_id}`

- ADMIN；仅 DRAFT；无 body / query；成功 204 无正文。
- 只删除目标资格，不删除账户或参与记录；存在参与记录时 `RESOURCE_CONFLICT`。DRAFT 可移除最后一人，但之后 open 会因未就绪被拒。
- 不存在或重复删除返回 `VOTER_NOT_FOUND`；另可能返回 `ELECTION_NOT_FOUND`、`ELECTION_NOT_EDITABLE`。

### 4.16 获取选票视图

`GET /api/v1/elections/{election_id}/ballot`

- 合资格 ACTIVE USER；无 body / query；成功 200 BallotView。
- 必须在名册内、状态 OPEN 且处于时间窗。返回按 display_order、数值 id 排序的全部候选人及本人参与状态，不分页。
- 已投票者可读，remaining_votes=0；不提供先前选择。本接口不预留额度，不读取已存选票。
- 错误：`ELECTION_NOT_FOUND`、`NOT_ELIGIBLE`、`ELECTION_NOT_OPEN`、`VOTING_NOT_STARTED`、`VOTING_ENDED`。ADMIN 调用为 `PERMISSION_DENIED`。

### 4.17 查询本人参与状态

`GET /api/v1/elections/{election_id}/participation`

- ACTIVE USER；无 body / query；成功 200 Participation。不接受 user_id 查他人。
- DRAFT、OPEN、CLOSED 均可查，不依赖结果发布。选举不存在为 `ELECTION_NOT_FOUND`；已有选举但本人不在名册则 eligible=false、三个计数均为 0。
- 这是选举详情可见性的明确例外：用于解释无资格，不泄露名册。ADMIN 调用为 `PERMISSION_DENIED`。
- 不返回用户身份、候选人、ballot_id、投票时间。超时恢复时仅提供已提交状态快照，不保证尚在执行的请求以后不会成功。

### 4.18 提交匿名选票

`POST /api/v1/elections/{election_id}/votes`

- 合资格 ACTIVE USER；请求 VoteCreate；成功 201 VoteAccepted；ADMIN 无权提交。
- 事务内重新检查名册、OPEN、时间窗与剩余额度；不存在或跨选举的 candidate_id 统一 `400 INVALID_CANDIDATE`。
- 原子写入 participation + 匿名 ballot + choice，不累加计票结果。并发第二次请求不得覆盖第一张票。
- commit 后才返回成功；不返回候选人回显、ballot ID、回执 URL、提交时间或定位已存票的 Location 头。没有读取 / 修改 / 删除选票接口。
- 错误：`ELECTION_NOT_FOUND`、`NOT_ELIGIBLE`、`ELECTION_NOT_OPEN`、`VOTING_NOT_STARTED`、`VOTING_ENDED`、`VOTE_QUOTA_EXHAUSTED`、`INVALID_CANDIDATE`。重试见第 6 节。

### 4.19 计票与查询结果

`GET /api/v1/elections/{election_id}/results`

- 无 body / query；成功 200 Result。
- 仅 CLOSED 可计票。ADMIN 可在发布前复算预览（results_published_at=null）；USER 仅在发布后读取。
- 沿用 SRS：所有 ACTIVE USER 可读已发布结果，包括非名册用户，不擅自新增更细的公开范围策略。
- 从 ballot_choices 聚合并包含零票候选人；GET 不发布、不存快照、不写计数。平票 / 零票的 winner 为 null，不自动选人。
- 错误：`ELECTION_NOT_FOUND`；ADMIN 在未 CLOSED 时 `ELECTION_NOT_CLOSED`；USER 在未发布时统一 `RESULTS_NOT_PUBLISHED`。

### 4.20 发布结果

`POST /api/v1/elections/{election_id}/results/publish`

- ADMIN；仅 CLOSED；无 body / query；成功 200 Result。客户端不能提交票数、赢家或发布时间。
- 在事务内复算并以服务器时间设置 results_published_at，不新增 PUBLISHED 状态或 results 表。
- 草案重试约定：对选举行取排他锁后在事务内判断发布状态；已发布时返回原结果及原发布时间，不覆盖时间，并发请求不得重复发布。
- 草案异常保护：没有唯一正票数赢家时 `409 RESULT_NOT_DECIDED`，保持未发布；**须完成 D-06 评审**，不是已批准的平票裁决或自动重投规则。
- 其他错误：`ELECTION_NOT_FOUND`、`ELECTION_NOT_CLOSED`。

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
