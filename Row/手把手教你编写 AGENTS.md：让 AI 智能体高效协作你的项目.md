---
title: "手把手教你编写 AGENTS.md：让 AI 智能体高效协作你的项目"
source: "https://zhuanlan.zhihu.com/p/2015507552046167271"
author:
  - "[[雷厉风行]]"
published:
created: 2026-11-14
description: "AGENTS.md 是代码仓库中专门面向 AI 智能体（AI coding Agent）的规范配置文件，核心作用是统一不同 AI 工具的上下文认知、规范其行为边界，让 AI 能像资深开发者一样精准参与项目开发。本文将从核心价值、编写规…"
tags:
  - "clippings"
---
内容疑似 AI 生成

[

收录于 · vibe coding

](https://www.zhihu.com/column/c_2012674528166307817)

18 人赞同了该文章

目录

收起

一、为什么需要 AGENTS.md？

二、AGENTS.md 核心适用场景

三、AGENTS.md 标准编写结构（附示例）

1\. 必选模块（核心基础）

2\. 可选模块（按需添加）

四、AGENTS.md 编写避坑指南（不应包含的内容）

五、最佳实践：高质量 AGENTS.md 的核心特征

六、落地建议

总结

AGENTS.md 是代码仓库中专门面向 AI 智能体（AI coding Agent）的规范配置文件，核心作用是统一不同 AI 工具的上下文认知、规范其行为边界，让 AI 能像资深开发者一样精准参与项目开发。本文将从核心价值、编写规范、最佳实践等维度，带你从零构建一份高质量的 AGENTS.md。

## 一、为什么需要 AGENTS.md？

在多人/多 AI 协作的项目中，你是否遇到过这些问题：

- 不同 AI 工具（Cursor、Claude Code、Gemini CLI）的配置散落在不同目录/文件，维护成本高；
- AI 生成的代码不符合项目编码规范，甚至误改核心配置/密钥；
- 项目的构建流程、测试规则只存在于老员工脑中，AI/新人频繁踩坑。

AGENTS.md 正是为解决这些问题而生：

1. **统一标准** ：为所有 AI 工具提供统一的上下文入口，替代各工具专属的配置文件（如 Cursor 的 `./.cursor/rules/` 、Claude 的 `CLAUDE.md` ）；
2. **显性化隐性知识** ：将项目的技术栈、构建命令、测试规范、禁止操作等“隐形规则”固化为机器可理解的契约；
3. **隔离受众** ：与面向人类的 `README.md` 分工， `README.md` 保持简洁（快速上手、项目介绍）， `AGENTS.md` 专注提供 AI 所需的精准指令（如具体的安装命令、测试覆盖率要求）。

> 补充：AGENTS.md 是厂商中立的标准（OpenAI、谷歌 Jules、Cursor 等均支持），能让整个开发者社区受益。

## 二、AGENTS.md 核心适用场景

AGENTS.md 适用于所有需要 AI 智能体参与的开发场景，常见包括：

- **自动化运维** ：配置 AI 完成服务器监控、日志收集、故障告警；
- **智能交互** ：定义 AI 的对话逻辑、响应规则，实现智能问答、指令执行；
- **流程协作** ：配置多 AI 联动完成复杂流程（如数据采集→处理→输出）；
- **定制化开发** ：自定义 AI 能力边界，适配个性化业务需求（如仅允许修改前端组件、禁止操作 [数据库脚本](https://zhida.zhihu.com/search?content_id=271376701&content_type=Article&match_order=1&q=%E6%95%B0%E6%8D%AE%E5%BA%93%E8%84%9A%E6%9C%AC&zhida_source=entity) ）。

## 三、AGENTS.md 标准编写结构（附示例）

AGENTS.md 采用模块化结构，分为 **必选模块** 和 **可选模块** ，核心原则是：简洁、精准、可执行，控制在 300 行以内（最佳实践是 60 行左右）。

### 1\. 必选模块（核心基础）

**1.1 项目基础信息：让 AI 快速定位项目核心**

一句话明确项目类型、技术栈、用途和约束，避免冗余描述。

```
# AGENTS.md
## 1. Project Overview（项目基础信息）
- 项目类型：React 18 + TypeScript 管理系统
- 核心技术栈：Vite 5.0 + TypeScript 5.2 + TailwindCSS 3.4 + PNPM 8.6
- 项目用途：企业内部用户权限管理系统
- 核心约束：禁止使用 any 类型、所有接口需加 Token 权限校验、遵循 React 函数式组件规范
```

**1.2 环境搭建与开发流程：明确精准的操作命令**

重点标注项目专属操作，通用命令（如 `npm install` ）需补充项目特有的参数/要求。

```
## 2. Setup & Development（环境搭建与开发流程）
### 2.1 依赖安装
- 推荐包管理器：pnpm
- 安装命令：pnpm install --frozen-lockfile（锁定依赖版本，禁止自动更新）
- 依赖更新：禁止手动更新依赖，需提交 PR 经团队审核后执行

### 2.2 开发运行
- 启动开发服务：pnpm dev:staging（测试环境）/ pnpm dev:prod（生产环境）
- 热重载配置：默认开启，修改组件后无需重启服务
- 构建命令：pnpm build，输出目录为 dist/，构建前需执行 pnpm lint

### 2.3 数据库配置（后端项目必选）
- 数据库类型：MySQL 8.0
- 初始化命令：pnpm db:init（自动执行 src/db/init.sql 脚本）
- 禁止操作：不得删除 migrations/ 目录下的历史迁移文件
```

**1.3 测试规范：让 AI 生成符合要求的测试用例**

明确测试框架、执行命令和验收标准，避免测试遗漏。

```
## 3. Testing Guidelines（测试规范）
- 测试框架：Vitest
- 执行命令：
  - 运行所有测试：pnpm test
  - 运行指定模块测试：pnpm test:module user（用户模块）
- 测试要求：
  - 新增代码测试覆盖率≥80%
  - 测试文件命名：xxx.test.ts，与业务文件同目录
  - 禁止行为：不得跳过必填测试用例、不得修改测试预期结果
```

**1.4 代码风格规范：附示例更易执行**

明确编码规则+真实代码示例，让 AI 直接参考“优质输出”的样子。

```
## 4. Code Style（代码风格规范）
### 4.1 通用规则
- 代码格式化工具：Prettier + ESLint
- 提交前必须执行：pnpm lint（自动修复格式问题）
- 禁止使用：any 类型、var 声明、硬编码魔法值（如直接写 100 代替 MAX_PAGE_SIZE）

### 4.2 React+TS 专属规则
- 组件风格：优先使用函数式组件（React.FC），禁止使用类组件
- 类型定义：使用 interface 定义组件 props，简单场景可使用 type
- 命名规范：
  - 组件名：PascalCase（如 UserList）
  - 函数名：camelCase（如 handleUserClick）
  - 常量名：UPPER_CASE_SNAKE_CASE（如 MAX_PAGE_SIZE）
- 示例：
\`\`\`ts
// 正确示例
interface UserListProps {
  users: Array<{ id: number; name: string }>;
}
export const UserList: React.FC<UserListProps> = ({ users }) => {
  const handleClick = (id: number) => {
    console.log(\`User ID: ${id}\`);
  };
  return (
    <div className="user-list">
      {users.map(user => (
        <button key={user.id} onClick={() => handleClick(user.id)}>
          {user.name}
        </button>
      ))}
    </div>
  );
};
```

**1.5 操作边界与禁止行为：避免 AI 误操作**

明确 AI 不可操作的范围和禁止行为，避免 AI 误操作导致项目故障（如删除核心文件、修改密钥等）。

5.1 禁止操作

- 不得修改/删除：.env（密钥文件）、src/core（核心工具类）、migrations/（迁移文件）
- 不得修改：package.json 中的依赖版本、CI/CD 流水线配置（.github/workflows/）
- 不得提交：node\_modules 目录、IDE 配置文件（.vscode/）、未完成的测试代码

5.2 操作边界

- 修改权限校验、数据加密等核心逻辑前，必须生成变更方案并标记“需人类审核”
- 新增依赖需先检查现有依赖，禁止重复引入同类库（如已有 Axios 则不引入 Fetch API 封装库）

### 2\. 可选模块（按需添加）

根据项目类型补充，提升 AI 工作效率，以下是高频可选模块：

```
## 6. Optional Sections（可选模块）
### 6.1 提交与 PR 规范（团队协作必选）
- PR 标题格式：(<模块名>) 描述性标题，如 (user) 修复用户登录失败问题
- 提交信息规范：type(scope): description，如 fix(user): 修复密码加密异常
- PR 前置检查：必须运行 pnpm lint 和 pnpm test，确保无报错

### 6.2 安全规范（生产项目必选）
- 密钥管理：所有密钥存于 .env 文件，不得硬编码到代码中
- 安全校验：接口必须做参数校验，禁止直接接收前端传入的 SQL 语句

### 6.3 调试与排错
- 日志位置：logs/ 目录，按日期分区（如 logs/2026-03-12.log）
- 常见问题：
  1. 开发服务启动失败：检查 3000 端口是否被占用
  2. 测试失败：确认数据库已执行 pnpm db:init 初始化
```

## 四、AGENTS.md 编写避坑指南（不应包含的内容）

1. **避免冗余的项目结构列表** ：AI 能自行识别目录结构，无需手动罗列所有文件/目录；
2. **避免纯文字的代码风格指南** ：优先用 ESLint/Prettier 等工具固化风格，仅补充工具无法覆盖的特殊规则；
3. **避免非通用的指令** ：仅保留全项目通用的规则，特定任务（如“修改某接口返回值”）的指令在对话时单独提供；
4. **避免自动生成内容** ：不要用脚本自动生成 AGENTS.md，人工编写才能保证规则精准。

## 五、最佳实践：高质量 AGENTS.md 的核心特征

参考行业最优案例，高质量的 AGENTS.md 需满足以下要求：

1. **指令前置** ：将可执行命令（如 `pnpm test` 、 `pnpm build` ）放在靠前位置，AI 高频参考；
2. **代码示例优先** ：用真实代码片段展示风格，胜过文字描述；
3. **边界分级设定** ：采用“✅ 必须做、⚠️ 先询问、🚫 绝对禁止”三级规则，清晰易懂；
4. **技术栈精准** ：标注版本号（如 React 18、MySQL 8.0），而非笼统的“React 项目”；
5. **[渐进式披露](https://zhida.zhihu.com/search?content_id=271376701&content_type=Article&match_order=1&q=%E6%B8%90%E8%BF%9B%E5%BC%8F%E6%8A%AB%E9%9C%B2&zhida_source=entity)** ：复杂项目可将细节拆分到独立文件（如 `agent_docs/test-guidance.md` ），在 AGENTS.md 中通过相对路径引用（ `@./agent_docs/test-guidance.md` ）。

优质示例参考

```
---
name: docs_agent
description: Expert technical writer for this project
---

You are an expert technical writer for this project.

## Your role
- You are fluent in Markdown and can read TypeScript code
- You write for a developer audience, focusing on clarity and practical examples
- Your task: read code from \`src/\` and generate or update documentation in \`docs/\`

## Project knowledge
- **Tech Stack:** React 18, TypeScript 5.2, Vite 5.0, Tailwind CSS 3.4
- **File Structure:**
  - \`src/\` – Application source code (you READ from here)
  - \`docs/\` – All documentation (you WRITE to here)
  - \`tests/\` – Unit, Integration, and Playwright tests

## Commands you can use
Build docs: \`npm run docs:build\` (checks for broken links)
Lint markdown: \`npx markdownlint docs/\` (validates your work)

## Documentation practices
Be concise, specific, and value dense
Write so that a new developer to this codebase can understand your writing, don’t assume your audience are experts.

## Boundaries
- ✅ **Always do:** Write new files to \`docs/\`, follow the style examples, run markdownlint
- ⚠️ **Ask first:** Before modifying existing documents in a major way
- 🚫 **Never do:** Modify code in \`src/\`, edit config files, commit secrets
```

## 六、落地建议

1. 放在代码仓库 **根目录** ，命名统一为 `AGENTS.md` （大小写敏感）；
2. monorepo 项目可在每个子包下单独编写 `AGENTS.md` ，实现上下文隔离；
3. 定期维护：项目技术栈/流程变更时，同步更新 AGENTS.md，避免规则过时；
4. 团队协作：将 AGENTS.md 纳入 PR 审核范围，确保所有开发者认可规则。

## 总结

1. AGENTS.md 是面向 AI 智能体的配置文件，核心价值是统一 AI 上下文、显性化项目隐性规则，与面向人类的 README.md 分工协作；
2. 编写时需遵循“必选模块（基础信息、开发流程、测试规范、代码风格、操作边界）+ 可选模块”的结构，保持简洁、精准、可执行；
3. 高质量 AGENTS.md 的关键是：指令前置、示例优先、边界分级、技术栈精准，避免冗余和自动生成内容。

通过本文，你可以快速构建适配自己项目的 AGENTS.md，让 AI 智能体成为项目开发的高效协作伙伴，而非“添乱者”。

还没有人送礼物，鼓励一下作者吧

编辑于 2026-03-12 19:31・山西

赞同 18