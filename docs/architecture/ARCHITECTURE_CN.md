# 架构设计

[English](../../ARCHITECTURE.md) / 简体中文

---
> 文档版本：**SRS v0.1**
> 最后更新：2026-09-29
> 适用范围：COMP3500SEF 小组项目 · 选举管理与投票系统 · 首个 MVP
>
> 此文档用于描述 Election-management-voting 项目的整体技术设计, 包含**系统整体架构, 技术栈的使用, 模块边界, 后端分层, 前端组织**等等内容
>

---


## 1. 系统整体架构

整个选举投票系统使用 **前端网页 React 加上后端 Python + FastAPI 的前后端分离架构**, 使用 MySQL 存储数据.

## 2. 分层

### 2.1 后端

后端采用三层架构，分别为：

- **接口层（API Layer）**：负责 HTTP API、Request / Response、输入参数解析与格式校验。
- **业务层（Service Layer）**：负责实现具体业务流程与业务规则。
- **数据交互层（Repository / DAO Layer）**：负责与数据库进行交互。

> [!ERROR] **注意**
>
> 严禁跨层访问。例如，接口层不得直接访问数据库；同时，也禁止在某一层中实现本应属于其他层的逻辑。

#### 2.1.1 后端各层的数据校验

数据校验按照职责分为以下三部分：

1. **接口层：格式校验**

   接口层负责检查外部输入在数据格式上是否合法，例如：

   - 必填字段是否缺失；
   - 数据类型是否正确；
   - 日期、时间等字段是否能够正常解析；
   - 数值是否超出允许范围；
   - 字符串长度、枚举值等是否满足接口约定。

   此类校验原则上由 FastAPI / Pydantic Schema 完成。

2. **业务层：业务规则校验**

   业务层负责检查数据及操作是否符合系统的业务规则，例如：

   - 当前时间是否仍处于投票时间范围内；
   - 用户是否具有该选举的投票资格；
   - 用户是否已经投过票；
   - 候选人是否属于当前选举；
   - 当前选举状态是否允许执行该操作；
   - 提交的投票是否满足业务规则。

   如果业务层存在绕过 HTTP API 的调用方式，例如内部程序、后台任务或外部脚本直接调用 Service，则业务层必须保证其自身业务契约成立，并对必要的输入条件再次进行校验，不能依赖接口层作为唯一保护。

3. **数据交互层：数据完整性与安全**

   数据交互层不负责业务规则校验，只负责执行数据的查询、写入、修改和删除。

   数据库访问必须使用 ORM 或参数化查询，禁止通过字符串拼接构造 SQL，以避免 SQL Injection 等数据库攻击。

   同时，数据库应通过 `NOT NULL`、`UNIQUE`、`FOREIGN KEY`、`CHECK` 等约束保证最终数据的完整性。对于“一人一票”等关键规则，在业务层校验之外，还应通过数据库约束提供最后一道保护。

### 2.2 前端

前端采用五层架构，分别为：

- **路由层（Route Layer）**：负责 URL、页面之间的映射，以及页面导航与基础路由保护。
- **页面层（Page Layer）**：负责页面布局、组件组合以及页面级状态协调。
- **组件层（Component Layer）**：负责具体 UI 的展示与用户交互。
- **逻辑与状态层（Hook / Store Layer）**：负责前端业务流程、状态管理、共享状态以及数据处理。
- **数据访问层（API Layer）**：负责与后端 API 进行 HTTP 通信。

> [!ERROR] **注意**
>
> 原则上禁止跨层访问。例如，页面层和组件层不得直接发送 HTTP 请求，所有后端通信必须统一通过数据访问层完成。
>
> 同时，也禁止在某一层中实现本应属于其他层的逻辑。例如，组件层不得实现完整业务流程，数据访问层不得实现业务规则。

#### 2.2.1 前端各层职责

1. **路由层：页面导航**

   路由层负责：

   - URL 与页面之间的映射；
   - 页面跳转；
   - 登录状态等基础路由保护；
   - 无效路径处理。

   路由层仅负责前端导航控制，不作为系统权限控制的最终依据。

2. **页面层：页面组织**

   页面层负责：

   - 页面整体布局；
   - 页面组件的组合；
   - 页面级状态协调；
   - 调用逻辑与状态层提供的功能。

   页面层不得直接发送 HTTP 请求，也不应实现复杂业务逻辑。

