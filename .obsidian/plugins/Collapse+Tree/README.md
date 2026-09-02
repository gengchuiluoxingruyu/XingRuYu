# Collapse Tree

> 打开即用，无需配置。树状节点 + Canvas 渲染 + 旭日图双模式 + 拖拽移动 + 全文搜索 + Hover Editor 联动预览。**不是开源，私信购买。**

**Author:** Obsidianer  
**Version:** 2.3.8  
**Min App Version:** 0.15.0

---

## ✨ Features

### 🗺️ Dual Layout Modes
- **Linear Tree** — 经典缩进树，文件夹可折叠/展开
- **Sunburst（旭日图）** — 同心圆环辐射布局，每圈代表一层深度

### 🎨 Visual Customization
- **3 种配色**：彩虹色 / 热力图（按修改时间着色）/ 默认中性色
- **3 种连线样式**：直线 / 曲线 / 虚线 / 点线
- **紧凑模式**：缩小节点间距，适配大仓库
- 自定义节点大小、层级间距、兄弟间距

### 🔍 5 合 1 搜索
| 模式 | 用途 |
|------|------|
| 普通 | 按文件名模糊搜索 |
| 正则 | `/pattern/flags` 正则匹配 |
| 扩展名 | 按文件类型过滤（`md,canvas,png`） |
| Frontmatter | 搜索 YAML 元数据关键字 |
| 全文 | 扫描所有 Markdown 文件内容 |

- 搜索历史自动保存
- Enter 跳转下一个匹配 / Shift+Enter 上一个
- 当前匹配白色高亮，其余黄色

### ✂️ 剪切 / 粘贴
- 选中节点后右键 → **剪切**，节点进入剪切板
- 在目标文件夹上右键 → **粘贴到此处**，文件/文件夹即刻移动过去
- 配合多选（Ctrl+点击 / Shift+范围选），批量剪切粘贴一键完成
- **Ctrl+Z 撤销**，不小心移错了瞬间恢复
- 另有右键 **复制相对路径 / 复制绝对路径**，配合其他工具使用

### ⌨️ 快捷键
| 快捷键 | 功能 |
|--------|------|
| `Ctrl+Z` | 撤销上次移动 |
| `Ctrl+Shift+D` | 聚焦模式（只看当前文件所在路径） |
| `Ctrl+滚轮` | 缩放画布 |
| `Shift+滚轮` | 水平滚动 |
| 滚轮 | 垂直滚动 |

### 📑 同级导航
- 点击节点 → 面板显示「上一个」「下一个」按钮
- 平滑滚动到兄弟节点，选中圈跟随移动，hover 自动更新
- 配合「打开」按钮快速浏览同级文件

### 🔭 工作区感知
- 已打开的文件显示蓝色小圆点标记
- 活跃文件变化时自动刷新高亮
- 聚焦模式下自动跟随当前编辑文件

### 🪟 浮动面板
- 设置面板可弹出为独立浮动窗口
- 自由拖拽定位，Esc 关闭
- 内置小地图（可开关）

### 🔎 小地图
- 右下角缩略图显示全图概览
- 鼠标滚轮以光标为中心缩放
- 视口矩形指示当前位置

## 🔗 Hover Editor 联动

安装 [Hover Editor](https://github.com/nothingislost/obsidian-hover-editor) 插件后：

- 鼠标悬停任意文件节点 **0.3 秒** → Hover Editor 自动弹出
- **无需点击**，边浏览图谱边预览内容
- 同级导航跳转后，预览自动跟随

> 这是 Collapse Tree 最受欢迎的功能之一：浏览知识库像刷短视频一样流畅。

---

## 🚀 获取方式

本插件为**付费插件**，不在 Obsidian 社区插件市场上架。

📩 **私信购买** → B站私信「Collapse Tree」获取

安装方法：下载后将文件夹解压到 `.obsidian/plugins/collapse-tree/`，重启 Obsidian 启用即可。

**一次购买，永久使用，免费更新。**

---

## 🎮 三步上手

1. 点击左侧 **Ribbon 图标**（git-branch）或 Ctrl+P 搜「Open Collapse Tree」
2. 右侧边栏出现树状图谱，点击文件夹展开，点击文件打开
3. 鼠标悬停节点 0.3 秒 → **Hover Editor 自动弹出预览**，不用切换标签页

**就这么简单。** 拖拽移动、搜索、导航全在面板内完成，零学习成本。

---

## ⚙️ Settings

| Setting | Description |
|---------|-------------|
| Layout Mode | Linear / Sunburst（旭日图） |
| Sort Order | By name / By modified time |
| Node Size | Circle radius (3-20) |
| Level Gap | Horizontal spacing between levels |
| Sibling Gap | Vertical spacing between siblings |
| Line Style | Straight / Curved / Dashed / Dotted |
| Compact Density | Reduce spacing for large vaults |
| Color Mode | Rainbow / Heatmap / Default |
| Hover Preview | Auto-open Hover Editor on hover |

---

## 🧩 Compatibility

- Requires Obsidian **0.15.0+**
- Desktop & Mobile (isDesktopOnly: false)
- Hover Preview requires [Hover Editor](https://github.com/nothingislost/obsidian-hover-editor) plugin

---

## 📝 Changelog

### v2.3.8
- Fixed sunburst ring performance (draw once instead of per-node)
- Fixed prev/next navigation hover not updating
- Open file indicator changed from ring to dot (avoid visual confusion)
- Search match hover restored

### Earlier
- Floating settings panel
- Sunburst layout mode
- Minimap
- Full-text search
- Focus mode
- Undo support
- Batch delete & multi-select

---

## 🤝 支持与反馈

📩 **购买/咨询**：B站私信「Collapse Tree」

🐛 **Bug 反馈**：私信附带截图和复现步骤

🔄 **版本更新**：购买后免费获取所有后续版本
