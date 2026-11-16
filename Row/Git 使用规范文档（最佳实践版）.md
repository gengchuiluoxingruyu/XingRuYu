---
title: "Git 团队协作规范"
source: "https://juejin.cn/post/7572841327294906420"
author:
  - "[[想搞艺术的程序员]]"
published: 2025-11-17
created: 2026-11-16
description: "一份基于 Git Flow 与 Conventional Commits 的团队 Git 协作规范，涵盖分支管理、提交信息格式、功能开发/紧急修复/发布流程、代码审查与合并方式、语义化版本与标签、冲突处理及 commitlint/husky/CI 自动化配置，并附常见问题解决方案。"
tags:
  - "clippings"
---
## 目录

1. 前言
2. 分支管理规范
3. 提交信息规范
4. 团队协作流程
5. 代码合并与版本管理
6. 冲突处理规范
7. 工具与自动化配置
8. 常见问题与解决方案
9. 附则

## 1\. 前言

Git 作为分布式版本控制系统，其高效性依赖于团队统一的操作规范。本规范基于行业最佳实践（如 Git Flow、Conventional Commits），结合团队协作场景优化，旨在解决以下问题：

- 分支混乱导致的版本追溯困难
- 提交信息模糊引发的历史理解成本高
- 协作中冲突频发、代码覆盖风险
- 发布流程不规范导致的生产环境稳定性问题

**执行原则** ：规范不是约束，而是协作共识，需团队全员遵守并定期迭代优化。

## 2\. 分支管理规范

采用 **“主分支 + 支持分支”** 的分层模型，明确各分支的职责、生命周期及命名规则，避免分支冗余。

### 2.1 分支类型与定义

| 分支类型 | 命名规则 | 来源分支 | 合并目标分支 | 生命周期 | 核心职责 |
| --- | --- | --- | --- | --- | --- |
| 主分支 | `main` | 项目初始化 | 仅接收 `hotfix` / `release` | 永久存在 | 存放生产环境代码，始终保持可部署状态 |
| 开发主分支 | `develop` | 从 `main` 创建 | 接收 `feature` ，合并到 `release` | 永久存在 | 整合功能开发代码，作为下一次发布的基础 |
| 功能分支 | `feature/[需求ID]-[功能描述]` | `develop` | 仅合并到 `develop` | 功能合并后删除 | 开发新功能或迭代优化，隔离开发过程 |
| 紧急修复分支 | `hotfix/[BUG ID]-[修复描述]` | `main` | 合并到 `main` + `develop` | 修复完成后删除 | 紧急修复生产环境 bug，不影响正常开发流程 |
| 发布分支 | `release/[版本号]` | `develop` | 合并到 `main` + `develop` | 发布完成后删除 | 预发布测试，仅修复测试中发现的 bug，不新增功能 |
| 测试分支（可选） | `test/[测试场景]-[日期]` | 任意开发分支 | 不合并到主分支 | 测试完成后删除 | 临时测试特定场景（如性能测试、兼容性测试） |

### 2.2 命名规范细则

- **需求 ID/BUG ID** ：必须关联团队需求管理工具（如 Jira、Teambition）的唯一 ID，便于追溯（例： `REQ-2024001` 、 `BUG-2024058` ）。
- **功能描述** ：使用小写字母 + 连字符，不超过 5 个单词，清晰表达核心内容（例： `user-login-verify` 而非 `login` ）。
- **版本号** ：遵循语义化版本（见 5.1 节），格式为 `vX.Y.Z` （例： `release/v2.3.0` ）。

### 2.3 分支保护规则

- `main` 和 `develop` 分支设置为 **保护分支** ，禁止直接推送（ `git push` ），仅允许通过 PR 合并。
- 保护分支需启用 **强制代码审查** （至少 1 名审查人通过）和 **CI 检查通过** 才能合并。
- 功能分支、hotfix 分支等临时分支，由创建者负责维护，合并后需及时删除（远程 + 本地）。

## 3\. 提交信息规范

提交信息是代码历史的 “说明书”，需遵循 **Conventional Commits 规范** ，确保结构化、可追溯，支持自动化工具生成 CHANGELOG。

### 3.1 提交格式模板

```bash
代码解读复制代码<类型>[可选作用域]: <简短描述>

[可选详细描述]

[可选脚注]
```

### 3.2 各部分说明