3. **组件层：UI 与交互**

   组件层负责：

   - UI 展示；
   - 接收和显示数据；
   - 用户点击、输入等交互；
   - 组件自身的简单 UI 状态。

   组件层不得直接访问后端 API，也不应实现完整业务流程或关键业务规则。

4. **逻辑与状态层：业务流程与状态管理**

   逻辑与状态层负责：

   - 前端业务流程；
   - 页面或组件状态管理；
   - 跨页面共享状态；
   - 数据处理；
   - 调用数据访问层获取或修改数据。

   React 中主要通过 Custom Hook、Context、Store 等方式实现。

5. **数据访问层：后端通信**

   数据访问层负责：

   - HTTP 请求发送；
   - Request 参数构造；
   - Response 数据处理；
   - Token 注入；
   - HTTP 错误的统一处理。

   数据访问层只负责与后端通信，不负责业务规则或 UI 行为。

#### 2.2.2 前端数据校验

前端校验主要用于改善用户体验，例如：

- 检查必填字段；
- 检查输入格式；
- 判断按钮是否应被禁用；
- 根据当前状态控制页面或组件显示；
- 提前提示用户是否满足某些操作条件。

但是，前端中的权限判断、时间判断、投票资格判断、一人一票判断等均**不能作为最终业务校验依据**。

所有关键业务规则必须由后端再次验证，前端校验仅作为用户体验层面的辅助机制。

## 3. 模块

### 3.1 后端

1. **身份 / 用户模块**
    - 职责：
        - 登录；
        - 身份认证；
        - 获取当前用户；
        - 角色与权限控制。

2. **选举模块**
    - 职责：
        - 创建选举；
        - 修改选举配置；
        - 开始 / 关闭选举；
        - 查询选举状态。

3. **候选人模块**
    - 职责：
        - 新增候选人；
        - 修改候选人；
        - 查询候选人；
        - 删除候选人。

4. **选民模块**
    - 职责：
        - 管理选民名册；
        - 判断用户是否具有投票资格。

5. **投票模块**
    - 职责：
        - 获取选票；
        - 提交选票；
        - 防止重复投票。

6. **结果模块**
    - 职责：
        - 计票；
        - 查看结果；
        - 发布结果。

7. **核心模块**
    - 职责：
        - 全局异常处理；
        - 统一响应格式；
        - 系统配置；
        - 公共基础功能。

### 3.2 前端

1. **身份 / 用户模块**
    - 职责：
        - 登录页面与登录操作；
        - 当前用户状态维护；
        - 登录状态判断；
        - 根据角色控制页面和功能显示。

2. **选举模块**
    - 职责：
        - 选举列表展示；
        - 选举详情展示；
        - 创建选举；
        - 修改选举配置；
        - 开始 / 关闭选举；
        - 展示选举状态。

3. **候选人模块**
    - 职责：
        - 候选人列表与详情展示；
        - 新增候选人；
        - 修改候选人；
        - 删除候选人。

4. **选民模块**
    - 职责：
        - 选民名册展示与管理；
        - 展示用户投票资格状态。

5. **投票模块**
    - 职责：
        - 展示选票；
        - 选择候选人；
        - 提交投票；
        - 展示投票成功或失败状态；
        - 根据当前状态控制投票界面。

6. **结果模块**
    - 职责：
        - 展示计票结果；
        - 展示已发布结果；
        - 管理员结果发布操作。

7. **公共模块**
    - 职责：
        - 公共 UI 组件；
        - 页面布局；
        - 导航；
        - Loading / Error / Modal 等通用组件；
        - 公共工具函数；
        - 前端全局配置。

## 4. 数据库

### 4.1 数据库总体设计

本项目在首个 MVP 阶段使用 **单 MySQL 数据库**，不进行物理分库，也不进行水平分表。

原因如下：

- 当前项目面向课程项目和班级规模选举，数据量较小，单个 MySQL 实例足以满足性能需求；
- 投票提交涉及选民资格、投票记录和选票内容的原子写入，使用单库可以直接通过数据库事务保证一致性；
- 过早分库会引入跨库事务、数据同步、分布式 ID、跨库查询等不必要的复杂度；
- 目前更重要的是通过合理的表结构、索引、约束和事务保证数据正确性。

数据库在逻辑上按照业务划分为以下数据域：

