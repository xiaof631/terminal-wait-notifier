# terminal-wait-notifier

面向 AI CLI 工作流的终端等待管理器。

它解决的不是“怎么发一条通知”，而是一个更具体的问题：你不想一直盯着终端，但又需要知道命令什么时候结束、什么时候失败、什么时候其实卡在确认输入、什么时候 AI CLI 已经完成一轮任务。

核心场景：

| 场景 | 能力 |
| --- | --- |
| 普通命令结束或失败 | 安装后照常运行命令，shell hook 自动提醒 |
| 命令卡在确认/输入 | 用 `tw <command>` 或 `twn run -- <command>` 读取输出并提醒 |
| AI CLI 一轮任务结束 | 自动安装 Codex / Qwen Code / Gemini CLI / Claude Code / Qoder CLI hook |
| 系统通知不明显 | 支持声音、终端铃声、macOS alert 强弹窗、webhook |

它适合 `npm install`、`pnpm build`、`terraform apply`、`ssh`、部署脚本、数据库迁移，以及 Codex / Qwen / Gemini / Claude / Qoder 等 AI CLI 工作流。

## 和已有工具的区别

已有项目已经覆盖了很多通知能力，本项目的重点是把“终端等待”这个工作流做完整。

| 项目 | 更偏向 | terminal-wait-notifier 的差异 |
| --- | --- | --- |
| [ntfy](https://github.com/dschep/ntfy) | 通用命令完成通知和多后端推送 | 增加等待确认/输入检测，并内置多 AI CLI hook |
| [noti](https://github.com/variadico/noti) | 进程/命令完成通知 | 聚焦 AI CLI 工作流和卡输入提醒；仓库当前已 archived |
| [undistract-me](https://github.com/jml/undistract-me) | 长命令完成提醒 | 覆盖 AI CLI 回合结束、webhook、macOS alert 等现代工作流 |
| [terminal-notifier](https://github.com/julienXX/terminal-notifier) / [alerter](https://github.com/vjeantet/alerter) | macOS 通知/alert 底层工具 | 本项目是终端等待工作流工具，通知只是输出方式之一 |
| [shelldone](https://github.com/nareshnavinash/shelldone) | pure bash 的长命令提醒和多渠道通知 | 本项目提供 npm 安装体验，并把等待输入检测和 AI CLI hook 作为核心路径 |
| [echook](https://github.com/ChanMeng666/echook) | AI hook 音频、TTS、主题和更重的 hook 系统 | 本项目保持轻量，不做 TTS/音频主题，重点是终端命令 + AI CLI 的等待管理 |

## 不做什么

- 不做完整通知平台；只提供桌面通知、声音、alert、终端铃声和 webhook 这些实用出口。
- 不做 AI agent 远程控制、聊天桥接或会话管理。
- 不自动回答确认问题，也不读取隐藏密码；只提醒你回来处理。

## 是否必须包裹命令？

不完全是。

- 只需要“命令完成后提醒”：不需要包裹。安装后，你照常执行 `npm install`、`pnpm build`、`ssh`，命令结束就会提醒。
- 需要“等待确认/输入时提醒”：需要通过 `twn run -- <command>` 或 hook 提供的短命令 `tw <command>` 执行。原因是工具必须读取命令输出，才能判断是不是出现了 `Are you sure?`、`[y/N]`、`请输入` 这类提示。

推荐用法是：自动安装的 hook 负责所有顶层命令的完成提醒；遇到可能卡在确认输入的命令时，用 `tw` 执行。

## 安装

```bash
npm install -g terminal-wait-notifier
```

也可以直接从源码安装，不需要等 npm 发布：

```bash
npm install -g git+https://github.com/xiaof631/terminal-wait-notifier.git
```

或者先 clone 到本地再安装：

```bash
git clone https://github.com/xiaof631/terminal-wait-notifier.git
cd terminal-wait-notifier
npm test
npm install -g .
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

源码安装时同样可以跳过：

```bash
TWN_SKIP_AUTO_HOOK=1 npm install -g git+https://github.com/xiaof631/terminal-wait-notifier.git
TWN_SKIP_AUTO_HOOK=1 npm install -g .
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

## 诊断安装状态

如果通知没有出现、AI CLI hook 没触发，或者想确认安装脚本到底检查了哪些文件，可以先跑只读诊断：

```bash
twn status
twn status --json
twn doctor
```

`twn status` 会列出 shell hook、Codex hook、Qwen Code、Gemini CLI、Claude Code、Qoder CLI 的安装状态，并显示检查过的配置路径。`twn status --json` 适合脚本或 issue 里贴诊断结果。`twn doctor` 会给出下一步建议，例如重开终端、trust Codex hook、检查 macOS 通知权限、设置 `TWN_WEBHOOK_URL`。

这些命令默认只读，不会修改 shell rc、Codex 配置或 AI CLI settings。

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

Codex 和 AI CLI hook 默认会额外播放一次系统声音（macOS 默认 `Glass`）。普通命令默认不播放声音，避免 shell hook 在每条命令结束时都出声。

手动测试声音：

```bash
twn notify "声音测试" --sound Glass --no-webhook
```

也可以指定声音，或关闭声音：

```bash
twn run --sound Ping -- npm test
twn codex-hook --no-sound
```

macOS 上声音使用 `/System/Library/Sounds/<name>.aiff` 播放。常见名字包括 `Glass`、`Ping`、`Pop`、`Submarine`、`Tink`。

如果有声音但没有弹窗，通常是系统通知权限、专注模式或通知样式问题。到 macOS 系统设置的“通知”里检查 `osascript`、脚本编辑器或当前终端相关通知是否允许显示横幅。

如果你希望 macOS 上一定有更明显的弹窗，可以开启强提示模式。它会额外显示一个自动超时的 alert，适合 Codex/AI CLI 这类任务结束提醒，不建议给每条普通 shell 命令默认开启。

```bash
twn notify "强提示测试" --alert --sound Glass --no-webhook
twn codex-hook --alert
TWN_ALERT=1 twn ai-hook --cli qwen
```

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

## 卸载和恢复

所有卸载命令都只移除 terminal-wait-notifier 写入的 hook，不会删除配置文件、配置目录或用户自己的其他 hooks。正式执行前可以先用 `--dry-run` 预览。

卸载当前 shell 的自动完成提醒：

```bash
twn uninstall-hook zsh --dry-run
twn uninstall-hook zsh
```

卸载 Codex Stop hook：

```bash
twn uninstall-codex-hook --dry-run
twn uninstall-codex-hook
```

一键卸载 Codex + Qwen Code / Gemini CLI / Claude Code / Qoder CLI 的任务结束 hook：

```bash
twn uninstall-ai-hooks --dry-run
twn uninstall-ai-hooks
```

只卸载某一个 AI CLI：

```bash
twn uninstall-ai-hooks --cli qwen --dry-run
twn uninstall-ai-hooks --cli qwen
```

如果目标 hook 不存在，卸载命令会输出 `not found` 类提示并正常结束。重新安装可以再次执行：

```bash
twn install-hook zsh
twn install-codex-hook
twn install-ai-hooks
```

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
| `TWN_SOUND` | 播放通知声音，例如 `Glass`、`Ping`；设为 `0` 关闭 |
| `TWN_ALERT=1` | macOS 上额外显示更明显的 alert 弹窗 |
| `TWN_ALERT_TIMEOUT_SECONDS` | alert 自动关闭秒数，默认 10 |
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
