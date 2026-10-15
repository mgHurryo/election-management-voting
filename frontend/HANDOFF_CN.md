# A 部分前端交接：做了什么、文件在哪、队友怎么使用

更新时间：2026-10-16。

**本次完成选举列表、选举详情、创建选举、编辑草稿选举四页的前端实现；真实后端联调尚未完成。**
完整代码在 `feature/FE-04-edit-election` 分支中，包含 FE-01、FE-02、FE-03 的成果，不必来回切换分支。练习分支不属于本次交付。
功能分支已发布到 GitHub；PR 编号和最新审查、合并状态请以仓库 Pull requests 页面为准。

本文是一份统一交接说明：既解释本次做了什么，也提供其他前端接代码时需要的页面地址、接口用法和预览步骤。

## 1. 先看本次交付了哪些页面

| 页面     | 正式地址              | 已实现功能                                                        | 其他模块继续负责                             |
| -------- | --------------------- | ----------------------------------------------------------------- | -------------------------------------------- |
| 选举列表 | `/elections`          | 列表、状态筛选、分页、加载/空/失败提示、详情入口、管理员创建入口  | 未新增搜索和删除选举                         |
| 选举详情 | `/elections/:id`      | 基本信息、只读候选人介绍及分页、管理员开启/关闭确认、其他模块入口 | 候选人增删改、名册维护、投票、计票和发布结果 |
| 创建选举 | `/elections/new`      | 名称、职位、说明、起止时间、初始选民 ID；校验并提交，成功进入详情 | 不创建用户、不添加候选人、不直接开启投票     |
| 编辑选举 | `/elections/:id/edit` | 独立加载草稿、预填、校验、仅提交修改字段，成功返回详情            | 不修改名册、候选人和选举状态                 |

列表和详情需要登录；创建和编辑需要 ADMIN。编辑只允许 DRAFT 状态。
候选人管理、选民名册、投票、结果页仍有原有占位内容，不能把入口存在理解成这些页面已完成。
具体由谁负责，需要团队确认。

### 一次操作怎样经过代码

```text
浏览器打开 /elections/1001
        ↓
AppRoutes.tsx 把这个地址对应到 ElectionDetailPage
        ↓
useElectionDetail 调用原有 api.election('1001') 等函数
        ↓
原有 API 请求工具向后端取数据
        ↓
ElectionDetailView 和 CandidateProfile 显示数据
```

页面地址用来打开页面；后端接口用来读取、保存数据。例如页面 `/elections/1001` 与请求 `GET /api/v1/elections/1001` 用途不同。
前后端通过接口字段和选举 ID 对接；前端不直接连接数据库。

## 2. 文件放在哪里，新增和修改了什么

相对本次开发起点 `b2c11e9`，共新增 **30 个文件**、修改 **3 个原有文件**。下面使用仓库内路径，GitHub 和本地目录结构相同。

```text
election-management-voting/
├─ README.md
└─ frontend/
   ├─ README.md
   ├─ HANDOFF_CN.md                本文
   └─ src/
      ├─ pages/                   四个页面及测试
      ├─ components/elections/    展示组件、表单和样式
      ├─ hooks/                   查询、创建、编辑等操作逻辑
      ├─ shared/                  校验和修改字段处理
      ├─ dev/                     开发预览、虚构数据及预览测试
      └─ routes/AppRoutes.tsx     页面地址对应表
```

文件先出现在功能分支的相同位置；PR 合并后才进入 `master`。不用新建“我的前端”文件夹，也不要逐个复制文件覆盖队友代码。

### 修改的 3 个原有文件

| 仓库内位置                          | 改了什么                                                               |
| ----------------------------------- | ---------------------------------------------------------------------- |
| `README.md`                         | 更新整体前端进度，增加交接说明入口                                     |
| `frontend/README.md`                | 更新运行、预览、验证和实现范围说明                                     |
| `frontend/src/routes/AppRoutes.tsx` | 四个占位页面换成实际页面；新增开发预览入口；保留权限保护和其他模块占位 |

### 新增 1 份说明

[frontend/HANDOFF_CN.md](HANDOFF_CN.md)，即本文。

### 新增 4 个页面文件

