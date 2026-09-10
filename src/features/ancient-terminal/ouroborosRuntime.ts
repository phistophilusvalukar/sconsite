export type OuroValue = null | boolean | number | string | OuroValue[] | { [key: string]: OuroValue };

export type OuroborosLimits = {
  maxCallDepth: number;
  maxOutputCharacters: number;
  maxSteps: number;
};

export type OuroborosRequest = {
  args?: OuroValue[];
  functionName?: string;
  globals?: Record<string, OuroValue>;
  limits?: Partial<OuroborosLimits>;
  source: string;
};

export type OuroborosResult = {
  functions: string[];
  output: string[];
  result: OuroValue;
  steps: number;
};

export type OuroborosFailure = {
  column: number;
  kind: 'SyntaxError' | 'RuntimeError' | 'LimitError';
  line: number;
  message: string;
};

type Located = { line: number; column: number };
type Expression =
  | (Located & { type: 'literal'; value: OuroValue })
  | (Located & { type: 'name'; name: string })
  | (Located & { type: 'list'; items: Expression[] })
  | (Located & { type: 'dictionary'; entries: { key: string; value: Expression }[] })
  | (Located & { type: 'member'; object: Expression; property: string })
  | (Located & { type: 'call'; callee: Expression; args: Expression[] })
  | (Located & { type: 'unary'; operator: string; operand: Expression })
  | (Located & { type: 'binary'; operator: string; left: Expression; right: Expression });

type Statement =
  | (Located & { type: 'return'; value: Expression | null })
  | (Located & { type: 'assign'; name: string; value: Expression })
  | (Located & { type: 'expression'; value: Expression })
  | (Located & { type: 'if'; condition: Expression; thenBody: Statement[]; elseBody: Statement[] })
  | (Located & { type: 'while'; condition: Expression; body: Statement[] })
  | (Located & { type: 'for'; name: string; iterable: Expression; body: Statement[] })
  | (Located & { type: 'pass' });

type FunctionDefinition = Located & { name: string; parameters: string[]; body: Statement[] };
type SourceLine = { content: string; indent: number; line: number };
type Token = Located & { kind: 'number' | 'string' | 'identifier' | 'operator' | 'punctuation' | 'eof'; text: string };

const DEFAULT_LIMITS: OuroborosLimits = {
  maxCallDepth: 32,
  maxOutputCharacters: 16_384,
  maxSteps: 50_000,
};

class OuroborosError extends Error {
  constructor(
    readonly kind: OuroborosFailure['kind'],
    message: string,
    readonly line: number,
    readonly column: number,
  ) {
    super(message);
  }
}

function syntax(message: string, line: number, column = 1): never {
  throw new OuroborosError('SyntaxError', message, line, column);
}

function tokenizeExpression(source: string, line: number, columnOffset: number): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < source.length) {
    const character = source[index];
    if (/\s/.test(character)) { index += 1; continue; }
    const column = columnOffset + index;
    if (/\d/.test(character)) {
      const start = index;
      while (index < source.length && /[\d.]/.test(source[index])) index += 1;
      const text = source.slice(start, index);
      if (!/^\d+(?:\.\d+)?$/.test(text)) syntax(`invalid number '${text}'`, line, column);
      tokens.push({ kind: 'number', text, line, column });
      continue;
    }
    if (/[A-Za-z_]/.test(character)) {
      const start = index;
      while (index < source.length && /[A-Za-z0-9_]/.test(source[index])) index += 1;
      const text = source.slice(start, index);
      tokens.push({ kind: ['and', 'or', 'not'].includes(text.toLowerCase()) ? 'operator' : 'identifier', text, line, column });
      continue;
    }
    if (character === '"' || character === "'") {
      const quote = character;
      const start = index;
      index += 1;
      let value = '';
      let closed = false;
      while (index < source.length) {
        const next = source[index];
        if (next === quote) { closed = true; index += 1; break; }
        if (next === '\\') {
          index += 1;
          if (index >= source.length) break;
          const escaped = source[index];
          value += escaped === 'n' ? '\n' : escaped === 't' ? '\t' : escaped;
          index += 1;
          continue;
        }
        value += next;
        index += 1;
      }
      if (!closed) syntax('unterminated string', line, columnOffset + start);
      tokens.push({ kind: 'string', text: value, line, column });
      continue;
    }
    const twoCharacters = source.slice(index, index + 2);
    if (['==', '!=', '<=', '>='].includes(twoCharacters)) {
      tokens.push({ kind: 'operator', text: twoCharacters, line, column });
      index += 2;
      continue;
    }
    if ('+-*/%<>'.includes(character)) {
      tokens.push({ kind: 'operator', text: character, line, column });
      index += 1;
      continue;
    }
    if ('()[],.{}:'.includes(character)) {
      tokens.push({ kind: 'punctuation', text: character, line, column });
      index += 1;
      continue;
    }
    syntax(`unexpected character '${character}'`, line, column);
  }
  tokens.push({ kind: 'eof', text: '', line, column: columnOffset + source.length });
  return tokens;
}