| 数据域 | 数据表 | 主要职责 |
|---|---|---|
| 身份与用户 | `users` | 登录账户、用户状态、系统角色 |
| 选举管理 | `elections` | 选举配置、状态、投票时间、匿名策略 |
| 候选人管理 | `election_candidates` | 维护某个选举下的候选人 |
| 选民管理 | `election_voters` | 维护某个选举的选民名册与投票资格 |
| 投票资格消耗 | `vote_participation` | 记录用户是否已经使用该选举的投票资格 |
| 选票 | `ballots` | 保存实际提交的选票 |
| 选票选择 | `ballot_choices` | 保存每张选票选择的候选人 |
| 审计 | `audit_logs` | 保存管理员及系统关键管理操作 |

数据库建议统一使用：

- Storage Engine：`InnoDB`；
- Character Set：`utf8mb4`；
- 时间统一以 UTC 写入数据库，由 API / 前端根据显示需要转换时区；
- 主键使用自增 `BIGINT UNSIGNED`，关联表在适合时使用复合主键；
- 数据库 Schema 的任何修改必须通过版本化 Migration 或版本化 SQL 文件管理，禁止仅在个人本地数据库中手工修改。

---

### 4.2 数据库关系

```mermaid
erDiagram
    USERS ||--o{ ELECTIONS : creates
    USERS ||--o{ ELECTION_VOTERS : eligible
    ELECTIONS ||--o{ ELECTION_CANDIDATES : contains
    ELECTIONS ||--o{ ELECTION_VOTERS : has
    ELECTION_VOTERS ||--o| VOTE_PARTICIPATION : consumes
    ELECTIONS ||--o{ BALLOTS : receives
    ELECTION_VOTERS ||--o{ BALLOTS : identified_vote
    BALLOTS ||--|| BALLOT_CHOICES : contains
    ELECTION_CANDIDATES ||--o{ BALLOT_CHOICES : selected
    USERS ||--o{ AUDIT_LOGS : performs
```

其中，`vote_participation` 与 `ballots` **故意分离**：

- `vote_participation` 只回答“某个用户是否已经投过票”；
- `ballots` 和 `ballot_choices` 保存“某张票选择了谁”；
- 当投票为匿名投票时，`ballots.voter_id` 为 `NULL`，系统不会在选票记录中保存用户身份；
- 因此系统可以在防止重复投票的同时，避免直接建立“用户 → 匿名选票 → 候选人”的映射关系。

---

### 4.3 `users`：用户表

用于保存系统登录账户。

| 字段 | 类型 | 允许为空 | 约束 | 说明 |
|---|---|---:|---|---|
| `id` | `BIGINT UNSIGNED` | 否 | PK, AUTO_INCREMENT | 用户 ID |
| `username` | `VARCHAR(50)` | 否 | UNIQUE | 登录用户名 |
| `password_hash` | `VARCHAR(255)` | 否 |  | 密码 Hash，不保存明文密码 |
| `display_name` | `VARCHAR(100)` | 否 |  | 用户显示名称 |
| `role` | `VARCHAR(20)` | 否 | CHECK | `ADMIN` / `USER` |
| `status` | `VARCHAR(20)` | 否 | CHECK | `ACTIVE` / `DISABLED` |
| `created_at` | `DATETIME` | 否 |  | 创建时间 |
| `updated_at` | `DATETIME` | 否 |  | 最后更新时间 |

设计说明：

- 系统角色仅描述系统级权限；
- 用户是否能够参与某场选举，不由 `role` 决定，而由 `election_voters` 决定；
- 候选人目前不要求拥有登录账户，因此候选人不直接存入 `users`；
- 密码只保存安全 Hash，禁止保存明文密码。

---

### 4.4 `elections`：选举表

保存每场选举的核心配置。

| 字段 | 类型 | 允许为空 | 约束 | 说明 |
|---|---|---:|---|---|
| `id` | `BIGINT UNSIGNED` | 否 | PK, AUTO_INCREMENT | 选举 ID |
| `title` | `VARCHAR(200)` | 否 |  | 选举标题 |
| `description` | `TEXT` | 是 |  | 选举说明 |
| `created_by` | `BIGINT UNSIGNED` | 否 | FK | 创建该选举的管理员 |
| `status` | `VARCHAR(20)` | 否 | CHECK | `DRAFT` / `OPEN` / `CLOSED` |
| `privacy_mode` | `VARCHAR(30)` | 否 | CHECK | 投票匿名策略 |
| `starts_at` | `DATETIME` | 否 |  | 投票开始时间 |
| `ends_at` | `DATETIME` | 否 | CHECK | 投票结束时间，必须晚于开始时间 |
| `results_published_at` | `DATETIME` | 是 |  | 结果发布时间；`NULL` 表示未发布 |
| `created_at` | `DATETIME` | 否 |  | 创建时间 |
| `updated_at` | `DATETIME` | 否 |  | 最后更新时间 |

