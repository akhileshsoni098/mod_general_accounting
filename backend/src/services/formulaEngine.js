const BigNumber = require('bignumber.js');

/**
 * Token types:
 * - NUMBER: e.g. "100", "0.25", "15.50"
 * - PATH: e.g. "payload.premium_amount", "params.tax_rate"
 * - OP: '+', '-', '*', '/'
 * - LPAREN: '('
 * - RPAREN: ')'
 */

function tokenize(expr) {
  const tokens = [];
  let i = 0;
  const str = expr.trim();

  while (i < str.length) {
    const ch = str[i];

    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    // Logical OR / fallback operator '||'
    if (ch === '|' && str[i + 1] === '|') {
      tokens.push({ type: 'LOGICAL_OR', value: '||' });
      i += 2;
      continue;
    }

    if (ch === '+' || ch === '-' || ch === '*' || ch === '/' || ch === '(' || ch === ')') {
      tokens.push({ type: ch === '(' ? 'LPAREN' : ch === ')' ? 'RPAREN' : 'OP', value: ch });
      i++;
      continue;
    }

    // Number literal
    if (/[0-9]/.test(ch)) {
      let numStr = '';
      while (i < str.length && /[0-9.]/.test(str[i])) {
        numStr += str[i];
        i++;
      }
      tokens.push({ type: 'NUMBER', value: numStr });
      continue;
    }

    // Identifiers / dot-notation paths (e.g. payload.amount, params.rate)
    if (/[a-zA-Z_]/.test(ch)) {
      let idStr = '';
      while (i < str.length && /[a-zA-Z0-9_.]/.test(str[i])) {
        idStr += str[i];
        i++;
      }

      // Security check: Reject forbidden identifiers
      const forbidden = [
        'process',
        'require',
        'global',
        'window',
        'eval',
        'function',
        'constructor',
        'prototype',
        '__proto__',
        'import',
        'export'
      ];
      const lower = idStr.toLowerCase();
      for (const f of forbidden) {
        if (lower === f || lower.startsWith(`${f}.`) || lower.endsWith(`.${f}`) || lower.includes(`.${f}.`)) {
          throw new Error(`Forbidden identifier "${idStr}" in formula expression`);
        }
      }

      tokens.push({ type: 'PATH', value: idStr });
      continue;
    }

    throw new Error(`Unexpected character in formula expression: "${ch}"`);
  }

  return tokens;
}

/**
 * Recursive descent parser into safe AST:
 * Expression := Term (('+' | '-') Term)*
 * Term       := Factor (('*' | '/') Factor)*
 * Factor     := NUMBER | PATH | '(' Expression ')' | ('-' Factor)
 */
class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
  }

  peek() {
    return this.tokens[this.pos] || null;
  }

  consume() {
    return this.tokens[this.pos++];
  }

  parse() {
    if (!this.tokens || this.tokens.length === 0) {
      throw new Error('Empty formula expression');
    }
    const node = this.parseOrExpression();
    if (this.pos < this.tokens.length) {
      throw new Error(`Unexpected token at position ${this.pos}: "${this.peek().value}"`);
    }
    return node;
  }

  parseOrExpression() {
    let left = this.parseExpression();

    while (this.peek() && this.peek().type === 'LOGICAL_OR') {
      const op = this.consume().value;
      const right = this.parseExpression();
      left = { type: 'LOGICAL_OR', op, left, right };
    }

    return left;
  }

  parseExpression() {
    let left = this.parseTerm();

    while (this.peek() && (this.peek().value === '+' || this.peek().value === '-')) {
      const op = this.consume().value;
      const right = this.parseTerm();
      left = { type: 'BINARY_OP', op, left, right };
    }

    return left;
  }

  parseTerm() {
    let left = this.parseFactor();

    while (this.peek() && (this.peek().value === '*' || this.peek().value === '/')) {
      const op = this.consume().value;
      const right = this.parseFactor();
      left = { type: 'BINARY_OP', op, left, right };
    }

    return left;
  }

  parseFactor() {
    const token = this.peek();
    if (!token) {
      throw new Error('Unexpected end of expression');
    }

    // Unary minus
    if (token.type === 'OP' && token.value === '-') {
      this.consume();
      const operand = this.parseFactor();
      return { type: 'UNARY_OP', op: '-', operand };
    }

    if (token.type === 'NUMBER') {
      this.consume();
      return { type: 'LITERAL', value: token.value };
    }

    if (token.type === 'PATH') {
      this.consume();
      return { type: 'PATH', path: token.value };
    }

    if (token.type === 'LPAREN') {
      this.consume();
      const node = this.parseOrExpression();
      const closing = this.peek();
      if (!closing || closing.type !== 'RPAREN') {
        throw new Error('Missing closing parenthesis ")" in formula expression');
      }
      this.consume();
      return node;
    }

    throw new Error(`Unexpected token: "${token.value}"`);
  }
}