class ExpressionParser {
  private index = 0;
  constructor(private readonly tokens: Token[]) {}

  parse(): Expression {
    const expression = this.parseBinary(1);
    const trailing = this.peek();
    if (trailing.kind !== 'eof') syntax(`unexpected token '${trailing.text}'`, trailing.line, trailing.column);
    return expression;
  }

  private peek(): Token { return this.tokens[this.index]; }
  private consume(): Token { return this.tokens[this.index++]; }
  private match(text: string): boolean {
    if (this.peek().text.toLowerCase() !== text) return false;
    this.index += 1;
    return true;
  }
  private expect(text: string): Token {
    const token = this.consume();
    if (token.text !== text) syntax(`expected '${text}'`, token.line, token.column);
    return token;
  }

  private parseBinary(minimumPrecedence: number): Expression {
    let left = this.parseUnary();
    const precedence: Record<string, number> = { or: 1, and: 2, '==': 3, '!=': 3, '<': 3, '<=': 3, '>': 3, '>=': 3, '+': 4, '-': 4, '*': 5, '/': 5, '%': 5 };
    while (true) {
      const token = this.peek();
      const operator = token.text.toLowerCase();
      const currentPrecedence = precedence[operator] ?? 0;
      if (currentPrecedence < minimumPrecedence) break;
      this.consume();
      const right = this.parseBinary(currentPrecedence + 1);
      left = { type: 'binary', operator, left, right, line: token.line, column: token.column };
    }
    return left;
  }

  private parseUnary(): Expression {
    const token = this.peek();
    const operator = token.text.toLowerCase();
    if (operator === 'not' || operator === '-' || operator === '+') {
      this.consume();
      return { type: 'unary', operator, operand: this.parseUnary(), line: token.line, column: token.column };
    }
    return this.parsePostfix();
  }

  private parsePostfix(): Expression {
    let expression = this.parsePrimary();
    while (true) {
      if (this.match('.')) {
        const property = this.consume();
        if (property.kind !== 'identifier') syntax('expected property name', property.line, property.column);
        expression = { type: 'member', object: expression, property: property.text, line: property.line, column: property.column };
        continue;
      }
      if (this.match('(')) {
        const args: Expression[] = [];
        if (!this.match(')')) {
          do { args.push(this.parseBinary(1)); } while (this.match(','));
          this.expect(')');
        }
        expression = { type: 'call', callee: expression, args, line: expression.line, column: expression.column };
        continue;
      }
      return expression;
    }
  }

