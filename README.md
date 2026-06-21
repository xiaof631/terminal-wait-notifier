# terminal-wait-notifier

一个可以全局安装的终端提醒工具，用来处理两类场景：

- 终端命令执行完成后提醒你结果。
- 命令输出里出现确认、输入、密码、继续执行等提示时提醒你回来处理。

它不绑定具体命令，适合 `npm install`、`pnpm build`、`terraform apply`、`ssh`、部署脚本、数据库迁移、AI CLI 等任何需要等待的终端操作。

## 是否必须包裹命令？

不完全是。

- 只需要“命令完成后提醒”：不需要包裹。安装后，你照常执行 `npm install`、`pnpm build`、`ssh`，命令结束就会提醒。
- 需要“等待确认/输入时提醒”：需要通过 `twn run -- <command>` 或 hook 提供的短命令 `tw <command>` 执行。原因是工具必须读取命令输出，才能判断是不是出现了 `Are you sure?`、`[y/N]`、`请输入` 这类提示。

推荐用法是：自动安装的 hook 负责所有顶层命令的完成提醒；遇到可能卡在确认输入的命令时，用 `tw` 执行。

## 安装

```bash
npm install -g terminal-wait-notifier
```

全局安装时会自动把 managed hook 写入当前 shell 的配置文件（支持 zsh、bash、fish）。你不需要再手动执行 `twn install-hook`。
如果本机安装了 Codex，安装脚本还会尝试写入 Codex `Stop` hook，用来在 Codex 每轮任务结束时提醒。
如果本机存在 Qwen Code、Gemini CLI、Claude Code、Qoder CLI 的用户配置目录，安装脚本也会自动写入对应的任务结束 hook。

安装脚本不能修改已经打开的父级终端进程，所以安装后需要重新打开一个终端窗口，普通命令完成提醒才会自动生效。默认阈值是 0 秒，也就是每条顶层命令结束都会提醒。

Codex hook 会被 Codex 标记为新 hook。Codex 出于安全要求会在下次启动时要求你 review/trust 一次；确认后才会运行。这个确认不是本项目能安全绕过的东西，因为 Codex hook 可以在沙箱外执行命令。

如果不希望安装时自动写入 shell 配置：

```bash
TWN_SKIP_AUTO_HOOK=1 npm install -g terminal-wait-notifier
```

如果只想跳过 Codex hook：

```bash
TWN_SKIP_CODEX_HOOK=1 npm install -g terminal-wait-notifier
```

如果只想跳过其他 AI CLI hook：

```bash
TWN_SKIP_AI_HOOKS=1 npm install -g terminal-wait-notifier
```

本地开发时可以直接链接：

```bash
npm link
twn --help
```

## 包装任意命令

```bash
twn run -- npm install
twn run -- pnpm build
twn run -- terraform apply
```

复杂 shell 命令用 `--shell`：

```bash
twn run --shell -- "npm test && npm run build"
```

如果命令输出里出现 `Do you want to continue? [y/N]`、`Are you sure?`、`是否继续？`、`请输入` 这类提示，`twn` 会发送一次“可能正在等待确认”的提醒。命令结束后，会按退出码发送成功或失败提醒。

安装 shell hook 后，也可以用短写法：

```bash
tw npm install
tw terraform apply
```

## 推送到 webhook

设置 `TWN_WEBHOOK_URL` 后，每次提醒都会发送 JSON 到该地址：

```bash
export TWN_WEBHOOK_URL="https://example.com/webhook"
twn run -- npm run deploy
```

发送内容包含：

```json
{
  "source": "terminal-wait-notifier",
  "event": "command_completed",
  "level": "success",
  "title": "Terminal command",
  "message": "npm run deploy finished with success after 2m 4s.",
  "command": "npm run deploy",
  "exitCode": 0,
  "durationMs": 124000,
  "cwd": "/path/to/project",
  "host": "machine-name",
  "timestamp": "2026-06-21T00:00:00.000Z"
}
```

可选自定义请求头：

```bash
export TWN_WEBHOOK_HEADERS='{"Authorization":"Bearer token"}'
```

## 桌面提醒

默认会尝试使用系统桌面通知：

- macOS: `osascript`
- Linux: `notify-send`
- Windows: PowerShell 通知气泡

只使用 webhook：

```bash
twn run --no-desktop -- npm test
```

只做本地提醒，不推 webhook：

```bash
twn run --no-webhook -- npm test
```

## Shell 集成

全局安装时已经会自动写入 shell 配置。下面这些命令主要用于手动更新、指定配置文件、重新安装或卸载。

zsh:

```bash
twn install-hook zsh --min-seconds 0
```

bash:

```bash
twn install-hook bash --min-seconds 0
```

fish:

```fish
twn install-hook fish --min-seconds 0
```

这会在对应配置文件里写入一个带标记的 managed block。重复执行会更新这个 block，不会重复追加。

卸载自动注入：

```bash
twn uninstall-hook zsh
```

想先看它会写什么：

```bash
twn install-hook zsh --min-seconds 0 --dry-run
```

你也可以指定配置文件：

```bash
twn install-hook zsh --rc-file ~/.zshrc --min-seconds 0
```

如果不想写入配置文件，也可以手动 eval。

zsh:

```bash
eval "$(twn hook zsh --min-seconds 0)"
```

bash:

```bash
eval "$(twn hook bash --min-seconds 0)"
```

fish:

```fish
twn hook fish --min-seconds 0 | source
```

Shell hook 只能提醒“命令完成”。要检测“正在等待确认/输入”，需要用 `twn run -- <command>` 包装命令，因为它必须读取命令输出。
安装 hook 后会同时提供 `tw` 函数，它等价于 `twn run --`：

```bash
tw npm install
tw terraform apply
```

所以日常使用可以这样分工：

```bash
npm install       # 普通完成提醒，由 shell hook 负责
tw npm install    # 完成提醒 + 等待确认/输入检测
```

## Codex 集成

普通 shell hook 只能知道 `codex` 这个进程什么时候退出，不能知道 Codex 交互式会话里“某一轮回复已经结束”。Codex 单独支持它自己的 hook 事件，所以本项目会安装一个 Codex `Stop` hook：

```bash
twn install-codex-hook
```

这个命令通过 `codex app-server --stdio` 写入当前用户的 Codex 配置，等价于注册一个同步 command hook：

```toml
[hooks]
Stop = [{ hooks = [{ type = "command", command = "twn codex-hook", async = false, timeout = 5, statusMessage = "Notify Codex completion" }] }]
```

`twn codex-hook` 会读取 Codex 传入的 hook JSON，并发送一条 `Codex task completed` 桌面通知或 webhook 推送。安装后如果 Codex 显示 hooks review，选择 trust 后才会真正执行。

## AI CLI 集成

除了普通终端命令完成提醒，项目还内置了这些 AI CLI 的任务结束提醒：

| CLI | 写入位置 | 事件 |
| --- | --- | --- |
| Codex | Codex 用户配置 | `Stop` |
| Qwen Code | `~/.qwen/settings.json` | `Stop` |
| Gemini CLI | `~/.gemini/settings.json` | `AfterAgent` |
| Claude Code | `~/.claude/settings.json` | `Stop` |
| Qoder CLI | `~/.qoder/settings.json` | `Stop` |

全局安装时会自动处理这些配置。也可以手动重新安装：

```bash
twn install-ai-hooks
```

只处理已经存在配置目录的 CLI：

```bash
twn install-ai-hooks --only-existing
```

指定某一个 CLI：

```bash
twn install-ai-hooks --cli qwen
twn install-ai-hooks --cli gemini
twn install-ai-hooks --cli claude
twn install-ai-hooks --cli qoder
```

JSON settings 会追加一个 managed command hook，不会删除已有 hook。Codex 仍然可能要求你在下一次打开 Codex 时 review/trust 新 hook。

## 常用选项

```bash
twn run --title "Deploy" --label "production deploy" -- npm run deploy
twn run --min-seconds 10 -- npm test
twn run --prompt-throttle-seconds 120 -- terraform apply
twn notify "手动提醒测试"
```

环境变量：

| 变量 | 说明 |
| --- | --- |
| `TWN_WEBHOOK_URL` | webhook 推送地址 |
| `TWN_WEBHOOK_HEADERS` | JSON 格式请求头 |
| `TWN_WEBHOOK_TIMEOUT_MS` | webhook 超时，默认 5000 |
| `TWN_DESKTOP=0` | 关闭桌面提醒 |
| `TWN_WEBHOOK=0` | 关闭 webhook |
| `TWN_BELL=1` | 同时响铃 |
| `TWN_MIN_SECONDS` | 完成提醒最短耗时阈值 |
| `TWN_PROMPT_DETECTION=0` | 关闭确认等待检测 |
| `TWN_PROMPT_THROTTLE_SECONDS` | 确认提醒节流时间，默认 60 |
| `TWN_SKIP_AUTO_HOOK=1` | 安装时跳过自动写入 shell hook |
| `TWN_AUTO_INSTALL_HOOK=1` | 即使不是全局安装，也尝试自动写入 shell hook |
| `TWN_AUTO_HOOK_MIN_SECONDS` | 安装时写入 hook 的完成提醒阈值，默认 0 |
| `TWN_AUTO_HOOK_SHELL` | 安装时指定 shell：zsh、bash 或 fish |
| `TWN_SKIP_CODEX_HOOK=1` | 安装时跳过自动写入 Codex Stop hook |
| `TWN_AUTO_CODEX_HOOK=1` | 即使不是全局安装，也尝试自动写入 Codex Stop hook |
| `TWN_CODEX_COMMAND` | 指定 Codex 可执行命令，默认 `codex` |
| `TWN_CODEX_HOOK_COMMAND` | 指定 Codex Stop hook 执行的命令，默认 `twn codex-hook` |
| `TWN_CODEX_HOOK_TIMEOUT_SECONDS` | Codex Stop hook 超时秒数，默认 5 |
| `TWN_SKIP_AI_HOOKS=1` | 安装时跳过自动写入 Qwen/Gemini/Claude/Qoder hook |
| `TWN_AUTO_AI_HOOKS=1` | 即使不是全局安装，也尝试自动写入 AI CLI hook |
| `TWN_AUTO_AI_HOOK_CLIS` | 指定自动写入的 AI CLI，逗号分隔，例如 `qwen,gemini` |

## 开发

```bash
npm test
npm run smoke
npm run pack:check
```

试一下确认提示检测：

```bash
twn run --no-desktop --no-webhook -- node examples/wait-for-confirm.js
```