以下文件在 `frontend/src/pages/`：

| 文件                     | 用途       |
| ------------------------ | ---------- |
| `ElectionListPage.tsx`   | 列表页入口 |
| `ElectionDetailPage.tsx` | 详情页入口 |
| `CreateElectionPage.tsx` | 创建页入口 |
| `EditElectionPage.tsx`   | 编辑页入口 |

### 新增 4 个操作逻辑文件

以下文件在 `frontend/src/hooks/`：

| 文件                   | 用途                                         |
| ---------------------- | -------------------------------------------- |
| `useElections.ts`      | 列表查询、筛选、分页、重试                   |
| `useElectionDetail.ts` | 详情、候选人查询，以及开启/关闭操作          |
| `useCreateElection.ts` | 创建请求、避免重复提交、处理失败或结果不明确 |
| `useEditElection.ts`   | 加载草稿、提交修改、处理状态冲突和失败       |

### 新增 6 个界面组件、3 个样式文件

以下文件在 `frontend/src/components/elections/`：

| 文件                     | 用途                                       |
| ------------------------ | ------------------------------------------ |
| `ElectionListView.tsx`   | 列表、筛选和分页界面                       |
| `ElectionDetailView.tsx` | 详情、候选人区域及其他模块入口             |
| `CandidateProfile.tsx`   | 单个候选人的照片、姓名、职位和简介，可复用 |
| `ElectionCreateForm.tsx` | 创建表单                                   |
| `ElectionEditForm.tsx`   | 编辑表单                                   |
| `ElectionFields.tsx`     | 创建和编辑共用的基础输入框                 |
| `ElectionListView.css`   | 列表样式                                   |
| `ElectionDetailView.css` | 详情及候选人卡片样式                       |
| `ElectionCreateForm.css` | 创建和编辑共用的表单样式                   |

### 新增 2 个字段处理文件

以下文件在 `frontend/src/shared/`：

| 文件               | 用途                                                |
| ------------------ | --------------------------------------------------- |
| `electionForm.ts`  | 校验字段、时间、初始选民 ID，把本地时间转成请求时间 |
| `electionPatch.ts` | 预填编辑资料，仅整理实际修改的字段                  |

### 新增 5 个开发预览文件

以下文件在 `frontend/src/dev/`：

| 文件                        | 用途                 |
| --------------------------- | -------------------- |
| `ElectionListPreview.tsx`   | 列表预览             |
| `ElectionDetailPreview.tsx` | 详情预览             |
| `CreateElectionPreview.tsx` | 模拟创建             |
| `EditElectionPreview.tsx`   | 模拟编辑             |
| `electionExamples.ts`       | 虚构选举、候选人数据 |

### 新增 5 个测试文件

- `frontend/src/pages/ElectionListPage.test.tsx`
- `frontend/src/pages/ElectionDetailPage.test.tsx`
- `frontend/src/pages/CreateElectionPage.test.tsx`
- `frontend/src/pages/EditElectionPage.test.tsx`
- `frontend/src/dev/ElectionListPreview.test.tsx`

**未修改：** 原有 API 封装、类型、登录与路由保护、全局样式、依赖配置与锁文件、需求/架构/API/Future Work 文档、后端和数据库。
`node_modules`、`.env.local`、`dist` 是本地依赖、配置或构建产物，不作为本次源代码交付。

## 3. 如果我是另一个前端，先看什么

不需要读完所有新增文件才能开始。建议按这个顺序：

| 顺序 | 文件                                                                              | 看什么                             |
| ---- | --------------------------------------------------------------------------------- | ---------------------------------- |
| 1    | 本文第 4–6 节                                                                     | 路由、ID、接口、复用组件及职责边界 |
| 2    | [src/routes/AppRoutes.tsx](src/routes/AppRoutes.tsx)                              | 自己模块的占位地址和外层角色保护   |
| 3    | [ElectionDetailView.tsx](src/components/elections/ElectionDetailView.tsx)         | 用户从哪个按钮进入自己的模块       |
| 4    | 原有 [src/api/index.ts](src/api/index.ts) 和 [src/api/types.ts](src/api/types.ts) | 可调用函数、请求字段和返回类型     |