  private parsePrimary(): Expression {
    const token = this.consume();
    if (token.kind === 'number') return { type: 'literal', value: Number(token.text), line: token.line, column: token.column };
    if (token.kind === 'string') return { type: 'literal', value: token.text, line: token.line, column: token.column };
    if (token.kind === 'identifier') {
      const keyword = token.text.toLowerCase();
      if (keyword === 'true') return { type: 'literal', value: true, line: token.line, column: token.column };
      if (keyword === 'false') return { type: 'literal', value: false, line: token.line, column: token.column };
      if (keyword === 'none' || keyword === 'null') return { type: 'literal', value: null, line: token.line, column: token.column };
      return { type: 'name', name: token.text, line: token.line, column: token.column };
    }
    if (token.text === '(') {
      const expression = this.parseBinary(1);
      this.expect(')');
      return expression;
    }
    if (token.text === '[') {
      const items: Expression[] = [];
      if (!this.match(']')) {
        do { items.push(this.parseBinary(1)); } while (this.match(','));
        this.expect(']');
      }
      return { type: 'list', items, line: token.line, column: token.column };
    }
    if (token.text === '{') {
      const entries: { key: string; value: Expression }[] = [];
      if (!this.match('}')) {
        do {
          const key = this.consume();
          if (key.kind !== 'identifier' && key.kind !== 'string') syntax('dictionary keys must be names or strings', key.line, key.column);
          this.expect(':');
          entries.push({ key: key.text, value: this.parseBinary(1) });
        } while (this.match(','));
        this.expect('}');
      }
      return { type: 'dictionary', entries, line: token.line, column: token.column };
    }
    syntax('expected expression', token.line, token.column);
  }
}

function parseExpression(source: string, line: number, columnOffset: number): Expression {
  if (!source.trim()) syntax('expected expression', line, columnOffset);
  return new ExpressionParser(tokenizeExpression(source, line, columnOffset)).parse();
}

function sourceLines(source: string): SourceLine[] {
  return source.split(/\r?\n/).map((raw, index) => {
    if (/^\s*\t/.test(raw)) syntax('tabs are not allowed; use spaces for indentation', index + 1, 1);
    const indent = raw.match(/^ */)?.[0].length ?? 0;
    return { content: raw.slice(indent), indent, line: index + 1 };
  });
}

function nextMeaningful(lines: SourceLine[], start: number): number {
  let index = start;
  while (index < lines.length && (!lines[index].content.trim() || lines[index].content.trimStart().startsWith('#'))) index += 1;
  return index;
}

function parseBlock(lines: SourceLine[], start: number, indent: number): { body: Statement[]; next: number } {
  const body: Statement[] = [];
  let index = start;
  while (index < lines.length) {
    index = nextMeaningful(lines, index);
    if (index >= lines.length || lines[index].indent < indent) break;
    const line = lines[index];
    if (line.indent > indent) syntax('unexpected indentation', line.line, 1);
    const text = line.content.trimEnd();
    const column = line.indent + 1;
    if (text === 'pass') { body.push({ type: 'pass', line: line.line, column }); index += 1; continue; }
    if (text.startsWith('return') && (text.length === 6 || /\s/.test(text[6]))) {
      const value = text.slice(6).trim();
      body.push({ type: 'return', value: value ? parseExpression(value, line.line, line.content.indexOf(value) + column) : null, line: line.line, column });
      index += 1;
      continue;
    }
    const blockMatch = text.match(/^(if|while)\s+(.+):$/);
    const forMatch = text.match(/^for\s+([A-Za-z_][A-Za-z0-9_]*)\s+in\s+(.+):$/);
    if (blockMatch || forMatch) {
      const childIndex = nextMeaningful(lines, index + 1);
      if (childIndex >= lines.length || lines[childIndex].indent <= indent) syntax('expected an indented block', line.line, text.length);
      const childIndent = lines[childIndex].indent;
      const parsedBody = parseBlock(lines, childIndex, childIndent);
      if (forMatch) {
        body.push({ type: 'for', name: forMatch[1], iterable: parseExpression(forMatch[2], line.line, line.content.indexOf(forMatch[2]) + column), body: parsedBody.body, line: line.line, column });
        index = parsedBody.next;
        continue;
      }
      const condition = parseExpression(blockMatch![2], line.line, line.content.indexOf(blockMatch![2]) + column);
      if (blockMatch![1] === 'while') {
        body.push({ type: 'while', condition, body: parsedBody.body, line: line.line, column });
        index = parsedBody.next;
        continue;
      }
      let elseBody: Statement[] = [];
      index = nextMeaningful(lines, parsedBody.next);
      if (index < lines.length && lines[index].indent === indent && lines[index].content.trim() === 'else:') {
        const elseLine = lines[index];
        const elseIndex = nextMeaningful(lines, index + 1);
        if (elseIndex >= lines.length || lines[elseIndex].indent <= indent) syntax('expected an indented block', elseLine.line, elseLine.content.length);
        const parsedElse = parseBlock(lines, elseIndex, lines[elseIndex].indent);
        elseBody = parsedElse.body;
        index = parsedElse.next;
      }
      body.push({ type: 'if', condition, thenBody: parsedBody.body, elseBody, line: line.line, column });
      continue;
    }
    if (/^(if|while|for)\b/.test(text)) syntax("expected ':' after block declaration", line.line, text.length + column);
    const assignment = text.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=(?!=)\s*(.+)$/);
    if (assignment) {
      body.push({ type: 'assign', name: assignment[1], value: parseExpression(assignment[2], line.line, line.content.indexOf(assignment[2]) + column), line: line.line, column });
      index += 1;
      continue;
    }
    body.push({ type: 'expression', value: parseExpression(text, line.line, column), line: line.line, column });
    index += 1;
  }
  return { body, next: index };
}

