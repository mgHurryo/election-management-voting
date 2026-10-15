# 前端协作交接说明（持续更新）

本文件说明现有代码如何连接各前端页面，不替代 API.md 或后端生成的 OpenAPI。
接口函数存在不等于服务已实现。字段和规则以仓库需求及双方确认的 API 契约为准。
以下为当前本地 FE-03 分支状态；队友须先获得对应提交才能使用新组件。

## 1. 页面地址与职责

| 页面       | 现有地址                  | 当前状态 / 边界                                  |
| ---------- | ------------------------- | ------------------------------------------------ |
| 登录       | /login                    | 已有；复用身份状态，不再创建另一套登录机制       |
| 选举列表   | /elections                | A 已实现 UI、筛选、分页，真实联调待完成          |
| 创建选举   | /elections/new            | A 已实现；创建选举与初始名册，成功到详情         |
| 选举详情   | /elections/:id            | A 已实现；只读候选人、管理员开启/关闭及模块入口  |
| 编辑选举   | /elections/:id/edit       | A 待完成；不承担名册维护                         |
| 候选人管理 | /elections/:id/candidates | 队友模块；主分支当前仍占位，具体负责人由团队确认 |
| 选民名册   | /elections/:id/voters     | 队友模块；创建后的查询/添加/移除，不创建用户账号 |
| 投票       | /elections/:id/vote       | 队友模块；选择并提交，与只读候选人介绍分开       |
| 结果       | /elections/:id/results    | 队友模块；计票展示与发布，不在详情页自行计票     |

:id 是选举 ID。页面用 useParams() 获取；始终当字符串处理，不能 Number(id)。
从详情进入名册的例子：/elections/1001/voters。目标页面必须支持直接打开和刷新，
不能依赖上一页在内存里传入资料。返回入口使用 /elections/1001。
所有正式业务页面保留现有 RequireAuth；管理页面保留 RequireRole ADMIN。

## 2. 直接复用已有接口函数

统一从 src/api/index.ts 导出的 api 调用。下面路径均省略 /api/v1 前缀，
前缀由现有 client/config 负责；不要在调用处重复加前缀。
组件不直接发 HTTP，页面使用 Hook，Hook 调用 api。

| 模块   | 函数                                        | 请求 / 返回                                                |
| ------ | ------------------------------------------- | ---------------------------------------------------------- |
| 选举   | api.elections({page, page_size, status})    | GET /elections；{data: Election[], meta}                   |
| 选举   | api.election(id)                            | GET /elections/{id}；{data: Election}                      |
| 选举   | api.createElection(input)                   | POST /elections；{data: Election}                          |
| 选举   | api.updateElection(id, patch)               | PATCH /elections/{id}；{data: Election}                    |
| 状态   | api.openElection(id), api.closeElection(id) | POST /open 或 /close，无正文；{data: Election}             |
| 候选人 | api.candidates(id, page)                    | GET /elections/{id}/candidates；{data: Candidate[], meta}  |
| 候选人 | api.addCandidate(id, input)                 | POST candidates；{data: Candidate}                         |
| 候选人 | api.updateCandidate(id, candidateId, patch) | PATCH 指定候选人；{data: Candidate}                        |
| 候选人 | api.deleteCandidate(id, candidateId)        | DELETE 指定候选人；204，无正文                             |
| 名册   | api.voters(id, page)                        | GET /elections/{id}/voters；{data: Voter[], meta}          |
| 名册   | api.addVoter(id, userId)                    | POST voters；函数自动构造 {user_id: userId}；{data: Voter} |
| 名册   | api.removeVoter(id, userId)                 | DELETE voters/{userId}；204，无正文                        |
| 投票   | api.ballot(id)                              | GET /ballot；{data: Ballot}                                |
| 投票   | api.participation(id)                       | GET /participation；{data: Participation}                  |
| 投票   | api.vote(id, candidateId)                   | POST /votes；{data: {election_id, accepted: true}}         |
| 结果   | api.results(id), api.publishResults(id)     | GET /results、POST /results/publish；{data: Result}        |

详细类型见 src/api/types.ts。Token、超时、错误封装由 client.ts 处理；
使用 errorMessage(error) 或 ErrorState 显示安全提示。不要自己重新存储密码或模拟身份。

## 3. A 与名册模块的交接

创建接口需要非空且不重复的 voter_ids，全部是已有 ACTIVE USER 的 ID。
A 的创建页填写初始 ID 并调用创建接口，后端原子创建选举和初始名册。
创建成功后 A 导航到详情，管理员从“选民名册”进入队友页面继续维护。
名册页无需再创建选举，也不能假设名册初始为空。后端提供真实账号 ID。
目前没有用户搜索、账号创建、文件导入接口，不自行加这些业务功能。
编辑选举的 ElectionPatch 不含 voter_ids，名册变化只经名册接口。

## 4. 可共用的代码

| 文件                                            | 用法                                                                                  |
| ----------------------------------------------- | ------------------------------------------------------------------------------------- |
| src/hooks/useAuth.ts                            | 获取真实当前用户和登录/退出状态                                                       |
| src/components/AsyncState.tsx                   | LoadingState、ErrorState（支持手动重试）                                              |
| src/components/elections/CandidateProfile.tsx   | <CandidateProfile candidate={candidate} />；只读照片/姓名/职位/简介；列表使用稳定 key |
| src/components/elections/ElectionListView.tsx   | 展示列表；正式页面由 useElections 提供数据                                            |
| src/components/elections/ElectionDetailView.tsx | 详情展示；状态操作由 Hook 注入                                                        |
| src/components/elections/ElectionCreateForm.tsx | 创建表单；正式/预览共用，编辑是否复用待后续实现                                       |
| src/shared/electionForm.ts                      | 创建参数校验、字符串 ID 检查、本地时间转换                                            |

不要在业务 Hook 中引入 src/dev 的示例数据。不要在各自页面重新创建公共导航。
修改 AppRoutes.tsx、公共布局、全局样式或依赖前，先与另外两人协调。

## 5. 必须共同遵守

- 状态只有 DRAFT / OPEN / CLOSED，是否发布看 results_published_at。
- 候选人资料：ADMIN 任意状态；USER 需 OPEN、时间窗内且合资格，后端最终判断。
- 创建超时不证明失败；先查询核对，不自动重复 POST。
- 投票不自动重试；结果不明按既有 API 契约查询 participation，不能回显原选择。
- 未发布结果不给普通用户；平票/零票规则仍须依据最终确认的契约。
- 照片为可选 HTTPS 链接，当前不实现上传；简介纯文字渲染。
- 前端隐藏按钮不代替后端权限，演示预览也不证明真实联调通过。

## 6. 预览与待办

npm run dev 后，使用终端显示的本地地址：

- /__preview/elections：列表与筛选/分页。
- /__preview/elections/1001：详情及虚构候选人介绍。
- /__preview/elections/new：创建表单校验与模拟提交，不保存。

这些路由只在开发模式存在，正式页面仍需真实账号及后端。
当前后续工作：A 的编辑页、各队友业务页、真实账号/状态数据准备、接口联调、
团队确认公共样式、最终补齐本文档的负责人/提交/已验证服务版本。
尚未实现的页面不能标记为已交付。本文档会随剩余开发继续更新。
