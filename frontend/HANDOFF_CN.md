# A 部分前端交接：做了什么、代码在哪、队友怎么接

更新时间：2026-10-16。本文是本次 A 部分唯一的综合交接文件，不另分组长版和开发版。

**当前结果：选举列表、详情、创建、编辑四页的前端实现已完成，真实后端联调尚未完成。**
代码位于本地 `feature/FE-04-edit-election`，包含此前 FE-01、FE-02、FE-03 的提交。
功能提交截至 `690451d`；尚未将本次四页代码推送到 GitHub，也未创建 PR 或合并 master。
本文档更新属于说明整理，不代表新增业务功能。

## 1. 先理解这次交付了什么

原仓库已经有 React 工程、公共导航、登录表单、登录状态、页面地址和接口封装。
选举相关地址原来显示“后续实现”的占位内容。本次把其中四个地址接到了真实前端页面：

| 页面     | 正式地址              | 本次实现                                                                          | 没有承担的功能                               |
| -------- | --------------------- | --------------------------------------------------------------------------------- | -------------------------------------------- |
| 选举列表 | `/elections`          | 表格、状态筛选、分页、管理员创建入口、详情入口、加载/空/失败提示                  | 不新增关键词搜索或删除选举                   |
| 选举详情 | `/elections/:id`      | 名称、职位、说明、时间、状态、只读候选人、候选人分页、开启/关闭确认、其他模块入口 | 不做候选人增删改，不在此投票、计票或发布结果 |
| 创建选举 | `/elections/new`      | 基本字段和初始选民 ID、校验、调用创建接口，成功后进入详情                         | 不创建用户账号，不添加候选人，不直接开启投票 |
| 编辑选举 | `/elections/:id/edit` | 独立载入草稿、预填、校验、只提交改动字段，成功后返回详情                          | 不改名册、候选人、状态、创建者或发布时间     |

另外新增了四页的开发预览，用虚构资料看效果，不代替真实接口；新增自动化测试和本文档。
候选人管理、名册维护、投票和结果页的占位内容仍留给其他模块，本次没有实现它们。
具体人员由团队确认；本文不代替团队分配任务。

### 一次页面操作实际经过哪些代码

```text
访问 /elections/1001
        ↓
AppRoutes.tsx 找到 ElectionDetailPage，并保留登录保护
        ↓
useElectionDetail 调用原有 api.election('1001')、api.candidates('1001', page)
        ↓
原有 client.ts 向后端发送 HTTP 请求
        ↓
ElectionDetailView / CandidateProfile 显示返回的数据
```

页面地址用于打开页面，后端接口用于取数据或保存；两者不是同一种“接口”。
本次没有另建一套后端 API，也没有重写原有请求客户端。

## 2. 哪些是新增，哪些是修改，哪些没有动

对照主分支基线 `b2c11e9`，本次共新增 30 个文件、修改 3 个原有文件。
以下代码路径除根 README 外，均相对于 `frontend/`。

### 修改的 3 个原有文件

| 文件                       | 修改内容                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------ |
| 仓库根目录 `README.md`     | 更新前端实现状态，链接本文档                                                               |
| `README.md`（前端目录）    | 更新启动、预览、验证范围和未完成事项                                                       |
| `src/routes/AppRoutes.tsx` | 四个正式地址由占位内容改为新页面；新增仅开发可用的预览地址；保留原有访问保护及队友模块占位 |

### 新增的 30 个文件