function parseProgram(source: string): Map<string, FunctionDefinition> {
  if (source.length > 65_536) syntax('source exceeds 65536 characters', 1, 1);
  const lines = sourceLines(source);
  const functions = new Map<string, FunctionDefinition>();
  let index = 0;
  while ((index = nextMeaningful(lines, index)) < lines.length) {
    const line = lines[index];
    if (line.indent !== 0) syntax('top-level declarations cannot be indented', line.line, 1);
    const match = line.content.trimEnd().match(/^fn\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*(:)?$/);
    if (!match || !match[3]) syntax("expected 'fn name(...):'", line.line, line.content.length + 1);
    const parameters = match[2].trim() ? match[2].split(',').map(parameter => parameter.trim()) : [];
    if (parameters.some(parameter => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(parameter)) || new Set(parameters).size !== parameters.length) {
      syntax('invalid or duplicate function parameter', line.line, line.content.indexOf('(') + 2);
    }
    const bodyIndex = nextMeaningful(lines, index + 1);
    if (bodyIndex >= lines.length || lines[bodyIndex].indent === 0) syntax('expected an indented function body', line.line, line.content.length);
    const parsed = parseBlock(lines, bodyIndex, lines[bodyIndex].indent);
    const key = match[1].toLowerCase();
    if (functions.has(key)) syntax(`duplicate function '${match[1]}'`, line.line, 1);
    functions.set(key, { name: match[1], parameters, body: parsed.body, line: line.line, column: 1 });
    index = parsed.next;
  }
  return functions;
}

export function formatOuroborosValue(value: OuroValue): string {
  if (value === null) return 'None';
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  if (Array.isArray(value)) return `[${value.map(formatOuroborosValue).join(', ')}]`;
  if (typeof value === 'object') return `{${Object.entries(value).map(([key, child]) => `${key}: ${formatOuroborosValue(child)}`).join(', ')}}`;
  return String(value);
}