#### 4.4.1 选举状态

首个 MVP 仅使用三个状态：

```text
DRAFT -> OPEN -> CLOSED
```

含义如下：

- `DRAFT`：选举仍处于配置阶段；
- `OPEN`：允许符合资格的用户提交选票；
- `CLOSED`：停止接收新选票。

结果是否已公开不额外增加 `PUBLISHED` 状态，而由 `results_published_at` 判断。

这样可以避免将“投票生命周期”和“结果发布状态”混在同一个状态字段中。

#### 4.4.2 投票匿名模式

`privacy_mode` 支持：

| 值 | 含义 |
|---|---|
| `FORCED_ANONYMOUS` | 所有选票必须匿名 |
| `OPTIONAL_ANONYMOUS` | 用户提交选票时可自行选择是否匿名 |
| `IDENTIFIED` | 所有选票必须实名 |

具体规则：

- `FORCED_ANONYMOUS`：`ballots.voter_id` 必须为 `NULL`；
- `OPTIONAL_ANONYMOUS`：由用户提交时决定是否保存 `voter_id`；
- `IDENTIFIED`：`ballots.voter_id` 必须保存当前用户 ID。

由于该规则需要同时读取 `elections.privacy_mode` 与 `ballots` 数据，属于跨表业务规则，最终由 Service Layer 强制校验。

---

### 4.5 `election_candidates`：候选人表

用于保存某场选举中的候选人。

| 字段 | 类型 | 允许为空 | 约束 | 说明 |
|---|---|---:|---|---|
| `id` | `BIGINT UNSIGNED` | 否 | PK, AUTO_INCREMENT | 候选人 ID |
| `election_id` | `BIGINT UNSIGNED` | 否 | FK | 所属选举 |
| `name` | `VARCHAR(100)` | 否 |  | 候选人名称 |
| `description` | `TEXT` | 是 |  | 候选人简介 |
| `photo_url` | `VARCHAR(500)` | 是 |  | 候选人图片 URL |
| `display_order` | `INT` | 否 |  | 前端显示顺序 |
| `created_at` | `DATETIME` | 否 |  | 创建时间 |
| `updated_at` | `DATETIME` | 否 |  | 最后更新时间 |

设计说明：

- 候选人属于某一场具体选举；
- 候选人不是必须登录系统的 Actor，因此不强制关联 `users`；
- 当前不对候选人姓名建立唯一约束，因为现实中可能存在同名候选人；
- Service Layer 必须禁止在选举已经开始后随意修改候选人集合；
- 如果候选人已经被某张选票选择，数据库外键应阻止直接删除该候选人。

---

### 4.6 `election_voters`：选民名册表

表示某个用户是否具有参加某场选举的资格。

| 字段 | 类型 | 允许为空 | 约束 | 说明 |
|---|---|---:|---|---|
| `election_id` | `BIGINT UNSIGNED` | 否 | PK, FK | 选举 ID |
| `user_id` | `BIGINT UNSIGNED` | 否 | PK, FK | 用户 ID |
| `created_at` | `DATETIME` | 否 |  | 加入名册时间 |

复合主键：

```text
PRIMARY KEY (election_id, user_id)
```

该约束保证：

> 同一个用户在同一场选举中最多只会出现一次。

判断投票资格时，Service Layer 查询：

```sql
SELECT 1
FROM election_voters
WHERE election_id = ?
  AND user_id = ?;
```

存在记录表示具备资格，否则表示无资格。

---

### 4.7 `vote_participation`：投票资格使用记录

用于记录用户是否已经使用某场选举的投票资格。

| 字段 | 类型 | 允许为空 | 约束 | 说明 |
|---|---|---:|---|---|
| `election_id` | `BIGINT UNSIGNED` | 否 | PK, FK | 选举 ID |
| `user_id` | `BIGINT UNSIGNED` | 否 | PK, FK | 用户 ID |
| `voted_at` | `DATETIME` | 否 |  | 投票时间 |

复合主键：