| 组成部分 | 要求与说明 |
| --- | --- |
| **类型** （必填） | 描述提交的性质，取值范围：   \- `feat` ：新功能（影响次版本号）   \- `fix` ：修复 bug（影响修订号）   \- `docs` ：仅文档修改（如 README）   \- `style` ：代码格式调整（不影响逻辑，如缩进、空格）   \- `refactor` ：代码重构（既非新功能也非修复）   \- `test` ：新增 / 修改测试代码   \- `chore` ：构建流程、工具配置等修改（不影响业务代码） |
| **作用域** （可选） | 标注修改涉及的模块 / 组件（如 `auth` 、 `order-api` 、 `pay-service` ），增强定位精度。 |
| **简短描述** （必填） | 50 字以内，简洁说明 “做了什么”，首字母小写，不使用句号结尾（例：“新增短信验证码校验”）。 |
| **详细描述** （可选） | 若简短描述不够，补充具体修改点（如 “优化了验证码过期逻辑，从 5 分钟调整为 10 分钟”），换行后开始。 |
| **脚注** （可选） | 关联需求 / BUG ID 或关闭 Issue，格式：   \- 关联需求： `Relates to REQ-2024001`   \- 关闭 BUG： `Closes BUG-2024058`   \- 关闭 Issue： `Fixes #123` （GitLab Issue） |

### 3.3 提交示例

```bash
代码解读复制代码# 新功能提交
feat(auth): 新增短信验证码登录功能

- 开发验证码发送接口（支持60秒重试限制）
- 完善登录状态校验逻辑（过期自动登出）
Relates to REQ-2024001

# Bug修复提交
fix(order): 修复订单超时后状态未同步的问题

解决了支付超时后，订单仍显示"待支付"的问题（原逻辑未监听支付回调超时事件）
Closes BUG-2024058

# 重构提交
refactor(pay): 拆分支付服务冗余代码

将支付验签逻辑抽离为独立工具类，减少重复代码约200行
```

### 3.4 提交要求

- **单次提交粒度** ：一个提交对应一个独立变更（如 “完成登录按钮 UI”、“修复验证码校验 bug”），避免 “大杂烩” 提交（禁止一次提交包含多个不相关功能）。
- **提交前检查** ：本地执行代码格式化（如 `prettier` ）、 lint 检查（如 `eslint` ）、单元测试，确保无语法错误和逻辑问题。
- **禁止提交的内容** ：敏感信息（密钥、密码）、编译产物（如 `dist` 、 `node_modules` ）、IDE 配置（如`.idea` ，需加入`.gitignore` ）。

## 4\. 团队协作流程

### 4.1 功能开发流程（标准流程）

#### 步骤 1：准备分支

```bash
代码解读复制代码# 1. 切换到develop分支，拉取最新代码
git checkout develop
git pull origin develop

# 2. 基于最新develop创建功能分支（命名见2.2节）
git checkout -b feature/REQ-2024001-user-login
```

#### 步骤 2：本地开发与提交

- 按 “小步提交” 原则，完成一个子功能即提交（如 “完成验证码输入框 UI”→“完成验证码发送逻辑”）。
- 提交信息严格遵循 3.1 节格式。

#### 步骤 3：同步远程代码（每日至少 1 次）

为避免分支偏离 `develop` 过远导致冲突，需定期同步：

```bash
代码解读复制代码# 切换到功能分支
git checkout feature/REQ-2024001-user-login

# 同步develop最新代码（推荐使用rebase保持线性历史）
git fetch origin develop
git rebase origin/develop

# 若出现冲突，解决后继续rebase
git add .
git rebase --continue

# 推送更新到远程功能分支（首次推送需关联，后续直接push）
git push -u origin feature/REQ-2024001-user-login  # 首次
git push origin feature/REQ-2024001-user-login      # 后续
```

#### 步骤 4：发起 PR（Pull Request）

- 在代码管理平台（GitLab）创建 PR，目标分支为 `develop` 。
- PR 标题格式： `[feature] 功能名称（需求ID）` （例： `[feature] 用户登录功能（REQ-2024001）` ）。
- PR 描述模板（必填）：
	```markdown
	代码解读复制代码## 功能说明  
	（简要描述实现的功能，关联需求文档链接）  
	## 测试步骤  
	1. 步骤1（如：访问登录页）  
	2. 步骤2（如：输入手机号点击发送验证码）  
	## 变更范围  
	- 修改文件：（列举核心修改文件）  
	- 新增依赖：（如有）  
	## 相关链接  
	- 需求地址：[REQ-2024001](链接)  
	- 测试报告：（如有）
	```

#### 步骤 5：代码审查与合并

- 至少指定 1 名团队成员作为审查人（建议交叉审查，避免自我审查）。
- 审查重点：
	- 代码逻辑是否符合需求
		- 代码风格是否符合团队规范（命名、注释、格式）
		- 测试用例是否覆盖核心场景
		- 是否引入性能隐患或安全风险
- 审查通过且 CI 检查（编译、测试、lint）通过后，使用 **Squash Merge** 合并（将功能分支的多个提交压缩为 1 个，保持 `develop` 历史整洁）。

