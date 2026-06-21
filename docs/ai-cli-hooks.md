# AI CLI Hook Compatibility

This document records the hook contract used by terminal-wait-notifier for AI CLI workflow notifications. It is a compatibility surface, not a claim that every upstream payload field is supported.

Verified on: 2026-06-21.

## Integration Matrix

| CLI | Status | Config path | Event | Hook command | Fixture |
| --- | --- | --- | --- | --- | --- |
| Codex | Experimental | `~/.codex/config.toml` through `codex app-server --stdio` | `Stop` | `twn codex-hook` | `test/fixtures/ai-cli-hooks/codex` |
| Qwen Code | Documented | `~/.qwen/settings.json` | `Stop` | `twn ai-hook --cli qwen` | `test/fixtures/ai-cli-hooks/qwen` |
| Gemini CLI | Documented | `~/.gemini/settings.json` | `AfterAgent` | `twn ai-hook --cli gemini` | `test/fixtures/ai-cli-hooks/gemini` |
| Claude Code | Documented | `~/.claude/settings.json` | `Stop` | `twn ai-hook --cli claude` | `test/fixtures/ai-cli-hooks/claude` |
| Qoder CLI | Experimental | `~/.qoder/settings.json` | `Stop` | `twn ai-hook --cli qoder` | `test/fixtures/ai-cli-hooks/qoder` |

## Sources

- Qwen Code hooks: https://github.com/QwenLM/qwen-code/blob/main/docs/users/features/hooks.md
- Qwen Code settings: https://github.com/QwenLM/qwen-code/blob/main/docs/users/configuration/settings.md
- Gemini CLI hooks: https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/index.md
- Gemini CLI hook reference: https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/reference.md
- Claude Code hooks: https://code.claude.com/docs/en/hooks

## Payload Handling

`twn ai-hook --cli <name>` reads JSON from stdin. The notification summary uses the first populated field in this order:

1. `last_assistant_message`
2. `lastAssistantMessage`
3. `prompt_response`
4. `promptResponse`
5. `assistant_message`
6. `assistantMessage`
7. `response`
8. `message`
9. `summary`
10. `error`
11. `prompt`

The fixtures under `test/fixtures/ai-cli-hooks/*/payload.json` cover the minimum fields needed to verify notification title, summary, event name, and working directory normalization.

## Known Limits

Codex support is marked experimental because this project writes the `Stop` hook through `codex app-server --stdio`, and the app-server configuration API is treated here as an internal or evolving interface.

Qoder support is marked experimental because no public hook schema source was confirmed during this pass. The current support assumes a Claude/Qwen-like JSON settings shape at `~/.qoder/settings.json` and a `Stop` event.

Fixtures intentionally stay small. When upstream hook schemas add or change fields, update the fixture payload and the merge expectation in the same change.