| 用途                 | 文件                                                                                                                                                                      | 队友通常需要关注什么                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| 四个页面，4 个       | `src/pages/ElectionListPage.tsx`、`ElectionDetailPage.tsx`、`CreateElectionPage.tsx`、`EditElectionPage.tsx`                                                              | 页面入口、跳转和组件组合                          |
| 数据/操作逻辑，4 个  | `src/hooks/useElections.ts`、`useElectionDetail.ts`、`useCreateElection.ts`、`useEditElection.ts`                                                                         | 查询、翻页、保存、失败处理、丢弃过期响应          |
| 展示与表单组件，6 个 | `src/components/elections/ElectionListView.tsx`、`ElectionDetailView.tsx`、`CandidateProfile.tsx`、`ElectionCreateForm.tsx`、`ElectionEditForm.tsx`、`ElectionFields.tsx` | 其中候选人只读卡片可复用；基础字段由创建/编辑共用 |
| 页面样式，3 个       | 同目录 `ElectionListView.css`、`ElectionDetailView.css`、`ElectionCreateForm.css`                                                                                         | 使用原有颜色变量，不重新定义全局导航和全站样式    |
| 字段处理，2 个       | `src/shared/electionForm.ts`、`electionPatch.ts`                                                                                                                          | 创建/编辑校验、本地时间转换、只构造改动字段       |
| 开发预览与示例，5 个 | `src/dev/ElectionListPreview.tsx`、`ElectionDetailPreview.tsx`、`CreateElectionPreview.tsx`、`EditElectionPreview.tsx`、`electionExamples.ts`                             | 只供开发；正式业务不要引入示例数据                |
| 测试，5 个           | `src/pages/` 下四个对应的 `*.test.tsx`，以及 `src/dev/ElectionListPreview.test.tsx`                                                                                       | 验证功能和页面连接，不是业务界面                  |
| 综合说明，1 个       | `HANDOFF_CN.md`                                                                                                                                                           | 本文件                                            |

**未改动：** 需求/架构/API/Future Work/协作规则及其中文版本、后端、数据库、
`src/api/index.ts`、`src/api/client.ts`、`src/api/types.ts`、登录状态及路由保护、
`package.json`、依赖锁文件、原全局样式。没有增加依赖或改变原接口路径和类型。

## 3. 与原有文档和别人代码的关系

| 依据                                                | 本次如何使用                                                                                              |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| [需求 SRS](../docs/requirements/REQUIREMENTS_CN.md) | FR-01/02 对应创建与配置；FR-06 对应角色入口；FR-13 对应开启/关闭。只读介绍不等于完成 FR-03 全部候选人管理 |
| [架构](../docs/architecture/ARCHITECTURE_CN.md)     | 页面/组件负责界面，Hook 组织查询和操作，HTTP 仍经原有 API 层，前端不连接数据库                            |
| [API 契约](../docs/api/API_CN.md)                   | 4.3–4.9 对应列表、创建、详情、修改、开启、关闭、候选人查询；使用现有字段、分页和错误码                    |
| [Future Work](../docs/future/FUTURE_CN.md)          | 没加入多职位、多选、复杂投票规则、实时票数、导出等扩展                                                    |
| [仓库规则](../RULES.md)                             | 使用任务分支和本地提交；推送后应经 PR 和检查进入 master，不直接推送 master                                |

API 仍是草案，不把待评审项伪装成最终决定。特别是创建时非空初始 `voter_ids` 来自
当前 API D-03；ID/时间/长度等约定对应 D-01。实际部署契约需前后端共同核对。
布局、按钮位置、确认提示和开发预览是本次实现选择，不是需求文件逐字规定的界面。

2026-10-16 核对远端：master 基线为 `b2c11e9`，不是只有文档的空项目。
已有其他贡献者的合并记录，例如：