```text
PRIMARY KEY (election_id, user_id)
```

这是“一人一票”的最终数据库保护。

第一次投票时：

```sql
INSERT INTO vote_participation (election_id, user_id, voted_at)
VALUES (?, ?, ?);
```

如果同一个用户再次向同一个选举写入记录，将直接触发主键冲突。

因此：

- Service Layer 会先检查用户是否已经投票，用于返回明确的业务错误；
- 数据库主键负责防止并发条件下两个请求同时通过业务检查后产生重复投票；
- 不能只依赖 `SELECT` 后再 `INSERT` 的业务判断。

`vote_participation` 通过复合外键关联 `election_voters(election_id, user_id)`，因此只有位于选民名册中的用户才能产生投票参与记录。

---

### 4.8 `ballots`：选票表

每成功提交一次投票，就生成一张不可修改的选票。

| 字段 | 类型 | 允许为空 | 约束 | 说明 |
|---|---|---:|---|---|
| `id` | `BIGINT UNSIGNED` | 否 | PK, AUTO_INCREMENT | 选票 ID |
| `election_id` | `BIGINT UNSIGNED` | 否 | FK | 所属选举 |
| `voter_id` | `BIGINT UNSIGNED` | 是 | FK | 实名投票者；匿名时为 `NULL` |
| `is_anonymous` | `BOOLEAN` | 否 | CHECK | 是否匿名 |
| `submitted_at` | `DATETIME` | 否 |  | 提交时间 |

数据库必须保证：

```text
is_anonymous = TRUE  -> voter_id IS NULL
is_anonymous = FALSE -> voter_id IS NOT NULL
```

对应约束：

```sql
CHECK (
    (is_anonymous = TRUE AND voter_id IS NULL)
    OR
    (is_anonymous = FALSE AND voter_id IS NOT NULL)
)
```

同时建立：

```text
UNIQUE (election_id, voter_id)
```

该索引的作用是：

- 实名选票中，同一个用户不能在同一场选举中对应多张选票；
- MySQL 的 UNIQUE 索引允许存在多个 `NULL`，因此匿名选票仍可正常插入。

对于非匿名选票，`(election_id, voter_id)` 通过复合外键关联 `election_voters(election_id, user_id)`，保证实名选票中的用户确实具有该选举的投票资格。

> [!IMPORTANT]
>
> 匿名选票中不得保存能够直接恢复投票者身份的数据，例如 `voter_id`、用户名、学号等。
>
> `ballots.id` 也不得通过审计日志或其他业务表重新与匿名投票者建立映射，否则匿名设计将失去意义。

---

### 4.9 `ballot_choices`：选票选择表

用于保存每张选票最终选择的候选人。

| 字段 | 类型 | 允许为空 | 约束 | 说明 |
|---|---|---:|---|---|
| `id` | `BIGINT UNSIGNED` | 否 | PK, AUTO_INCREMENT | 记录 ID |
| `election_id` | `BIGINT UNSIGNED` | 否 | FK | 所属选举 |
| `ballot_id` | `BIGINT UNSIGNED` | 否 | FK, UNIQUE | 选票 ID |
| `candidate_id` | `BIGINT UNSIGNED` | 否 | FK | 候选人 ID |
| `created_at` | `DATETIME` | 否 |  | 创建时间 |

当前 MVP 为单选投票，因此建立：

```text
UNIQUE (ballot_id)
```

保证一张选票最多只能产生一条选择记录。

同时通过复合外键保证：

- `ballot_id` 对应的选票属于 `election_id`；
- `candidate_id` 对应的候选人也属于同一个 `election_id`。

因此数据库本身可以阻止：

> “Election A 的选票投给 Election B 的候选人”

这类跨选举脏数据。

如果未来支持多选，只需要取消 `UNIQUE (ballot_id)`，再由选举配置决定每张选票最多允许多少条 `ballot_choices`。

---

### 4.10 `audit_logs`：审计日志表

用于记录管理员及系统关键管理操作。

| 字段 | 类型 | 允许为空 | 约束 | 说明 |
|---|---|---:|---|---|
| `id` | `BIGINT UNSIGNED` | 否 | PK, AUTO_INCREMENT | 日志 ID |
| `actor_user_id` | `BIGINT UNSIGNED` | 是 | FK | 操作者；系统任务可为 `NULL` |
| `action` | `VARCHAR(100)` | 否 |  | 操作类型 |
| `resource_type` | `VARCHAR(50)` | 否 |  | 被操作资源类型 |
| `resource_id` | `BIGINT UNSIGNED` | 是 |  | 被操作资源 ID |
| `details` | `JSON` | 是 |  | 必要的附加信息 |
| `created_at` | `DATETIME` | 否 |  | 操作时间 |

