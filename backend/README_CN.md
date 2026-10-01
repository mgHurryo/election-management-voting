# 后端基础框架

[English](README.md) / 简体中文

本次是架构 v0.2 / SRS v0.1 的**第一阶段框架实现，不是完整投票 MVP**。
只注册已经实现并有测试的接口，选举、候选人、名册、投票和结果接口没有模拟成功返回。

## 已完成

- FastAPI 应用工厂、生命周期、`/api/v1` 路由和开发环境 OpenAPI。
- API → Service → Repository 分层；统一装配依赖，Service 控制事务，Repository 不提交事务。
- 环境配置校验、独立 MySQL 应用账号、连接池、UTC 会话与连接释放。
- 复用原有八张表，运行时和初始化脚本共用一份 ORM 模型，不修改数据库结构、不在启动时建表。
- 统一成功 / 错误响应、脱敏校验错误、404 / 405 / 500、请求字段白名单、精确 CORS 来源和禁止缓存。
- bcrypt cost 12、默认 60 分钟 JWT、每次请求重新检查账号状态和角色。

| 接口 | 权限 | 状态 |
| --- | --- | --- |
| `POST /api/v1/auth/login` | 公开，JSON 用户名与密码 | 已实现 |
| `GET /api/v1/auth/me` | Bearer 令牌，账号必须保持 ACTIVE | 已实现 |
| `GET /health/live` | 运维探针，不访问数据库 | 已实现 |
| `GET /health/ready` | 运维探针，执行数据库 SELECT 1 | 已实现 |
| API 文档其余 18 个操作 | 尚未注册 | 后续实现 |

健康检查是 `/api/v1` 之外的运维扩展。ready 只验证数据库连接，不能证明表结构、迁移或投票可用。
数据库不可用时返回脱敏的 `503 SERVICE_UNAVAILABLE`。

## 本地运行

需要 Python 3.12+、uv，以及准备好的 MySQL/InnoDB 数据库。在本目录运行：

```powershell
uv sync --locked
Copy-Item .env.example .env
uv run python -c "import secrets; print(secrets.token_urlsafe(48))"
```

编辑 `.env`：填写应用数据库密码、至少 32 字节的随机 JWT Secret 和一个精确的
`FRONTEND_ORIGIN`（不要末尾斜杠）。程序会拒绝占位密码、空密码和 `DB_USER=root`。
`.env` 路径固定相对于后端目录，系统环境变量优先；运行时不要求、也不使用管理员凭据。
不要提交 `.env`，不要把真实凭据写入测试。

仅在**获授权的新数据库**上，填写管理员初始化配置后执行：

```powershell
uv run python database/init/00_init_database.py
uv run python database/init/01_init_schema.py
```

原有脚本路径保持不变。`create_all` 只能初始化基线，不能替代已有数据库的迁移。
账号由获授权的部署 / seed 流程准备，启动时不创建默认账号；seed 应调用
`app.core.security.hash_password`。ADR-009 要求至少 8 个字符、最多 72 个 UTF-8 字节、
至少一个字母和数字，不修剪密码。登录验证已有散列，不重新套用新账号复杂度规则。

```powershell
uv run uvicorn app.main:create_app --factory --host 127.0.0.1 --port 8000 --no-access-log
```

开发环境提供 `/docs` 和 `/openapi.json`，`APP_ENV=production` 时禁用。
没有可用 MySQL 时仍可启动并访问 live / 文档，但 ready 和身份接口需要数据库。
Ctrl+C 停止服务。不要启用 SQL echo、请求正文 / Token 日志或代理查询参数日志。
公开部署前还需要 TLS 和部署层登录限流；本次不实现限流和前端 Token 存储。

## 测试与构建

```powershell
uv run ruff check .
uv run ruff format --check .
uv run pytest --cov=app --cov-report=term-missing
uv build
```

快速身份模块集成测试仅在 SQLite 上创建 users 表，**不能替代 MySQL 锁、投票并发和匿名存储验证**。
DDL 快照核对八张 MySQL 表及索引与框架实施前 `1153335` 提交一致。

真实 MySQL 测试必须显式使用名称以 `_test` 结尾的**空的一次性数据库**；测试会创建并移除这八张表：

```powershell
$env:TEST_MYSQL_URL = 'mysql+pymysql://test_user:<URL编码后的密码>@127.0.0.1:3306/election_test?charset=utf8mb4'
uv run pytest -m mysql
```

未设置时三个 MySQL 测试明确跳过，不算验证成功。新增 CI 使用独立 MySQL 服务执行完整测试、
lint 和构建，不关闭原有检查。当前锁定 Starlette 的 TestClient 对 httpx 发出弃用警告，
保留该提示，不屏蔽或误报为测试失败。

## 后续开发顺序

1. 选举与候选人：创建、初始名单原子写入、查询、DRAFT 编辑、开启 / 关闭。
2. 选民名册：ACTIVE USER 校验，投票额度固定为 1。
3. 投票：选举行锁、资格 / 时间 / 额度校验、匿名选票与参与记录原子提交。
4. 结果：CLOSED 计票、公布权限；平票和零票处理需先确认 API D-06。

每个模块先补 schemas / service / repository 与测试，再接入 `app/api/router.py`，
不要为了补齐文档目录就发布占位接口。目录职责见英文说明中的 Code map。
数据库保留的多票和非强制匿名模式不属于 v1。ADR-009 已确定的认证策略优先于 API D-08 的旧表述。