function truthy(value: OuroValue): boolean {
  if (value === null || value === false || value === 0 || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

export function executeOuroboros(request: OuroborosRequest): OuroborosResult {
  const limits = { ...DEFAULT_LIMITS, ...request.limits };
  const functions = parseProgram(request.source);
  const output: string[] = [];
  let outputCharacters = 0;
  let steps = 0;

  const step = (location: Located) => {
    steps += 1;
    if (steps > limits.maxSteps) throw new OuroborosError('LimitError', `execution exceeded ${limits.maxSteps} steps`, location.line, location.column);
  };
  const fail = (message: string, location: Located): never => {
    throw new OuroborosError('RuntimeError', message, location.line, location.column);
  };

  const evaluate = (expression: Expression, scope: Map<string, OuroValue>, depth: number): OuroValue => {
    step(expression);
    if (expression.type === 'literal') return expression.value;
    if (expression.type === 'name') {
      if (scope.has(expression.name)) return scope.get(expression.name)!;
      if (request.globals && Object.prototype.hasOwnProperty.call(request.globals, expression.name)) return request.globals[expression.name];
      if (['print', 'range', 'len', 'str', 'int'].includes(expression.name.toLowerCase()) || functions.has(expression.name.toLowerCase())) {
        return { __callable__: expression.name };
      }
      return fail(`name '${expression.name}' is not defined`, expression);
    }
    if (expression.type === 'list') return expression.items.map(item => evaluate(item, scope, depth));
    if (expression.type === 'dictionary') return Object.fromEntries(expression.entries.map(entry => [entry.key, evaluate(entry.value, scope, depth)]));
    if (expression.type === 'member') {
      const object = evaluate(expression.object, scope, depth);
      if (Array.isArray(object) && ['count', 'length'].includes(expression.property)) return object.length;
      if (typeof object === 'string' && expression.property === 'length') return object.length;
      if (object && typeof object === 'object' && !Array.isArray(object) && Object.prototype.hasOwnProperty.call(object, expression.property)) return object[expression.property];
      return fail(`property '${expression.property}' is not available`, expression);
    }
    if (expression.type === 'unary') {
      const value = evaluate(expression.operand, scope, depth);
      if (expression.operator === 'not') return !truthy(value);
      if (typeof value !== 'number') return fail(`operator '${expression.operator}' requires a number`, expression);
      return expression.operator === '-' ? -value : value;
    }
    if (expression.type === 'binary') {
      const left = evaluate(expression.left, scope, depth);
      if (expression.operator === 'and') return truthy(left) ? evaluate(expression.right, scope, depth) : left;
      if (expression.operator === 'or') return truthy(left) ? left : evaluate(expression.right, scope, depth);
      const right = evaluate(expression.right, scope, depth);
      if (expression.operator === '==') return JSON.stringify(left) === JSON.stringify(right);
      if (expression.operator === '!=') return JSON.stringify(left) !== JSON.stringify(right);
      if (['<', '<=', '>', '>='].includes(expression.operator)) {
        if ((typeof left !== 'number' || typeof right !== 'number') && (typeof left !== 'string' || typeof right !== 'string')) return fail('comparison requires two numbers or two strings', expression);
        if (expression.operator === '<') return left < right;
        if (expression.operator === '<=') return left <= right;
        if (expression.operator === '>') return left > right;
        return left >= right;
      }
      if (expression.operator === '+' && (typeof left === 'string' || typeof right === 'string')) return formatOuroborosValue(left) + formatOuroborosValue(right);
      if (typeof left !== 'number' || typeof right !== 'number') return fail(`operator '${expression.operator}' requires numbers`, expression);
      if ((expression.operator === '/' || expression.operator === '%') && right === 0) return fail('division by zero', expression);
      if (expression.operator === '+') return left + right;
      if (expression.operator === '-') return left - right;
      if (expression.operator === '*') return left * right;
      if (expression.operator === '/') return left / right;
      return left % right;
    }
    const callee = evaluate(expression.callee, scope, depth);
    if (!callee || typeof callee !== 'object' || Array.isArray(callee) || typeof callee.__callable__ !== 'string') return fail('value is not callable', expression);
    const name = callee.__callable__;
    const args = expression.args.map(argument => evaluate(argument, scope, depth));
    const builtin = name.toLowerCase();
    if (builtin === 'print') {
      const line = args.map(formatOuroborosValue).join(' ');
      outputCharacters += line.length + 1;
      if (outputCharacters > limits.maxOutputCharacters) throw new OuroborosError('LimitError', `output exceeded ${limits.maxOutputCharacters} characters`, expression.line, expression.column);
      output.push(line);
      return null;
    }
    if (builtin === 'len') {
      if (args.length !== 1 || (typeof args[0] !== 'string' && !Array.isArray(args[0]) && (typeof args[0] !== 'object' || args[0] === null))) return fail('len expects one collection', expression);
      return typeof args[0] === 'string' || Array.isArray(args[0]) ? args[0].length : Object.keys(args[0]).length;
    }
    if (builtin === 'str') { if (args.length !== 1) return fail('str expects one value', expression); return formatOuroborosValue(args[0]); }
    if (builtin === 'int') {
      if (args.length !== 1) return fail('int expects one value', expression);
      const value = Number.parseInt(String(args[0]), 10);
      if (!Number.isFinite(value)) return fail('value cannot be converted to int', expression);
      return value;
    }
    if (builtin === 'range') {
      if (args.length < 1 || args.length > 2 || args.some(argument => typeof argument !== 'number' || !Number.isInteger(argument))) return fail('range expects one or two integers', expression);
      const start = args.length === 1 ? 0 : args[0] as number;
      const end = args.length === 1 ? args[0] as number : args[1] as number;
      if (Math.abs(end - start) > limits.maxSteps) return fail('range is too large', expression);
      return Array.from({ length: Math.max(0, end - start) }, (_, index) => start + index);
    }
    return invoke(name, args, depth + 1, expression);
  };

  const executeBlock = (body: Statement[], scope: Map<string, OuroValue>, depth: number): { returned: boolean; value: OuroValue } => {
    for (const statement of body) {
      step(statement);
      if (statement.type === 'pass') continue;
      if (statement.type === 'return') return { returned: true, value: statement.value ? evaluate(statement.value, scope, depth) : null };
      if (statement.type === 'assign') { scope.set(statement.name, evaluate(statement.value, scope, depth)); continue; }
      if (statement.type === 'expression') { evaluate(statement.value, scope, depth); continue; }
      if (statement.type === 'if') {
        const result = executeBlock(truthy(evaluate(statement.condition, scope, depth)) ? statement.thenBody : statement.elseBody, scope, depth);
        if (result.returned) return result;
        continue;
      }
      if (statement.type === 'while') {
        while (truthy(evaluate(statement.condition, scope, depth))) {
          step(statement);
          const result = executeBlock(statement.body, scope, depth);
          if (result.returned) return result;
        }
        continue;
      }
      const iterable = evaluate(statement.iterable, scope, depth);
      if (!Array.isArray(iterable) && typeof iterable !== 'string') return fail('for loop requires a list or string', statement);
      for (const value of iterable) {
        step(statement);
        scope.set(statement.name, value);
        const result = executeBlock(statement.body, scope, depth);
        if (result.returned) return result;
      }
    }
    return { returned: false, value: null };
  };

  const invoke = (name: string, args: OuroValue[], depth: number, location: Located): OuroValue => {
    if (depth > limits.maxCallDepth) throw new OuroborosError('LimitError', `call depth exceeded ${limits.maxCallDepth}`, location.line, location.column);
    const definition = functions.get(name.toLowerCase());
    if (!definition) return fail(`function '${name}' not found`, location);
    if (args.length !== definition.parameters.length) return fail(`${definition.name} expects ${definition.parameters.length} arguments`, location);
    const scope = new Map<string, OuroValue>();
    definition.parameters.forEach((parameter, index) => scope.set(parameter, args[index]));
    return executeBlock(definition.body, scope, depth).value;
  };

  if (!request.functionName) return { functions: [...functions.values()].map(definition => definition.name), output, result: null, steps };
  const result = invoke(request.functionName.replace(/\(\)$/, ''), request.args ?? [], 1, { line: 1, column: 1 });
  return { functions: [...functions.values()].map(definition => definition.name), output, result, steps };
}

export function formatOuroborosFailure(error: unknown): OuroborosFailure {
  if (error instanceof OuroborosError) return { kind: error.kind, message: error.message, line: error.line, column: error.column };
  return { kind: 'RuntimeError', message: error instanceof Error ? error.message : 'unknown runtime failure', line: 1, column: 1 };
}