| 自己负责的部分 | 重点衔接                                                 |
| -------------- | -------------------------------------------------------- |
| 选民名册       | 详情页“选民名册”入口；用现有名册接口查询、添加、移除     |
| 候选人管理     | 详情页管理入口；候选人增删改由自己实现；只读卡片可复用   |
| 投票           | 详情页投票入口；读取选票、资格和额度；自己实现选择与提交 |
| 结果           | 详情页结果入口；自己实现票数展示和管理员发布             |

不需要调用 A 的列表、创建或编辑 Hook，也不需要读取 A 的虚构预览数据。双方通过选举 ID 和后端数据衔接。

## 4. 页面如何连接：选民名册举例

```text
选举详情 /elections/1001
        ↓ 点击“选民名册”
名册页面 /elections/1001/voters
        ↓ 从网址读取字符串 ID：'1001'
api.voters('1001', 1) 查询名册
        ↓ 在自己的页面完成添加、移除和刷新
返回 /elections/1001
```

其他模块已经预留这些正式地址：

| 功能       | 地址                        | 访问与实现要点                                                            |
| ---------- | --------------------------- | ------------------------------------------------------------------------- |
| 候选人管理 | `/elections/:id/candidates` | ADMIN；独立加载并管理本场候选人                                           |
| 选民名册   | `/elections/:id/voters`     | ADMIN；维护已有账号的参选资格                                             |
| 投票       | `/elections/:id/vote`       | USER；后端校验资格、时间和投票额度                                        |
| 结果       | `/elections/:id/results`    | 已登录；管理员关闭后查看/发布，普通用户查看已发布结果，具体权限由后端执行 |

队友完成页面后，在现有 `AppRoutes.tsx` 替换对应占位内容，保留外层保护。修改公共路由前先协调，避免覆盖彼此的改动。

在 `src/pages/` 下的页面可这样读取 ID：

```tsx
import { useParams } from 'react-router'
import { api } from '../api'

// 在 React 页面组件内：
const { id } = useParams()
// id 有可能不存在，应先检查。确认存在后，在自己的 Hook/查询逻辑中调用：
// const response = await api.voters(id, 1)
// response.data 是名册数组，response.meta 是分页信息。
```

- ID 保持字符串，不使用 `Number(id)`，避免数据库大整数精度丢失。
- 页面直接打开、刷新时也应能独立加载，不依赖上一页传来的内存对象。
- 返回详情地址为 `/elections/${encodeURIComponent(id)}`，使用前先确认 `id` 存在。
- 名册/候选人管理页操作后刷新自己的列表；再次进入详情时 A 会重新查询，不需要新增跨页面回调协议。
- 预览环境不代表其他模块已实现，检查连接时请区分正式业务地址与开发预览地址。

## 5. 接口速查：调用哪些函数、传什么、拿到什么

### 5.1 先看共用规则

**以下都是仓库原有接口封装，本次没有新造接口。** 方法与路径依据 `src/api/index.ts`，字段依据 `src/api/types.ts`；完整业务权限、错误码和待评审项见 [API 契约](../docs/api/API_CN.md)。
函数存在不等于后端接口已经实现，仍需实际联调。本节是使用速查，变更接口时应同步原契约与类型，不能只改本文。

- 页面/Hook 中导入 `api`，不重复写请求工具。
- 默认请求前缀是 `/api/v1`，下面表格中的路径省略了这个前缀。
- `client.ts` 已处理 Token、JSON、超时和错误；不要重复拼接前缀或手动伪造登录状态。
- 单项响应为 `{ data: 对象 }`；列表为 `{ data: 数组, meta: { page, page_size, total } }`。
- 删除成功为 HTTP 204，无正文，不要读取返回值的 `.data`。
- 下表 `id` 为选举 ID，`candidateId` 为候选人 ID，`userId` 为账号 ID，全部是字符串。

### 5.2 A 四页已经使用的接口

