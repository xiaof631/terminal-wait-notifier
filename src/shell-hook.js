function renderShellHook(shell, options = {}) {
  const minSeconds = Number.isFinite(options.minSeconds) ? options.minSeconds : 0;
  const notifyFlags = [
    options.desktop === false ? '--no-desktop' : '',
    options.webhook === false ? '--no-webhook' : '',
    options.bell === true ? '--bell' : '',
    renderSoundFlag(options.sound)
  ].filter(Boolean).join(' ');
  const runFlags = [`--min-seconds ${minSeconds}`, notifyFlags].filter(Boolean).join(' ');

  switch (shell) {
    case 'zsh':
      return zshHook(minSeconds, notifyFlags, runFlags);
    case 'bash':
      return bashHook(minSeconds, notifyFlags, runFlags);
    case 'fish':
      return fishHook(minSeconds, notifyFlags, runFlags);
    default:
      throw new Error(`Unsupported shell hook: ${shell}. Use zsh, bash, or fish.`);
  }
}

function zshHook(minSeconds, notifyFlags, runFlags) {
  return `# terminal-wait-notifier zsh integration
tw() {
  command twn run ${runFlags} -- "$@"
}

_twn_preexec() {
  local command="$1"
  case "$command" in
    tw\\ *|twn\\ run\\ *|command\\ twn\\ run\\ *|twn\\ --\\ *|command\\ twn\\ --\\ *|twn\\ notify\\ *|command\\ twn\\ notify\\ *)
      unset TWN_HOOK_CMD TWN_HOOK_STARTED
      return
      ;;
  esac
  export TWN_HOOK_CMD="$command"
  export TWN_HOOK_STARTED="\${EPOCHSECONDS:-$(date +%s)}"
}

_twn_precmd() {
  local status=$?
  if [[ -n "\${TWN_HOOK_CMD:-}" && -n "\${TWN_HOOK_STARTED:-}" ]]; then
    local now="\${EPOCHSECONDS:-$(date +%s)}"
    local elapsed=$(( now - TWN_HOOK_STARTED ))
    if (( elapsed >= ${minSeconds} )); then
      command twn notify ${notifyFlags} --level "$([[ $status -eq 0 ]] && echo success || echo error)" --title "Terminal command finished" --message "\${TWN_HOOK_CMD} exited $status after \${elapsed}s"
    fi
  fi
  unset TWN_HOOK_CMD TWN_HOOK_STARTED
  return $status
}

autoload -Uz add-zsh-hook
add-zsh-hook preexec _twn_preexec
add-zsh-hook precmd _twn_precmd
`;
}

function bashHook(minSeconds, notifyFlags, runFlags) {
  return `# terminal-wait-notifier bash integration
tw() {
  TWN_WRAPPED_RUNNING=1
  command twn run ${runFlags} -- "$@"
  local status=$?
  unset TWN_WRAPPED_RUNNING
  return $status
}

_twn_debug_trap() {
  local command="$BASH_COMMAND"
  [[ -n "\${TWN_WRAPPED_RUNNING:-}" ]] && return
  [[ "$command" == _twn_* ]] && return
  [[ "$command" == TWN_WRAPPED_RUNNING=* ]] && return
  [[ "$command" == tw\\ * ]] && { unset TWN_HOOK_CMD TWN_HOOK_STARTED; return; }
  [[ "$command" == "twn run"* ]] && { unset TWN_HOOK_CMD TWN_HOOK_STARTED; return; }
  [[ "$command" == "command twn run"* ]] && { unset TWN_HOOK_CMD TWN_HOOK_STARTED; return; }
  [[ "$command" == "twn --"* ]] && { unset TWN_HOOK_CMD TWN_HOOK_STARTED; return; }
  [[ "$command" == "command twn --"* ]] && { unset TWN_HOOK_CMD TWN_HOOK_STARTED; return; }
  [[ "$command" == "command twn notify"* ]] && { unset TWN_HOOK_CMD TWN_HOOK_STARTED; return; }
  [[ "$command" == "twn notify"* ]] && { unset TWN_HOOK_CMD TWN_HOOK_STARTED; return; }
  TWN_HOOK_CMD="$command"
  TWN_HOOK_STARTED="$(date +%s)"
}

_twn_prompt_command() {
  local status=$?
  if [[ -n "\${TWN_HOOK_CMD:-}" && -n "\${TWN_HOOK_STARTED:-}" ]]; then
    local now="$(date +%s)"
    local elapsed=$(( now - TWN_HOOK_STARTED ))
    if (( elapsed >= ${minSeconds} )); then
      command twn notify ${notifyFlags} --level "$([[ $status -eq 0 ]] && echo success || echo error)" --title "Terminal command finished" --message "\${TWN_HOOK_CMD} exited $status after \${elapsed}s"
    fi
  fi
  unset TWN_HOOK_CMD TWN_HOOK_STARTED
  return $status
}

trap _twn_debug_trap DEBUG
PROMPT_COMMAND="_twn_prompt_command\${PROMPT_COMMAND:+;$PROMPT_COMMAND}"
`;
}

function fishHook(minSeconds, notifyFlags, runFlags) {
  return `# terminal-wait-notifier fish integration
function tw
  command twn run ${runFlags} -- $argv
end

function __twn_preexec --on-event fish_preexec
  set -gx TWN_HOOK_CMD "$argv"
  set -gx TWN_HOOK_STARTED (date +%s)
end

function __twn_postexec --on-event fish_postexec
  set -l status $status
  if string match -qr '^(tw |twn run |command twn run |twn -- |command twn -- |twn notify |command twn notify )' -- "$TWN_HOOK_CMD"
    set -e TWN_HOOK_CMD
    set -e TWN_HOOK_STARTED
    return $status
  end
  if test -n "$TWN_HOOK_CMD"; and test -n "$TWN_HOOK_STARTED"
    set -l now (date +%s)
    set -l elapsed (math "$now - $TWN_HOOK_STARTED")
    if test "$elapsed" -ge ${minSeconds}
      command twn notify ${notifyFlags} --level (test $status -eq 0; and echo success; or echo error) --title "Terminal command finished" --message "$TWN_HOOK_CMD exited $status after "$elapsed"s"
    end
  end
  set -e TWN_HOOK_CMD
  set -e TWN_HOOK_STARTED
end
`;
}

function renderSoundFlag(sound) {
  if (sound === false) return '--no-sound';
  if (typeof sound === 'string' && sound.trim()) {
    return `--sound ${shellQuote(sound)}`;
  }
  return '';
}

function shellQuote(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_./:=@+-]+$/.test(text)) return text;
  return `'${text.replace(/'/g, "'\\''")}'`;
}

module.exports = {
  renderShellHook
};