典型日志：

```text
CREATE_ELECTION
UPDATE_ELECTION
OPEN_ELECTION
CLOSE_ELECTION
ADD_CANDIDATE
REMOVE_CANDIDATE
ADD_VOTER
REMOVE_VOTER
PUBLISH_RESULT
```

> [!ERROR] **禁止记录匿名选票身份映射**
>
> 审计日志可以记录“用户成功提交了一次投票”或系统级事件，但不得同时记录能够将某个用户与某张匿名选票、某个候选人关联起来的信息。
>
> 尤其禁止写入类似：
>
> ```text
> user_id = 123
> ballot_id = 456
> candidate_id = 8
> ```
>
> 否则即使 `ballots.voter_id` 为 `NULL`，系统仍然可以通过审计日志恢复匿名选票身份。

---

### 4.11 数据库初始化与 SQL 文件组织

架构文档只描述数据库设计，不直接嵌入完整建库 / 建表语句。

数据库相关 SQL 独立存放，建议目录结构如下：

```text
database/
    00_init_database.sql
    01_schema.sql
```

其中：

- `00_init_database.sql`
    - 创建项目专用数据库；
    - 创建项目专用数据库用户；
    - 为该用户授予运行时所需的最小权限。
- `01_schema.sql`
    - 创建所有业务表；
    - 创建主键、外键、唯一约束、CHECK 约束与索引。

初始化顺序：

```text
MySQL 管理员账户
    ↓
执行 00_init_database.sql
    ↓
创建 election_management_voting 数据库
    ↓
创建 election_app 专用数据库用户
    ↓
执行 01_schema.sql
    ↓
FastAPI 使用 election_app 连接数据库
```

> [!IMPORTANT]
>
> FastAPI 运行时禁止直接使用 MySQL `root` 或其他管理员账户连接数据库。
>
> 项目使用独立数据库用户：
>
> ```text
> election_app
> ```
>
> 该用户只获得应用运行所需权限，例如：
>
> ```text
> SELECT
> INSERT
> UPDATE
> DELETE
> ```
>
> `CREATE DATABASE`、`CREATE USER`、`GRANT`、建表以及后续数据库结构迁移，应由数据库管理员账户或专用 Migration 账户执行。
>
> 这样即使后端应用发生漏洞，也可以限制数据库账户能够执行的操作范围。

数据库名称统一为：

```text
election_management_voting
```

FastAPI 的数据库连接信息必须通过环境变量或配置文件注入，不得直接写死在代码中，例如：

```text
DB_HOST
DB_PORT
DB_NAME
DB_USER
DB_PASSWORD
```

密码、连接字符串等敏感信息不得提交到 Git 仓库。

如果开发环境使用 Docker，MySQL 可能无法通过 `localhost` 识别 FastAPI 容器，此时数据库用户的 Host 需要根据实际网络环境配置。

开发环境可以临时允许：

```text
'election_app'@'%'
```

但正式部署时应尽量限制为后端服务器、容器网络或明确允许的来源地址。

### 4.12 投票提交事务

一次成功投票不是一次单表写入，而是一个完整事务。

基本流程：

```text
检查用户身份
    ↓
检查选举存在
    ↓
检查选举状态为 OPEN
    ↓
检查当前时间处于 starts_at ~ ends_at
    ↓
检查用户存在于 election_voters
    ↓
检查候选人属于该 election
    ↓
检查 privacy_mode 与本次匿名选择是否合法
    ↓
BEGIN TRANSACTION
    ↓
INSERT vote_participation
    ↓
INSERT ballots
    ↓
INSERT ballot_choices
    ↓
COMMIT
```

如果其中任意一步失败：

```text
ROLLBACK
```

必须保证以下三类数据始终同时成功或同时失败：

1. 用户的投票资格已经被消耗；
2. 实际选票已经创建；
3. 选票选择已经保存。

例如，不允许出现：

```text
vote_participation 已写入
但是 ballots 写入失败
```

否则用户会被系统判定为“已经投票”，但实际上数据库中不存在有效选票。

#### 4.12.1 并发重复投票