| 操作       | 函数                                         | HTTP 路径                          | 结果                 |
| ---------- | -------------------------------------------- | ---------------------------------- | -------------------- |
| 列表       | `api.elections({ page, page_size, status })` | GET `/elections`，参数放查询字符串 | 分页 `Election[]`    |
| 详情       | `api.election(id)`                           | GET `/elections/:id`               | `{ data: Election }` |
| 创建       | `api.createElection(input)`                  | POST `/elections`                  | `{ data: Election }` |
| 修改草稿   | `api.updateElection(id, patch)`              | PATCH `/elections/:id`             | `{ data: Election }` |
| 开启       | `api.openElection(id)`                       | POST `/elections/:id/open`         | `{ data: Election }` |
| 关闭       | `api.closeElection(id)`                      | POST `/elections/:id/close`        | `{ data: Election }` |
| 只读候选人 | `api.candidates(id, page)`                   | GET `/elections/:id/candidates`    | 分页 `Candidate[]`   |

列表参数均可省略；`status` 使用 `DRAFT / OPEN / CLOSED`。

创建字段 `ElectionInput`：

| 字段                    | 类型                   | 当前前端处理                                    |
| ----------------------- | ---------------------- | ----------------------------------------------- |
| `title`                 | string                 | 必填，1–200 字符                                |
| `position_title`        | string                 | 必填，1–100 字符；一场选举一个职位              |
| `description`           | string 或 null，可省略 | 最多 10000 字符；可为空                         |
| `starts_at` / `ends_at` | string                 | 本地日期时间输入转 UTC 秒精度时间；开始早于结束 |
| `voter_ids`             | string[]               | 非空、不重复的正整数账号 ID；不创建账号         |

编辑参数 `ElectionPatch` 只包含上述基础字段中实际改变的部分，**不包含 `voter_ids`**。清空说明发送 `description: null`，没有改动不发送 PATCH。
创建初始非空名册来自当前 API 草案 D-03，字段/ID/时间约定对应 D-01，需团队确认最终契约。

### 5.3 名册、候选人、投票、结果模块使用的接口

| 操作         | 函数                                          | HTTP 路径                                       | 结果/请求说明                                                                              |
| ------------ | --------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 名册查询     | `api.voters(id, page)`                        | GET `/elections/:id/voters`                     | 分页 `Voter[]`，默认第 1 页，每页 20                                                       |
| 添加选民     | `api.addVoter(id, userId)`                    | POST `/elections/:id/voters`                    | 封装发送 `{ user_id: userId }`，返回 `{ data: Voter }`                                     |
| 移除选民     | `api.removeVoter(id, userId)`                 | DELETE `/elections/:id/voters/:userId`          | 204，无正文                                                                                |
| 候选人查询   | `api.candidates(id, page)`                    | GET `/elections/:id/candidates`                 | 分页 `Candidate[]`，默认第 1 页，每页 20                                                   |
| 添加候选人   | `api.addCandidate(id, input)`                 | POST `/elections/:id/candidates`                | `{ data: Candidate }`                                                                      |
| 修改候选人   | `api.updateCandidate(id, candidateId, patch)` | PATCH `/elections/:id/candidates/:candidateId`  | `{ data: Candidate }`                                                                      |
| 删除候选人   | `api.deleteCandidate(id, candidateId)`        | DELETE `/elections/:id/candidates/:candidateId` | 204，无正文                                                                                |
| 读取选票     | `api.ballot(id)`                              | GET `/elections/:id/ballot`                     | `{ data: Ballot }`，含选举、候选人和参与状态                                               |
| 读取参与状态 | `api.participation(id)`                       | GET `/elections/:id/participation`              | `{ data: Participation }`                                                                  |
| 投票         | `api.vote(id, candidateId)`                   | POST `/elections/:id/votes`                     | 封装发送 `{ candidate_id: candidateId }`；返回 `{ data: { election_id, accepted: true } }` |
| 读取结果     | `api.results(id)`                             | GET `/elections/:id/results`                    | `{ data: Result }`                                                                         |
| 发布结果     | `api.publishResults(id)`                      | POST `/elections/:id/results/publish`           | `{ data: Result }`                                                                         |

候选人新增输入 `CandidateInput` 为 `name`、`description`，以及可选 `photo_url`（string/null）、`display_order`（number）。修改输入是这些字段的部分集合。
候选人返回对象里有 `position_title`，但现有新增输入类型没有这个字段，不应自行发送额外的职位字段。

