# terminal-wait-notifier

一个可以全局安装的终端提醒工具，用来处理两类场景：

- 长命令执行完成后提醒你结果。
- 命令输出里出现确认、输入、密码、继续执行等提示时提醒你回来处理。

它不绑定具体命令，适合 `npm install`、`pnpm build`、`terraform apply`、`ssh`、部署脚本、数据库迁移、AI CLI 等任何需要等待的终端操作。

## 是否必须包裹命令？

不完全是。

- 只需要“命令完成后提醒”：不需要包裹。安装 shell hook 后，你照常执行 `npm install`、`pnpm build`、`ssh`，超过阈值就会在结束时提醒。
- 需要“等待确认/输入时提醒”：需要通过 `twn run -- <command>` 或 hook 提供的短命令 `tw <command>` 执行。原因是工具必须读取命令输出，才能判断是不是出现了 `Are you sure?`、`[y/N]`、`请输入` 这类提示。

推荐用法是：安装 hook 负责所有普通长命令的完成提醒；遇到可能卡在确认输入的命令时，用 `tw` 执行。

## 安装

```bash
npm install -g terminal-wait-notifier
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

如果你想让普通长命令结束后自动提醒，可以让 `twn` 自动写入 shell 配置。

zsh:

```bash
twn install-hook zsh --min-seconds 30
```

bash:

```bash
twn install-hook bash --min-seconds 30
```

fish:

```fish
twn install-hook fish --min-seconds 30
```

这会在对应配置文件里写入一个带标记的 managed block。重复执行会更新这个 block，不会重复追加。

卸载自动注入：

```bash
twn uninstall-hook zsh
```

想先看它会写什么：

```bash
twn install-hook zsh --min-seconds 30 --dry-run
```

你也可以指定配置文件：

```bash
twn install-hook zsh --rc-file ~/.zshrc --min-seconds 30
```

如果不想写入配置文件，也可以手动 eval。

zsh:

```bash
eval "$(twn hook zsh --min-seconds 30)"
```

bash:

```bash
eval "$(twn hook bash --min-seconds 30)"
```

fish:

```fish
twn hook fish --min-seconds 30 | source
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