即使两个请求几乎同时到达：

```text
Request A -> 查询：未投票
Request B -> 查询：未投票
```

最终只有一个请求能够成功插入：

```text
PRIMARY KEY (election_id, user_id)
```

第二个请求会因为主键冲突失败。

Repository / Service 应将该数据库冲突转换成明确的业务错误，例如：

```text
409 Conflict
ALREADY_VOTED
```

---

### 4.13 匿名投票数据流

#### 4.13.1 强制匿名

假设：

```text
user_id = 123
election_id = 1001
candidate_id = 8
```

成功投票后：

```text
vote_participation
--------------------------------
election_id | user_id
1001        | 123
```

```text
ballots
--------------------------------------------
id   | election_id | voter_id | is_anonymous
5001 | 1001        | NULL     | TRUE
```

```text
ballot_choices
--------------------------------------------
ballot_id | election_id | candidate_id
5001      | 1001        | 8
```

系统能够知道：

```text
用户 123 已经投过 Election 1001
```

也能够知道：

```text
Ballot 5001 选择了 Candidate 8
```

但数据库中不存在直接关系证明：

```text
用户 123 -> Ballot 5001
```

#### 4.13.2 可选匿名

如果用户选择匿名：

```text
ballots.voter_id = NULL
ballots.is_anonymous = TRUE
```

如果用户选择实名：

```text
ballots.voter_id = 当前用户 ID
ballots.is_anonymous = FALSE
```

#### 4.13.3 强制实名

`IDENTIFIED` 模式下：

```text
ballots.voter_id = 当前用户 ID
ballots.is_anonymous = FALSE
```

Service Layer 必须拒绝试图以匿名方式提交的请求。

---

### 4.14 计票与结果发布

当前 MVP **不单独建立 `results` 表**。

原因是结果可以从 `ballot_choices` 直接计算，如果同时保存一份 `results.vote_count`，就会产生两份可能不一致的数据来源。

例如：

```text
ballot_choices 实际有 52 票
results 表却保存 51 票
```

因此当前使用实时聚合：

```sql
SELECT
    c.id AS candidate_id,
    c.name,
    COUNT(bc.id) AS vote_count
FROM election_candidates c
LEFT JOIN ballot_choices bc
    ON bc.election_id = c.election_id
   AND bc.candidate_id = c.id
WHERE c.election_id = ?
GROUP BY c.id, c.name
ORDER BY
    vote_count DESC,
    c.display_order ASC,
    c.id ASC;
```

这样即使某个候选人为 `0` 票，也仍然会出现在结果中。

结果是否允许普通用户查看，由：

```text
elections.results_published_at
```

控制。

管理员可以在选举关闭后发布结果：

```text
results_published_at = 当前时间
```

普通用户读取结果时，Service Layer 必须检查该字段是否为空。

---

### 4.15 投票率统计

投票率不需要从 `ballots.voter_id` 计算，因为匿名票没有 `voter_id`。

总合资格选民数：

```sql
SELECT COUNT(*)
FROM election_voters
WHERE election_id = ?;
```

实际参与人数：

```sql
SELECT COUNT(*)
FROM vote_participation
WHERE election_id = ?;
```

投票率：

```text
participation_count / eligible_voter_count
```

这样匿名投票仍然能够准确统计参与人数，但不会暴露匿名选票内容与身份之间的关系。

---

### 4.16 数据修改与删除规则

数据库外键用于阻止明显破坏数据完整性的删除操作；具体是否允许操作，由 Service Layer 根据选举状态进一步判断。

基本规则如下：

| 数据 | `DRAFT` | `OPEN` | `CLOSED` |
|---|---|---|---|
| 修改选举基本信息 | 允许 | 原则上禁止关键规则修改 | 原则上禁止 |
| 新增 / 删除候选人 | 允许 | 禁止 | 禁止 |
| 修改选民名册 | 允许 | 原则上禁止或严格限制 | 禁止 |
| 修改已提交选票 | 不适用 | 禁止 | 禁止 |
| 删除已提交选票 | 不适用 | 禁止 | 禁止 |
| 修改 `vote_participation` | 不适用 | 禁止 | 禁止 |
| 发布结果 | 禁止 | 禁止 | 允许 |

对于已提交投票：

> `vote_participation`、`ballots`、`ballot_choices` 在正常业务流程中视为不可变数据。

Repository Layer 不应向普通业务代码提供随意修改或删除这些数据的方法。

