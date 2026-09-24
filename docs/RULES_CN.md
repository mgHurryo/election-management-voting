## Git 分支规范

[English](../RULES.md) / 简体中文

### `master`
- 受保护，**禁止直接 push**
- 所有修改必须通过 **PR** 进入
- 禁止删除、禁止 `git push --force`
- 不强制线性历史
- PR 合并前必须通过：
  - Build
  - Tests
  - 必要的静态分析 / Qodana / 安全检查
- CI 失败不得通过关闭门禁绕过
- 不允许自动合并 PR
- `master` 应始终保持可构建、可测试状态

### Task Branch
命名：

```text
<type>/<ticket-id>-<short-description>
```

常用类型：

```text
feature fix hotfix refactor performance
prompt agent tool skill eval security docs experiment chore
```

规则：
- 每个任务独立分支，完成后不复用
- 从最新 `master` 创建
- 同步主分支优先：

```bash
git fetch origin
git rebase origin/master
```

- 任务分支需要改写远程历史时，只允许：

```bash
git push --force-with-lease
```

- 禁止：

```bash
git push --force
```

- 修改保持最小 Scope，不混入无关重构
- 完成后提交 PR → `master`

### `release`
- 受保护，**禁止直接 push**
- **只接受来自 `master` 的 PR**
- 不允许 feature / fix 分支直接进入 `release`
- 合并前再次执行完整 Build、Test、质量和安全门禁
- `release` 应代表准备发布的稳定状态

流程：

```text
Task Branch
    ↓ PR
master
    ↓ PR
release
    ↓
tag
    ↓
GitHub Release
```

### Tag / Release
- Tag 只能基于已经通过门禁的 `release` 提交
- 使用 annotated tag
- 版本遵循 SemVer：

```text
v2.4.1
```

- Tag 构建通过后才能创建 GitHub Release
- 同一个版本号不得对应不同代码

### Commit
- 实际修改仓库后必须 Commit
- 一个 Commit 一个明确目标
- 不包含无关修改
- 格式：

```text
<type>(<scope>): <description>

<body>
```

- 标题英文、简洁、现在时
- Body 必须说明：
  - What changed
  - Why
  - 原问题
  - 解决方案
  - 测试情况
  - 必要时说明风险 / 兼容性 / 迁移

### PR
- 必须可审查、可测试、可回滚
- 至少说明：
  - 修改目标
  - 修改内容
  - 不包含内容
  - 风险
  - 行为变化
  - 验证方式
  - 安全 / 性能影响
  - 发布方式
  - 回滚方式

一句话概括就是：

```text
Task Branch 随便施工
        ↓
PR + CI
        ↓
master 保持稳定
        ↓
PR + 完整门禁
        ↓
release 保持可发布
        ↓
tag → GitHub Release
```