常用返回数据：

| 类型            | 主要字段                                                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Election`      | `id, title, position_title, description, status, starts_at, ends_at, results_published_at`，另含创建者、隐私模式、时间戳                         |
| `Candidate`     | `id, election_id, name, position_title, description, photo_url, display_order`，另含时间戳                                                       |
| `Voter`         | `election_id, user_id, display_name, vote_quota`，另含时间戳；当前名额为 1                                                                       |
| `Participation` | `election_id, eligible, vote_quota, used_votes, remaining_votes`                                                                                 |
| `Ballot`        | `election, candidates, participation`                                                                                                            |
| `Result`        | `election_id, position_title, results_published_at, total_votes, candidates, winner_candidate_id`；候选人结果含 `candidate_id, name, vote_count` |

### 5.4 查询名册的最小调用示例

```ts
// 相对于 src/hooks 下的文件；这是调用示例，不是完整页面。
import { api } from '../api'

async function loadVoters(electionId: string, page = 1) {
  const response = await api.voters(electionId, page)
  return { voters: response.data, total: response.meta.total }
}

// 添加：await api.addVoter(electionId, userId)
// 移除：await api.removeVoter(electionId, userId)
// 成功后重新查询当前列表，更新自己的界面。
```

完整页面还需处理加载、空列表、失败重试、重复点击和切换 ID 时的过期响应；不能只复制这个函数就视为完成。
错误工具为原有 `ApiError`（`code/status/details`）及 `errorMessage(error)`。权限失败应显示失败提示，不应伪装成“没有数据”。写入超时可能已经成功，先核对状态，不自动重复创建或投票。

## 6. 哪些可以共用，哪些需要先沟通

### 可复用的候选人卡片

在 `src/pages/` 下的页面中：

```tsx
import { CandidateProfile } from '../components/elections/CandidateProfile'

// 放在 JSX 内；candidate 是 API 返回的 Candidate：
// <CandidateProfile key={`${candidate.id}/${candidate.photo_url}`} candidate={candidate} />
```

卡片只展示照片、姓名、职位、纯文本简介；照片使用 HTTPS，缺少或加载失败有提示。
不包含选择、投票、编辑、删除逻辑，这些由对应页面实现。
原有 `useAuth()`、`LoadingState`、`ErrorState` 和 `errorMessage(error)` 也可复用。
创建/编辑共用的 `ElectionFields` 不需要为了名册或投票而修改。

### 与其他模块的边界

- 创建页已经发送初始选民名单，名册页不能假设名单为空；后续资格增删走名册接口。
- 当前没有用户搜索、注册、文件导入接口；账号来自后端预置流程，不自行增加这些功能。
- 详情页只读展示候选人；管理页负责增删改，投票页负责选择并提交。
- ADMIN 可在各状态查询候选人；USER 查询受 OPEN 状态、时间窗和资格限制，后端最终决定。详情能打开不等于候选人必定可读。
- 状态为 `DRAFT / OPEN / CLOSED`，结果是否发布看 `results_published_at`，不增加 `PUBLISHED` 状态。
- ADMIN 不投票；匿名投票不记录“用户对应哪个选择”的关系。
- 公共路由、布局、全局样式、依赖、API 类型需要修改时先协调。当前沿用仓库样式变量，尚不代表全组已确认统一设计。
- `src/dev/` 是预览专用，不能把里面的虚构数据当真实业务数据。

## 7. 队友如何看页面效果

### 第一步：取得包含本次成果的代码

在 GitHub Desktop 中 Fetch origin，然后选择 `feature/FE-04-edit-election`。如果本地有自己的未提交工作，先保存到自己的分支再切换。
PR 合并后也可以拉取包含这些改动的 `master`；尚未合并时，只拉取旧 master 看不到这四页成果。
单独拿到本文、PR 截图或本机网址不能运行项目，需要完整代码。

### 第二步：安装与启动

需要 Node.js 22.12+。在仓库根目录打开终端：

```powershell
cd frontend
npm ci
```

首次运行且没有 `.env.local` 时，把 `.env.example` 复制一份并命名为 `.env.local`；已有配置不要覆盖。
然后运行：

```powershell
npm run dev
```

保持终端运行，用终端显示的本地地址打开页面。

### 第三步：打开模拟数据预览

默认端口为 5173；若终端给出其他端口，请替换地址中的端口。

| 页面             | 可在自己的电脑打开的地址                              |
| ---------------- | ----------------------------------------------------- |
| 列表             | `http://localhost:5173/__preview/elections`           |
| 详情及候选人介绍 | `http://localhost:5173/__preview/elections/1001`      |
| 创建             | `http://localhost:5173/__preview/elections/new`       |
| 编辑             | `http://localhost:5173/__preview/elections/1001/edit` |

