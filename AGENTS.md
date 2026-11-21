# 知识库

本库是用 Obsidian 维护的个人知识库：笔记按用途分目录，结构化信息写在 frontmatter，规则本身也作为笔记留在库内。本文件是索引加要点摘要，完整条款在 `Regulation/`；两者不一致时以规章为准。

## 权限

详见 `Regulation/Permission.md`。

- 表内路径按表执行，未登记的一律只读；目录权限与文件权限两层都满足才能动，目录能进不等于里面文件能改。
- `r-x` 的目录（`Regulation/`、`Row/`、`Log/`、`Index/`、`Base/`、`copilot/`）只能读，不新建、不移动、不删除条目。
- 可自由读写的是 `Cache/`、`Wiki/`、`Timestamp/`、`Description/`、`Template/`；`.obsidian/`、`.git/` 只读，`.git/` 只能走 `git` 命令。
- 越权先问一句：`X 的权限是 Y，但你需要 Z，是否确定此操作`。答复取消就不做，也不换等价手段绕行。

## 命名规范

详见 `Regulation/Naming.md`。

- 目录：英文、大驼峰、单个单词——`Wiki/`、`Template/`、`Cache/`。
- 笔记文件：英文、大驼峰、一到三个单词——`Git.md`、`PropertyGuide.md`；不带日期前缀，不带版本号。
- 属性名与标签名同一套写法：全小写、多词用下划线（`focus_hours`、`second_brain`），不用连字符、空格、大驼峰。
- 既有例外：日记 `Log/DailyLogs/YYYY-MM/YYYY-MM-DD.md`；`Row/` 剪藏沿用原文标题，可含中文；`AGENTS.md`、`README.md`、`LICENSE` 保持固定写法。
- 改名必须在 Obsidian 里重命名，链接才会同步；在文件管理器里改会留下断链。

## 属性与标签

详见 `Regulation/Properties.md`、`Regulation/Tags.md`；逐条写法见 `PropertyGuide.md`、`TagGuide.md`。

- 分工：属性说这篇文件处于什么状态（类别、时间、进度、评分），标签说这篇讲的是什么（主题、领域）。日期、作者、评分一律用属性，不做标签。
- `type` 必填，只取 `daily` `clipping` `note` `summary` `regulation` 五个值，不自创、不临时加值。
- 日期严格 `YYYY-MM-DD`；数值不带单位；空值整行删掉，不留空键；wikilink 值要加引号。
- 标签 1–5 个，写在 frontmatter 的 `tags` 下、一行一个、不带 `#`；词表目前只有 `daily` `clippings` `regulation`，新词先登记再用。
- `.obsidian/types.json` 属于配置，改动须经用户确认并由用户自己操作。

## 提交

详见 `Regulation/Git.md`。

- 格式 `type(scope): 描述`；`type` 小写，只取 `add` `update` `fix` `move` `remove` `config` `style` `revert` `chore`。
- 描述用中文、动词开头、不加句号、不超过 25 字；一次提交只做一件事，正文改动与配置变更分开提交。
- 提交前先 `git status`；`Cache/` 里的临时产物、`.trash/` 内容、含密钥或个人隐私的配置都不进历史。
- 分支：日常改动直接提交到 `main`；影响几十个文件的改造才开 `big-change/xxx`，合并后删掉；`main` 禁强推。
- 回滚用 `git revert`，不用 `reset --hard`；版本标记用 `vYYYY.MM` 里程碑标签，只打在 `main`，只增不改。

## 临时文件

详见 `Regulation/TempFiles.md`。

- 脚本、备份、导出中间产物一律放 `Cache/`，用完即删；备份文件名加 `.bak` 或 `.md.bak`，不要以 `.md` 结尾，否则会被当成笔记。
- 不落库根，不落笔记目录（`Wiki/`、`Log/`、`Row/`、`Regulation/`）；`Cache/` 是工作台不是档案库。

## 文件搜索

详见 `Regulation/FileSearch.md`。

- 顺序：已知路径直接读 → 语义检索 → 关键词检索 → 按文件路径合并两路结果 → 打开最匹配的 2–4 篇全文，不只读摘要。
- 关键词面：属性名、标签 `tag:#regulation`、引号里的原句、标题片段、日期。
- 找不到就明说“库里没覆盖”，不拿常识冒充库内结论；不反复重试失败的工具，也不为凑数塞进无关笔记。
