# Demo and Launch Notes

This document turns the product positioning into reusable demo material. It should stay aligned with the README and with `docs/positioning.md`.

## 30-second Demo Flow

1. Command completion: run a short wrapped command and show the completion notification.

```bash
twn run --title "Build" -- node examples/slow-success.js 2
```

2. Waiting input: run the local confirmation demo and show that the notification includes the detector name and sample.

```bash
twn run --title "Confirm demo" --prompt-throttle-seconds 10 -- node examples/wait-for-confirm.js
```

3. AI CLI turn completion: simulate a hook payload without requiring a real AI CLI install.

```bash
echo '{"hook_event_name":"Stop","prompt_response":"AI CLI task done","cwd":"/tmp/demo"}' | twn ai-hook --cli qwen --no-webhook
```

4. Strong macOS popup: show the fallback for notifications that are too quiet.

```bash
twn notify "Build finished" --alert --sound Glass --no-webhook
```

## Screenshot and GIF Checklist

- Terminal showing `twn run --title "Build" -- node examples/slow-success.js 2`.
- Desktop notification for command completion.
- Terminal showing `Deploy to production? [y/N]`.
- Waiting-input notification showing `yes_no` and the truncated prompt sample.
- AI CLI hook notification from the simulated `prompt_response` payload.
- macOS alert popup from `twn notify "Build finished" --alert --sound Glass --no-webhook`.
- Optional webhook capture showing event, message, command, cwd, and timestamp fields.

## Chinese Twitter/X Thread Copy

我做了一个终端等待管理工具：terminal-wait-notifier。

它不只是“命令结束发个通知”。

它会提醒你：

- 命令完成或失败
- 命令其实卡在确认/输入
- Codex / Qwen / Gemini / Claude / Qoder 完成一轮任务
- macOS 通知太静默时，用声音或 alert 强提示

适合不想一直盯着终端，但又怕错过 `terraform apply`、`npm create`、`ssh`、AI CLI 任务结束的人。

GitHub:
https://github.com/xiaof631/terminal-wait-notifier

## English Twitter/X Thread Copy

I built terminal-wait-notifier.

It is a terminal wait manager for commands and AI CLI workflows.

It notifies you when:

- a command finishes or fails
- a command is stuck waiting for input
- Codex / Qwen / Gemini / Claude / Qoder finishes a turn
- macOS notifications are too quiet and you need sound or an alert popup

The differentiator is not notification delivery. It is knowing when the terminal needs your attention.

GitHub:
https://github.com/xiaof631/terminal-wait-notifier

## Single-post Twitter/X Variants

中文短版：

terminal-wait-notifier：面向 AI CLI 工作流的终端等待管理器。命令结束、失败、卡输入、AI CLI 回合结束，都会提醒你回来处理。

English short version:

terminal-wait-notifier is a terminal wait manager for commands and AI CLI workflows. It tells you when a command finishes, fails, waits for input, or when an AI CLI turn completes.
