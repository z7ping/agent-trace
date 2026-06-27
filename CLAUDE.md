# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在此仓库中工作时提供指引。

## 项目概述

Agent Beat 是一个实时监控和可视化 Claude Code 工具调用的工具。通过钩入 Claude Code 的 PreToolUse 和 PostToolUse 生命周期事件，记录每次工具调用，并在浏览器仪表盘中展示。**唯一依赖：better-sqlite3（原生SQLite模块）。

## 常用命令

```bash
# 安装钩子到 Claude Code 配置（安装后自动启动后台服务）
npx agent-beat install

# 手动管理服务
npx agent-beat start              # 前台运行
npx agent-beat start --daemon     # 后台守护进程
npx agent-beat stop               # 停止服务
npx agent-beat status             # 查看状态
npx agent-beat package            # 打包分发

# 向后兼容（仍可使用）
node server.js 37215           # 直接启动
node server.js --stop          # 停止服务
node server.js --status        # 查看状态
```

**无构建步骤，无测试运行器。** 文件直接提供服务 -- 编辑后刷新浏览器即可。

### 自动守护（核心特性）

安装后，**无需手动启动服务器**：
- `hooks/prelog.js` 在每次工具调用时检测服务是否运行
- 如果服务未运行，自动通过 `npx agent-beat start --daemon` 在后台启动
- 服务写入 `.server.pid` 管理生命周期
- 服务挂掉后，下次工具调用会自动拉起

## 多工具支持

支持追踪以下AI编码工具：
- Claude Code（实时钩子）
- Hermes（定时轮询state.db）
- Codex（实时钩子）
- OpenCode（定时轮询opencode.db）
- OpenClaw（待实现）


## 架构

系统是一个**基于钩子的四阶段管道**：

1. **PreToolUse 钩子** (`hooks/prelog.js` / `hooks/prelog.py`) -- 在每次 Claude Code 工具调用前触发。从 stdin 读取 JSON，将记录推入持久化调用栈 (`states/<projectKey>.json`)，附带顺序 `seq` 和 `parent_seq`（当前栈顶）。

2. **PostToolUse 钩子** (`hooks/log.js` / `hooks/log.py`) -- 在每次工具调用后触发。从调用栈弹出，构建包含耗时/成功/错误的日志记录，以 JSONL 格式追加到 `logs/<projectKey>.jsonl`，并更新 `hooks/projects.json`。

3. **HTTP 服务器** (`server.js`) -- 最小化静态文件服务器，端口 37215。支持守护进程模式（`--daemon`），通过 `.server.pid` 管理生命周期。提供 HTML 页面及运行时数据文件 (`logs/`, `states/`, `projects.json`)。

4. **服务守护** (`hooks/server-guard.js`) -- 钩子自动拉起服务的核心模块。通过 TCP 端口检测 + PID 文件双重验证服务状态。使用 `npx agent-beat start --daemon` 启动服务（跨平台统一方案）。

5. **浏览器可视化** -- `index.html`（主查看器，树形调用链）和 `dashboard.html`（分析仪表盘，图表、热力图、导出）。两者均通过 `fetch()` 在客户端解析 JSONL。

## 核心设计模式

- **多项目隔离**：项目键 = 工作目录路径 MD5 的前 12 位。所有状态/日志文件按此键命名空间隔离。
- **调用链重建**：基于栈 -- `prelog` 推入 `seq`/`parent_seq`，`log` 弹出。构建将代理链接到其子工具的树形结构。
- **输入摘要**：钩子按工具类型摘要工具输入（Bash -> 命令，文件工具 -> 路径，MCP -> 服务器名称）。保持日志文件小巧。
- **增量渲染**：`index.html` 跟踪已渲染的 `seq` 值，自动刷新时仅追加新条目。
- **双钩子实现**：Node.js 钩子为主/推荐；Python 钩子为备用。两者产生相同输出。

## 运行时数据

- `hooks/projects.json` -- 项目注册表：映射 `projectKey` 到 `{cwd, name, last_seen}`
- `logs/<projectKey>.jsonl` -- 仅追加日志文件，每个工具调用一个 JSON 对象
- `states/<projectKey>.json` -- 临时调用栈状态（执行期间活跃读写）

## 约定

- **UI 文本为中文 (zh-CN)** -- HTML 文件中所有面向用户的字符串
- **无框架** -- 原生 HTML/CSS/JS，CSS 变量用于主题（亮/暗）
- **钩子输入格式**：钩子从 stdin 接收 JSON，包含 `tool_name`、`cwd`、`session_id`、`tool_response`、`duration_ms` 等字段
- **错误检测**：结构化工具检查 `success`/`exit_code`；Bash 模式匹配 stdout 中的已知错误字符串