**预览不需要后端或真实登录，使用虚构数据。** 模拟创建/编辑显示校验或待提交内容，不会保存到数据库，也不会更新预览列表和详情；开启/关闭只展示说明。
预览入口仅在开发模式存在，正式生产构建不包含这些入口和示例模块。

GitHub 保存代码和 PR，不会因此自动生成在线网站。`localhost` 或 `127.0.0.1` 指查看者自己的电脑，不能把开发者的网址直接发给队友当成在线预览。

正式业务页面使用第 1 节的地址，需要启动真实后端、准备有效账号及数据；模拟预览成功不代表真实业务已跑通。

## 8. 本次与原有资料的关系

| 原有资料                                            | 本次如何使用                                                                                             |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| [需求 SRS](../docs/requirements/REQUIREMENTS_CN.md) | FR-01/02 对应创建和配置，FR-06 对应角色入口，FR-13 对应开启/关闭；只读候选人介绍不等于完成全部候选人管理 |
| [架构](../docs/architecture/ARCHITECTURE_CN.md)     | 沿用页面/组件、Hook 和 API 层的组织方式                                                                  |
| [API 契约](../docs/api/API_CN.md)                   | 4.3–4.9 为 A 使用的主要接口；草案中的待评审项仍需确认                                                    |
| [Future Work](../docs/future/FUTURE_CN.md)          | 没有加入多职位、多选、实时票数、导出等扩展                                                               |
| [协作规则](../RULES.md)                             | 功能分支提交，经 PR 和检查后合并 master                                                                  |

原仓库已有前端框架、登录、请求封装、后端基础和名册等代码，本次在其上开发，没有重写整个项目。
例如历史 [PR #15](https://github.com/mgHurryo/election-management-voting/pull/15) 是前端框架，[PR #22](https://github.com/mgHurryo/election-management-voting/pull/22) 是登录页，[PR #23](https://github.com/mgHurryo/election-management-voting/pull/23) 是名册后端。
后端实际实现范围以当前代码及联调为准，不能根据前端封装齐全就判断所有后端接口已可用。

## 9. 已验证什么，后续还要做什么

本次四页实现阶段已完成：72 项前端测试通过，构建（含类型检查）、Lint 和格式检查通过。
测试覆盖筛选/分页、权限、候选人展示、创建/编辑校验、字符串 ID、时间转换、空修改、重复提交和部分失败场景。
已用模拟数据检查页面及部分交互；没有执行真实后端端到端验证。
这些是本次实现阶段的验证记录，不代替以后代码变更后的检查或 GitHub CI 状态。

后续事项：

1. 与后端核对接口实现、错误响应、测试账号和不同状态数据，完成真实联调。
2. 团队确认 API 草案待评审项，尤其创建时的初始名册约定；业务规则不由前端单方面决定。
3. 队友实现候选人管理、名册、投票和结果页，并检查与详情页的连接。
4. 确认公共样式、代码审查和 CI，之后由团队决定合并、部署与验收。

### 本文以后修改，PR 怎样更新

```text
保存本地文件
    ↓ 只改变自己电脑里的文件
Commit 提交到同一个功能分支
    ↓ 形成新的本地提交
Push origin 推送该分支
    ↓ GitHub 更新远端分支
仍打开且来源为该分支的 PR 自动显示新提交和最新文件内容
```

仅保存文件不会更新 GitHub；不需要为同一个仍打开的 PR 反复创建新 PR。
如果原 PR 已经合并或关闭，后续修改需要按团队流程判断是否新建 PR，不会自动改写已经合并的 master 内容。