/**
 * Resolve a dot-path (e.g. "payload.premium_amount" or "premium_amount") from context
 */
function resolvePath(path, context) {
  const parts = path.split('.');
  let current = context;

  // If path starts with "payload." and context has payload property, strip or use context.payload
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = current[part];
  }

  return current;
}

/**
 * Evaluates an AST node with BigNumber decimal-safe arithmetic
 */
function evaluateNode(node, context) {
  switch (node.type) {
    case 'LITERAL':
      return new BigNumber(node.value);

    case 'PATH': {
      let raw = resolvePath(node.path, context);
      if (raw === undefined && !node.path.startsWith('payload.') && context.payload) {
        raw = resolvePath(`payload.${node.path}`, context);
      }

      if (raw === undefined || raw === null || raw === '') {
        throw new Error(`Missing required formula field: "${node.path}"`);
      }

      const bn = new BigNumber(raw.toString());
      if (bn.isNaN()) {
        throw new Error(`Formula field "${node.path}" is not a valid number: "${raw}"`);
      }
      return bn;
    }

    case 'UNARY_OP': {
      if (node.op === '-') {
        return evaluateNode(node.operand, context).negated();
      }
      throw new Error(`Unsupported unary operator: "${node.op}"`);
    }

    case 'BINARY_OP': {
      const left = evaluateNode(node.left, context);
      const right = evaluateNode(node.right, context);

      switch (node.op) {
        case '+':
          return left.plus(right);
        case '-':
          return left.minus(right);
        case '*':
          return left.multipliedBy(right);
        case '/':
          if (right.isZero()) {
            throw new Error('Division by zero encountered in formula evaluation');
          }
          return left.dividedBy(right);
        default:
          throw new Error(`Unsupported binary operator: "${node.op}"`);
      }
    }

    case 'LOGICAL_OR': {
      try {
        const left = evaluateNode(node.left, context);
        if (left && !left.isNaN() && !left.isZero()) {
          return left;
        }
      } catch (err) {
        // Left side failed (e.g. missing optional field in payload)
      }
      return evaluateNode(node.right, context);
    }

    default:
      throw new Error(`Unknown AST node type: "${node.type}"`);
  }
}

/**
 * Parse an expression string into AST
 */
function parseFormula(expression) {
  if (!expression || typeof expression !== 'string' || !expression.trim()) {
    throw new Error('Expression must be a non-empty string');
  }
  const tokens = tokenize(expression);
  const parser = new Parser(tokens);
  return parser.parse();
}

/**
 * Safely evaluates a formula expression against a context { payload, params }
 * Returns formatted decimal string (2 decimal places by default)
 */
function evaluateFormula(expression, context = {}, { roundingMode = 'ROUND_HALF_UP', decimals = 2 } = {}) {
  const ast = typeof expression === 'object' && expression.type ? expression : parseFormula(expression);
  const resultBN = evaluateNode(ast, context);

  let rm = BigNumber.ROUND_HALF_UP;
  if (roundingMode === 'ROUND_DOWN') rm = BigNumber.ROUND_DOWN;
  else if (roundingMode === 'ROUND_UP') rm = BigNumber.ROUND_UP;

  return resultBN.dp(decimals, rm).toFixed(decimals);
}

module.exports = {
  tokenize,
  parseFormula,
  evaluateFormula
};