#### 步骤 6：清理分支

合并后删除远程和本地功能分支：

```bash
代码解读复制代码# 删除远程分支
git push origin --delete feature/REQ-2024001-user-login

# 删除本地分支
git checkout develop
git pull origin develop  # 同步合并后的develop
git branch -d feature/REQ-2024001-user-login
```

### 4.2 生产环境紧急修复流程

用于修复 `main` 分支（生产环境）的紧急 bug，需同时确保修复同步到开发分支。

#### 步骤 1：创建 hotfix 分支

```bash
代码解读复制代码# 从main分支拉取最新代码（生产环境代码）
git checkout main
git pull origin main

# 创建hotfix分支
git checkout -b hotfix/BUG-2024058-order-timeout
```

#### 步骤 2：修复与提交

- 仅提交与 bug 修复相关的代码，禁止新增功能。
- 提交信息类型为 `fix` ，并关联 BUG ID。

#### 步骤 3：发起 PR 并合并

- 同时创建两个 PR：目标分支分别为 `main` （修复生产）和 `develop` （同步到开发）。
- PR 标题格式： `[hotfix] 修复描述（BUG ID）` 。
- 合并方式：使用 **Create a merge commit** （保留完整修复历史，便于追溯）。

#### 步骤 4：打版本标签并清理分支

合并到 `main` 后，立即打版本标签（见 5.2 节），并删除 hotfix 分支。

### 4.3 发布流程

用于将 `develop` 分支的功能发布到生产环境。

#### 步骤 1：创建 release 分支

```bash
代码解读复制代码# 从develop拉取最新代码
git checkout develop
git pull origin develop

# 创建release分支（版本号见5.1节）
git checkout -b release/v2.3.0
```

#### 步骤 2：预发布准备

- 仅修复测试中发现的 bug，不新增功能（如需新增功能，需从 `develop` 合并或后续迭代）。
- 更新版本号相关配置（如 `package.json` 的 version 字段）。

#### 步骤 3：测试与合并

- 测试通过后，创建 PR 合并到 `main` 和 `develop` 。
- 合并到 `main` 后，打版本标签并编写发布说明（见 5.2 节）。

## 5\. 代码合并与版本管理

### 5.1 版本号规范（语义化版本）

