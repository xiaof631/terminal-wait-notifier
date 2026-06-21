# Positioning

## One-line Positioning

Terminal wait manager for commands and AI CLI workflows: get notified when tasks finish, fail, or wait for input.

中文：

面向 AI CLI 工作流的终端等待管理器：命令结束、失败、卡输入、AI agent 回合结束，都提醒你回来处理。

## Repository Description

Terminal wait manager for commands and AI CLI workflows: get notified when tasks finish, fail, or wait for input.

## English Launch Copy

I built terminal-wait-notifier.

It is a small CLI for people who stop watching terminal commands but still need to know when something needs attention.

It notifies you when:

- a command finishes
- a command fails
- a command is waiting for confirmation or input
- Codex / Qwen / Gemini / Claude / Qoder finishes a task

It supports desktop notifications, sound, macOS alert popups, terminal bell, and webhooks.

This is not just another notification sender. The goal is terminal wait management for AI CLI workflows.

GitHub:
https://github.com/xiaof631/terminal-wait-notifier

## 中文发布文案

我做了一个终端等待提醒工具：terminal-wait-notifier。

它不是单纯发通知，而是解决一个具体问题：你不用一直盯着终端，但需要知道命令什么时候结束、什么时候失败、什么时候其实卡在确认输入、什么时候 AI CLI 已经完成一轮任务。

它可以提醒你：

- 命令执行完成
- 命令失败退出
- 终端卡在确认/输入
- Codex / Qwen / Gemini / Claude / Qoder 一轮任务结束

支持桌面通知、声音、macOS 强弹窗、终端铃声和 webhook。

GitHub:
https://github.com/xiaof631/terminal-wait-notifier

## Product Boundary

In scope:

- Terminal command completion and failure reminders.
- Waiting-for-input detection when running through `twn run` or `tw`.
- AI CLI hook notifications for Codex, Qwen Code, Gemini CLI, Claude Code, and Qoder CLI.
- Lightweight notification outputs: desktop notification, sound, alert popup, terminal bell, webhook.

Out of scope:

- Full notification platform.
- AI agent remote control or session management.
- TTS, voice themes, or rich audio packs.
- Automatically answering prompts or reading hidden password input.
