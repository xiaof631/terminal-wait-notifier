const DEFAULT_PROMPT_PATTERNS = [
  {
    name: 'yes_no',
    regex: /(\[[YyNn]\/[YyNn]\]|\([Yy]es\/[Nn]o\)|\([Yy]\/[Nn]\)|\[[Yy]\/[Nn]\])/i
  },
  {
    name: 'english_confirmation',
    regex: /\b(do you want to|would you like to|are you sure|continue\?|proceed\?|confirm\?|press enter|enter password|password:|passphrase:)\b/i
  },
  {
    name: 'chinese_confirmation',
    regex: /(是否|确认|确定|继续|同意|允许).{0,30}(\?|？|：|:|\[[YyNn]|[Yy]\/[Nn])/i
  },
  {
    name: 'chinese_input',
    regex: /(请输入|请确认|请选择|请按.{0,12}(回车|enter)|输入.{0,12}(:|：))/i
  }
];

class PromptDetector {
  constructor(options = {}) {
    this.patterns = options.patterns || DEFAULT_PROMPT_PATTERNS;
    this.tail = '';
    this.tailLength = options.tailLength || 1600;
  }

  push(chunk) {
    const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
    this.tail = `${this.tail}${text}`.slice(-this.tailLength);
    return detectPrompt(this.tail, this.patterns);
  }

  reset() {
    this.tail = '';
  }
}

function detectPrompt(text, patterns = DEFAULT_PROMPT_PATTERNS) {
  const normalized = stripAnsi(String(text));
  for (const pattern of patterns) {
    const match = normalized.match(pattern.regex);
    if (match) {
      return {
        detected: true,
        name: pattern.name,
        sample: compactSample(normalized, match.index || 0)
      };
    }
  }
  return { detected: false };
}

function stripAnsi(value) {
  return value.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '');
}

function compactSample(text, index) {
  const start = Math.max(0, index - 80);
  const end = Math.min(text.length, index + 180);
  return text
    .slice(start, end)
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = {
  PromptDetector,
  detectPrompt,
  stripAnsi,
  DEFAULT_PROMPT_PATTERNS
};