采用 `X.Y.Z` 格式，遵循 [Semantic Versioning](https://link.juejin.cn/?target=https%3A%2F%2Fsemver.org%2F "https://semver.org/") 标准：

- `X` （主版本号）：不兼容的重大变更（如架构重构、API 不兼容），例： `3.0.0`
- `Y` （次版本号）：向后兼容的新功能，例： `2.4.0`
- `Z` （修订号）：向后兼容的问题修复，例： `2.3.1`

**版本号递增规则** ：

- 新增功能 → 递增 `Y` （如 `2.3.0` → `2.4.0` ）
- 修复 bug → 递增 `Z` （如 `2.3.0` → `2.3.1` ）
- 重大变更 → 递增 `X` （如 `2.3.0` → `3.0.0` ）

### 5.2 版本标签（Tag）管理

- 仅在 `main` 分支打标签，标签格式为 `vX.Y.Z` （例： `v2.3.0` ）。
- 打标签时必须添加描述，说明版本核心变更：
	```bash
	代码解读复制代码# 创建带注释的标签
	git tag -a v2.3.0 -m "v2.3.0：新增用户登录功能，修复订单超时bug"
	# 推送标签到远程
	git push origin v2.3.0
	```
- 标签创建后禁止删除或修改（如需回滚，创建新标签如 `v2.3.1` ）。

### 5.3 合并方式选择

| 合并场景 | 推荐合并方式 | 目的 |
| --- | --- | --- |
| feature → develop | Squash Merge | 压缩琐碎提交，保持 `develop` 历史清晰 |
| hotfix → main / develop | Create a merge commit | 保留完整修复历史，便于追溯生产问题 |
| release → main / develop | Create a merge commit | 保留发布前的测试调整记录 |

**禁止操作** ：

- 对 `main` / `develop` 分支使用 `git push -f` （强制推送），防止代码丢失。
- 使用 Fast-forward 合并（会丢失分支历史，无法追溯分支来源）。

### 5.4 自动生成 CHANGELOG

利用提交信息的结构化特征，通过工具自动生成版本变更记录：

1. 安装工具： `npm install -g standard-version` （适用于 Node 项目，其他语言可选用同类工具）。
2. 在 `main` 分支执行（合并 release/hotfix 后）：
	```bash
	代码解读复制代码standard-version  # 自动更新版本号、生成CHANGELOG、创建标签
	git push --follow-tags  # 推送版本号和标签
	```

## 6\. 冲突处理规范

冲突是协作中的正常现象，需通过规范流程减少冲突风险并高效解决。

### 6.1 冲突预防

- 小团队分工明确，避免多人同时修改同一文件的同一部分。
- 每日同步 `develop` 代码（见 4.1.3 节），及时发现并解决小冲突，避免堆积。
- 核心配置文件（如 `config.yaml` ）尽量设计为可扩展结构，减少直接修改冲突。

### 6.2 冲突解决步骤

1. **识别冲突文件** ：执行 `git rebase` 或 `git merge` 后，Git 会标记冲突文件（含 `<<<<<<< HEAD` 等标记）。
2. **沟通确认** ：找到冲突代码的作者，明确各自的修改意图，避免擅自覆盖。
3. **手动解决** ：编辑冲突文件，保留正确逻辑，删除冲突标记（ `<<<<<<<` / `=======` / `>>>>>>>` ）。
4. **验证与提交** ：解决后执行 `git add <冲突文件>` ，继续 rebase/merge 流程，确保代码可运行。

### 6.3 冲突解决原则

- 以 “功能正确性” 为优先，而非 “谁的代码保留”。
- 复杂冲突（如架构层面）需团队同步讨论，达成共识后再修改。

## 7\. 工具与自动化配置

通过工具强制规范执行，减少人工成本。

### 7.1 提交信息校验

- 使用 `commitlint` + `husky` 检查提交信息格式
	```bash
	代码解读复制代码# 安装依赖
	npm install --save-dev @commitlint/cli @commitlint/config-conventional husky
	# 配置commitlint规则（根目录创建commitlint.config.js）
	module.exports = { extends: ['@commitlint/config-conventional'] }
	# 配置husky钩子（触发commit时校验）
	npx husky install
	npx husky add .husky/commit-msg 'npx --no -- commitlint --edit $1'
	```

### 7.2 代码风格与质量检查

- 配置 `pre-commit` 钩子，提交前自动执行代码格式化（ `prettier` ）、lint（ `eslint` ）、单元测试：
	```bash
	代码解读复制代码npx husky add .husky/pre-commit 'npx lint-staged'  # 仅检查暂存区文件
	# 配置lint-staged（package.json）
	"lint-staged": {
	  "*.{js,ts}": ["eslint --fix", "prettier --write"],
	  "*.{json,md}": ["prettier --write"]
	}
	```

### 7.3 分支保护与 CI 集成

- 在 GitLab/GitHub 中配置 `main` / `develop` 分支保护：
	- 禁止直接推送
		- 强制 PR 审查通过
		- 强制 CI 检查通过（如编译、测试、代码覆盖率≥80%）
- CI 流程示例（`.gitlab-ci.yml` ）：
	```yaml
	代码解读复制代码stages:
	  - lint
	  - test
	  - build
	lint:
	  stage: lint
	  script: npm run lint
	test:
	  stage: test
	  script: npm test
	build:
	  stage: build
	  script: npm run build
	```

## 8\. 常见问题与解决方案

| 问题场景 | 解决方案 |
| --- | --- |
| 误提交敏感信息（如密钥） | 1\. 立即从代码中删除并替换密钥   2\. 使用 `git filter-branch` 清除历史记录   3\. 通知团队更新密钥 |
| 提交后发现代码错误（未推送） | `git commit --amend` 修正提交（仅修改最后一次提交） |
| 提交后发现代码错误（已推送） | 新增一个修复提交（类型 `fix` ），不修改历史 |
| 分支偏离 `develop` 过远，同步冲突多 | 先创建临时分支备份当前代码，重新从 `develop` 拉取并 cherry-pick 关键提交 |
| 误删分支 | 从远程分支恢复： `git checkout -b 分支名 origin/分支名` |

## 9\. 附则

- 本规范自发布之日起执行，团队成员需在 1 周内熟悉并遵守。
- 每月团队会议需回顾规范执行情况，收集反馈并迭代优化。
- 违反规范导致严重问题（如生产故障、代码丢失），需团队内复盘并改进。

**附录** ：

- 常用 Git 命令速查表（见文末附件）
- PR 模板文件（`.github/PULL_REQUEST_TEMPLATE.md` ）
- 提交信息模板（`.gitmessage` ）

通过严格执行本规范，团队可实现 “分支清晰、提交可追溯、协作高效、发布稳定” 的目标，为项目质量提供基础保障。

> 我的小栈： [itart.cn/blogs/2025/…](https://link.juejin.cn/?target=https%3A%2F%2Fitart.cn%2Fblogs%2F2025%2Fpractice%2Fgit-best-practice.html "https://itart.cn/blogs/2025/practice/git-best-practice.html")