- [PR #15：前端框架](https://github.com/mgHurryo/election-management-voting/pull/15)：路由、身份状态和请求工具等基础。
- [PR #22：M1 登录页](https://github.com/mgHurryo/election-management-voting/pull/22)：本次复用，没有重写。
- [PR #14：后端基础](https://github.com/mgHurryo/election-management-voting/pull/14)。
- [PR #23：M2 名册后端](https://github.com/mgHurryo/election-management-voting/pull/23)：已合入 master。
- [PR #8：数据库初始化](https://github.com/mgHurryo/election-management-voting/pull/8)。

上述是历史参考链接，不是本次交付的 PR。PR 关闭不一定表示合并；这些例子已核对合并状态。
后端代码可在 `backend/app/` 查看，初始化代码在 `backend/database/init/`，CI 在 `.github/workflows/`。
前端 API 函数齐全不表示后端全部业务接口已可调用；实现范围参阅后端 README 并以实际联调为准。

## 4. 别人怎样获得代码、查看输出

### 先获得代码，再运行

目前本次代码仅在开发者电脑上。**单独发这份 md 只能看说明，不能让对方运行尚未获得的代码。**
后续应先推送自己的功能分支并创建 PR，队友查看该 PR；通过评审合并后再同步 master。
需要提前试用时可检出已发布的功能分支，先保存自己的工作，避免覆盖本地未提交修改。
不要逐个复制覆盖文件，也不要把本机 `node_modules`、`.env.local` 或 `dist` 当源代码交付。
本次整理文档不代表已获上传或合并授权，尚未执行推送。

取得对应代码后，Node.js 要求为 22.12+，在仓库根目录执行：

```powershell
cd frontend
npm ci
# 仅首次、本地配置尚不存在时复制；已有配置不要覆盖
Copy-Item .env.example .env.local
npm run dev
```

打开终端打印的本地网址。`127.0.0.1` 指查看者自己的电脑，不是一个已部署的网站；
把开发者的 localhost 链接发给队友，不会让对方直接看到开发者电脑中的页面。

### 两种查看方式

| 正式页面              | 不依赖后端的开发预览             |
| --------------------- | -------------------------------- |
| `/elections`          | `/__preview/elections`           |
| `/elections/:id`      | `/__preview/elections/1001`      |
| `/elections/new`      | `/__preview/elections/new`       |
| `/elections/:id/edit` | `/__preview/elections/1001/edit` |

正式页面保留登录和角色保护，需要真实后端、账号和数据。
预览仅在 `npm run dev` 中存在，共用正式界面，但数据是虚构的；正式构建不包含预览入口和示例模块。
模拟创建/编辑只展示本次校验或待提交内容，不保存，也不更新预览列表/详情。
开启/关闭预览只显示说明；不能据此声称完成端到端业务验证。
预览不创建账号、Token 或真实选举。普通用户和权限失败通过测试验证，不在预览中冒充真实登录。

## 5. 队友实际接代码需要的信息

### 5.1 页面之间如何连接

| 从 A 详情页进入 | 目标地址                    | 对方页面要做什么                           |
| --------------- | --------------------------- | ------------------------------------------ |
| 候选人管理      | `/elections/:id/candidates` | ADMIN，独立查询本场候选人并增删改          |
| 选民名册        | `/elections/:id/voters`     | ADMIN，查询并维护本场已有账号资格          |
| 投票            | `/elections/:id/vote`       | USER，向后端校验资格、时间、额度后处理投票 |
| 结果            | `/elections/:id/results`    | ADMIN 关闭后查看/发布；USER 查看已发布结果 |

这些正式地址已经预留。队友新增自己的页面后，替换对应占位内容，保留外层保护；
不要改 A 的四个路由，也不要再新增另一份路由文件。公共路由修改应先协调。

目标页面用 `useParams()` 取得 `id`，例如 `/elections/1001/voters` 中是字符串 `'1001'`。
**不能 `Number(id)`。** 直接打开或刷新也应能加载，不依赖上一页的内存对象或 location.state。
返回详情用 `/elections/${encodeURIComponent(id)}`。保存候选人/名册后，对方刷新自己列表；
再次进入详情时 A 会重新查询，无需新增跨页面全局状态或回调协议。

### 5.2 后端调用封装是原有的，不是本次新造的

入口为 [src/api/index.ts](src/api/index.ts)，类型在 [src/api/types.ts](src/api/types.ts)。
Hook 中 `import { api } from '../api'`，组件不直接写 fetch。client 负责 `/api/v1` 前缀、
Token、超时和错误；不要重复拼接前缀，也不要另存密码或手工伪造登录状态。

| 队友模块        | 已有函数                                                                     | 返回                                                  |
| --------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------- |
| 名册查询        | `api.voters(id, page)`                                                       | `{ data: Voter[], meta: { page, page_size, total } }` |
| 添加选民        | `api.addVoter(id, userId)`                                                   | `{ data: Voter }`，函数构造 `{ user_id: userId }`     |
| 移除选民        | `api.removeVoter(id, userId)`                                                | 204，无正文，不要再读 `.data`                         |
| 候选人查询      | `api.candidates(id, page)`                                                   | `{ data: Candidate[], meta }`                         |
| 候选人新增/修改 | `api.addCandidate(id, input)`、`api.updateCandidate(id, candidateId, patch)` | `{ data: Candidate }`                                 |
| 候选人删除      | `api.deleteCandidate(id, candidateId)`                                       | 204，无正文                                           |
| 选票/参与状态   | `api.ballot(id)`、`api.participation(id)`                                    | `{ data: Ballot }`、`{ data: Participation }`         |
| 投票            | `api.vote(id, candidateId)`                                                  | `{ data: { election_id, accepted: true } }`           |
| 结果            | `api.results(id)`、`api.publishResults(id)`                                  | `{ data: Result }`                                    |

A 使用的也都是原有封装：`elections`、`election`、`createElection`、`updateElection`、
`openElection`、`closeElection`、`candidates`。完整请求方法、路径、字段和权限见 API 文档，
本文件不重复维护第二份接口规范。

### 5.3 与名册、候选人的具体边界

- 创建页提交非空且不重复的初始 `voter_ids`；后端应原子创建选举和名册。队友的名册页不能假设初始为空。
- 后续增删资格走名册接口；编辑选举不包含 `voter_ids`。账号 ID 由后端的预置数据流程提供。
- 当前没有用户搜索、注册、文件导入接口，不为了界面自行增加这些需求。
- A 详情页只读展示候选人；候选人管理页负责增删改，投票页负责选择并提交。
- 候选人查询权限不等于详情可见权限：ADMIN 任意状态可读；USER 须 OPEN、在时间窗内且合资格，后端最终决定。

### 5.4 哪些组件可复用

既有公共代码：`useAuth()`、`LoadingState`、`ErrorState` 和 `errorMessage(error)`。
本次新增的 `CandidateProfile` 可供候选人展示/投票页面使用：

```tsx
// 相对于 src/pages 下的页面文件
import { CandidateProfile } from '../components/elections/CandidateProfile'

// candidate 为 API 返回的 Candidate；按候选人及照片提供稳定 key
;<CandidateProfile key={`${candidate.id}/${candidate.photo_url}`} candidate={candidate} />
```

该组件只展示可选 HTTPS 照片、姓名、职位、纯文本简介；无照片或加载失败有提示。
没有投票按钮或增删改逻辑。业务行为仍由对方页面/Hook 实现。
创建/编辑共用 `ElectionFields` 和字段校验；队友不需要修改它们来实现名册或投票。
不要将 `src/dev/` 示例、开发预览状态接到真实业务中。

### 5.5 协作前需注意的约定

- 状态只有 `DRAFT / OPEN / CLOSED`，发布看 `results_published_at`，不新造 PUBLISHED 状态。
- 数据库大整数 ID 保持字符串；时间输入按浏览器时区、请求按 UTC 秒精度处理。
- 创建超时先查询核对，投票不自动重试；不要记录用户与投票选择的对应关系。
- 只在 Hook/API 层组织通信；隐藏按钮不代替后端授权。
- 公共布局、路由、全局样式、依赖或接口类型修改前先协调，避免覆盖他人改动。
- 目前样式沿用仓库变量，队友尚未确认统一设计，不能宣称已达成全组 UI 共识。

## 6. 已验证什么、尚缺什么

已运行：全套 72 项前端测试通过，包含身份保护、分页/筛选、候选人权限提示、
创建/编辑校验、字符串 ID、时区转换、空修改、重复提交、超时处理和过期响应等。
构建（含类型检查）、lint、格式和 diff 检查通过。测试使用模拟响应，不证明后端实际可用。

侧边栏实际操作确认：列表翻页和草稿筛选、创建必填/重复 ID 提示、模拟创建成功及 UTC 转换、
候选人介绍、未改动不提交、编辑预览成功。操作中日期控件使用实际分段键盘输入完成，
自动填日期工具的失败不当作表单成功。模拟演示不保存记录，也没有实际调用状态写接口。

尚未完成：

1. 真实后端接口、管理员/普通用户账号、不同选举状态数据的联调。
2. API 草案项的团队确认，例如 D-03 初始名册等；不由前端自行修改业务规则。
3. 队友的候选人管理、名册、投票和结果页；并非 A 四页完成就等于全系统完成。
4. 团队对公共样式和页面连接的确认、代码审查、CI、发布部署和课程验收。
5. 当前本地代码的上传及 PR。具备仓库写权限时推送功能分支；无写权限时按团队流程用 Fork，
   不把文件直接覆盖到 master，也不通过网页逐个上传替代分支/PR。

队友取得代码后，先读本文，再打开自己要接的路由和 `src/api/index.ts`，按第 5 节衔接即可。
