# 分发指南

## 📦 如何分享给别人

### 方式一：GitHub 仓库（推荐）

1. **创建 GitHub 仓库**
   ```bash
   # 初始化 git 仓库
   cd ~/.claude/tooltrace
   git init
   git add .
   git commit -m "Initial release: Claude Code Tooltrace v1.0.0"
   
   # 关联远程仓库
   git remote add origin https://github.com/你的用户名/tooltrace.git
   git push -u origin main
   ```

2. **创建 Release**
   - 在 GitHub 上创建新 Release
   - 上传打包好的压缩包（运行 `bash package.sh` 生成）
   - 编写 Release 说明

3. **用户安装**
   ```bash
   # 用户只需运行：
   git clone https://github.com/你的用户名/tooltrace.git
   cd tooltrace
   bash install.sh  # Linux/macOS
   # 或
   install.bat      # Windows
   ```

### 方式二：直接分享文件

1. **打包文件**
   ```bash
   bash package.sh
   ```
   这会生成 `dist/tooltrace-v1.0.0.zip` 或 `dist/tooltrace-v1.0.0.tar.gz`

2. **分享压缩包**
   - 通过网盘、邮件等方式分享
   - 用户下载后解压
   - 运行 `install.sh` 或 `install.bat`

### 方式三：一键安装命令

在 GitHub 仓库创建后，用户可以通过以下命令一键安装：

```bash
# Linux / macOS
curl -fsSL https://raw.githubusercontent.com/你的用户名/tooltrace/main/install.sh | bash

# Windows (Git Bash)
curl -fsSL https://raw.githubusercontent.com/你的用户名/tooltrace/main/install.sh | bash
```

## 📋 分发清单

确保以下文件包含在分发包中：

- [x] `prelog.js` - PreToolUse hook 脚本（Node.js 版本，推荐）
- [x] `log.js` - PostToolUse hook 脚本（Node.js 版本，推荐）
- [x] `prelog.py` - PreToolUse hook 脚本（Python 版本，备选）
- [x] `log.py` - PostToolUse hook 脚本（Python 版本，备选）
- [x] `viewer.html` - 可视化页面
- [x] `server.js` - Node.js 零依赖 HTTP 服务器
- [x] `install.sh` - Linux/macOS 安装脚本
- [x] `install.bat` - Windows 安装脚本
- [x] `README.md` - 项目说明文档
- [x] `INSTALL.md` - 详细安装说明
- [x] `.gitignore` - Git 忽略配置
- [x] `example-settings.json` - 示例配置文件

## 🔧 用户安装步骤

### 对于最终用户

1. **下载分发包**
   - 从 GitHub Release 下载
   - 或从分享链接下载

2. **解压文件**
   ```bash
   # Linux / macOS
   tar -xzf tooltrace-v1.0.0.tar.gz
   
   # Windows
   # 使用解压软件解压 tooltrace-v1.0.0.zip
   ```

3. **运行安装脚本**
   ```bash
   # Linux / macOS
   cd tooltrace-v1.0.0
   bash install.sh
   
   # Windows
   # 双击 install.bat
   ```

4. **重启 Claude Code**
   - 关闭当前 Claude Code 会话
   - 重新打开 Claude Code

5. **启动可视化**
   ```bash
   cd ~/.claude/tooltrace
   node server.js 8080
   ```
   打开浏览器访问：http://localhost:8080/viewer.html

## 📝 分发说明模板

在分享时可以使用以下说明：

```
🧠 Claude Code 工具调用链路追踪

一个强大的 Claude Code 工具调用监控和可视化工具！

✨ 特性：
- 全局配置，一次安装所有项目生效
- 多项目支持，按项目分组查看
- 调用链追踪，树形展示子工具调用
- 实时监控，自动刷新
- 零依赖，只需 Node.js

🚀 快速安装：
git clone https://github.com/你的用户名/tooltrace.git
cd tooltrace
bash install.sh

📚 文档：查看 README.md
```

## ⚠️ 注意事项

1. **Node.js 依赖**：推荐使用 Node.js（零依赖），或 Python 3.6+
2. **路径问题**：Windows 用户需要使用完整路径
3. **权限问题**：确保脚本有执行权限
4. **配置冲突**：如果用户已有 hooks 配置，需要手动合并

## 🎯 推荐分发渠道

1. **GitHub** - 最专业的开源方式
2. **公司内部 Wiki** - 适合企业内部使用
3. **技术博客** - 附带教程分享
4. **开发者社区** - 如 V2EX、掘金等
5. **即时通讯群** - 直接分享压缩包
