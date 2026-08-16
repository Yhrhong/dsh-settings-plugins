# dsh-settings-plugins

DeepSeek Harness（DSH）Web 预设的设置页插件集：在 GUI 的「设置」里为 **MCP 服务器** 和 **技能** 提供可视化管理页面，外加一个会话删除增强。

本仓库包含三个独立的 Cordis 插件（均为 MIT 许可，可单独发布/安装）：

| 插件 | 包名 | 功能 |
| --- | --- | --- |
| MCP 管理 | `mcps-settings` | 在设置页列出已配置/已连接的 MCP 服务器卡片，支持添加、移除、启停、在线工具数展示，直接读写 profile 的 `cordis.patch.yml` |
| 技能管理 | `skills-settings` | 在设置页列出完整技能目录卡片（来源/预设/调用方式/启用状态），支持启停、新建、移除技能，读写 `skills-settings.json` 与 `~/.dsh/skills/` |
| 会话删除 | `session-delete` | 会话头部常驻删除按钮（归档语义：列表隐藏、日志保留在磁盘），附带斜杠命令的中文描述 |

## 安装

### 方式一：本地开发安装（当前仓库状态）

```powershell
# 1. 把插件目录复制到你的 web profile
Copy-Item mcps-settings C:\Users\<you>\.dsh\profiles\web\plugins\ -Recurse

# 2. 在 profile 的 package.json dependencies 里加一行（或直接编辑 package.json）
#    "mcps-settings": "file:./plugins/mcps-settings"

# 3. 在 profile 目录下安装
cd C:\Users\<you>\.dsh\profiles\web
pnpm install
```

### 方式二：npm 发布后（推荐）

```powershell
dsh plugin --profile web add <包名>
```

> 发布到 npm 前建议改名为 scoped 包（如 `@yhrhong/mcps-settings`），避免与 npm 上已有包冲突；改名的同时更新 `cordis.patch.yml` 中对应插件行的 `name`。

## 使用

1. 启动 web 预设：`dsh web`（或 `dsh --profile web`）
2. 打开浏览器进入 GUI → **设置**
3. 「MCP 服务器」页：查看在线状态与工具数、添加 stdio / streamable-http 服务器、移除、启停
4. 「技能」页：查看全部技能卡片、切换启用/禁用、新建（写入 `~/.dsh/skills/<name>/SKILL.md`）、移除自定义技能

## 配置数据位置

| 数据 | 路径（`$DSH_HOME` 默认 `~/.dsh`） |
| --- | --- |
| MCP 服务器配置 | `$DSH_HOME/profiles/web/cordis.patch.yml`（`mcp-client` 插件行） |
| 技能启停状态 | `$DSH_HOME/profiles/web/skills-settings.json` |
| 技能本体 | `$DSH_HOME/skills/<name>/SKILL.md` |

插件运行期路径通过 `$DSH_HOME`（缺省 `~/.dsh`）动态解析，不依赖任何硬编码的本机路径。

## 开发

```
dsh-settings-plugins/
├── mcps-settings/       # 宿主端 lib/index.js + 客户端 lib/client.js
├── skills-settings/
└── session-delete/
```

每个插件是标准的 DSH 双面（dual-face）Cordis 插件：

- 宿主端 `lib/index.js`：`inject` `webServer` 等运行时服务，暴露 `/mcps/*`、`/skills/*` 路由
- 客户端 `lib/client.js`：`dsh.client.inject` 注入 `dsh-client-ui-settings`，把管理页注册进 GUI 设置区

依赖仅限 Node 内置模块与 DSH 公开运行时 API，无第三方运行时依赖。

## 许可

[MIT](LICENSE)