---

### 4.17 索引策略

索引只针对实际查询路径建立，当前 MVP 主要包括：

| 表 | 索引 | 用途 |
|---|---|---|
| `users` | `UNIQUE(username)` | 登录时按用户名查询 |
| `elections` | `(status, starts_at, ends_at)` | 查询当前可参与选举 |
| `election_candidates` | `(election_id, display_order, id)` | 查询某选举候选人 |
| `election_voters` | PK `(election_id, user_id)` | 判断某用户是否有资格 |
| `election_voters` | `(user_id, election_id)` | 查询用户可参与的选举 |
| `vote_participation` | PK `(election_id, user_id)` | 防止重复投票 |
| `ballots` | `(election_id, submitted_at)` | 查询选举选票及统计 |
| `ballots` | `UNIQUE(election_id, voter_id)` | 防止实名票重复 |
| `ballot_choices` | `UNIQUE(ballot_id)` | 保证 MVP 单选 |
| `ballot_choices` | `(election_id, candidate_id)` | 计票 |
| `audit_logs` | `(actor_user_id, created_at)` | 查询用户操作日志 |
| `audit_logs` | `(resource_type, resource_id, created_at)` | 查询资源审计记录 |

禁止为了“以后可能有用”无目的地大量添加索引，因为每个索引都会增加写入成本和存储开销。

---

### 4.18 数据完整性分工

数据库约束与 Service Layer 的职责边界如下：

#### 数据库必须直接保证

- 主键唯一；
- 用户名唯一；
- 外键引用的数据存在；
- 同一用户不能重复加入同一选举名册；
- 同一用户不能重复消耗同一场选举的投票资格；
- 匿名选票不能保存 `voter_id`；
- 非匿名选票必须保存 `voter_id`；
- 当前 MVP 一张选票只能选择一个候选人；
- 选票和候选人必须属于同一场选举；
- 结束时间晚于开始时间。

#### Service Layer 必须保证

- 只有管理员能够创建或修改选举；
- 只有 `OPEN` 状态才能投票；
- 当前时间必须位于允许投票的时间范围内；
- 用户必须处于启用状态；
- 用户必须具有当前选举投票资格；
- 候选人必须可被当前选举选择；
- `privacy_mode` 与本次匿名选择匹配；
- `CLOSED` 后禁止修改候选人、名册或选票；
- 结果只有满足发布条件后才能公开；
- 审计日志不得泄露匿名选票身份映射。

数据库负责“最后一道结构性保护”，Service Layer 负责完整业务语义，两者不能互相替代。

---

### 4.19 数据库命名规范

统一采用以下规则：

```text
表名：snake_case + 复数
users
elections
election_candidates

字段名：snake_case
created_at
election_id
results_published_at

主键：
id

普通外键：
<resource>_id

布尔值：
is_<state>
```

数据库、后端 ORM Model、Repository 中的命名应尽量保持一致，避免同一个字段在不同层使用完全不同的名称。

---

### 4.20 Migration 与初始化数据

所有数据库结构修改必须进入版本控制。

允许使用：

```text
Alembic Migration
```

或：

```text
按版本编号管理的 SQL Migration 文件
```

例如：

```text
migrations/
    001_create_users.sql
    002_create_elections.sql
    003_create_voting_tables.sql
```

禁止：

```text
成员 A 本地手动 ALTER TABLE
成员 B 不知道发生过修改
CI / Demo 环境也没有对应变更
```

开发和测试环境需要提供可重复执行的初始化方式。

测试数据可以通过独立 Seed 脚本生成，但 Seed 数据不得混入正式 Migration 中。

---

### 4.21 当前数据库设计边界

当前结构只针对首个 MVP：

- 单选；
- 一人一票；
- 管理员 / 普通用户；
- 候选人不要求登录；
- 支持强制匿名、可选匿名和强制实名；
- 结果在投票关闭后发布；
- 不支持撤回或修改已经提交的选票。

以下能力暂不在本版本数据库中实现：

- 多选；
- 排序投票；
- 加权投票；
- 多轮选举；
- 投票撤回；
- 同一用户多次合法投票；
- 复杂 RBAC；
- 结果快照；
- 分库分表；
- 数据仓库或独立分析库。

如果后续需求发生变化，应通过新的 Migration 演进数据库结构，而不是为了预留所有未来功能而提前增加大量无实际用途的字段和表。
