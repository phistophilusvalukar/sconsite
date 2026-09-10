import { describe, expect, it } from 'vitest';
import { executeOuroboros, formatOuroborosFailure, formatOuroborosValue } from './ouroborosRuntime';

describe('Ouroboros runtime', () => {
  it('compiles declarations without executing them', () => {
    const result = executeOuroboros({ source: 'fn hello():\n    return "awake"\n' });
    expect(result.functions).toEqual(['hello']);
    expect(result.result).toBeNull();
    expect(result.output).toEqual([]);
  });

  it('executes functions with loops, branching, parameters, and structured values', () => {
    const source = `fn gather(limit):
    total = 0
    for value in range(limit):
        total = total + value
    if total > 2:
        print("sum", total)
    else:
        print("small")
    return {"total": total, "marks": [1, 2]}
`;
    const result = executeOuroboros({ source, functionName: 'gather', args: [4] });
    expect(result.output).toEqual(['sum 6']);
    expect(result.result).toEqual({ total: 6, marks: [1, 2] });
    expect(formatOuroborosValue(result.result)).toBe('{total: 6, marks: [1, 2]}');
  });

  it('exposes only explicitly supplied host globals', () => {
    const result = executeOuroboros({
      source: 'fn getTime():\n    return clock.cycle\n',
      functionName: 'getTime',
      globals: { clock: { cycle: 77_777 } },
    });
    expect(result.result).toBe(77_777);
  });

  it('reports syntax locations', () => {
    try {
      executeOuroboros({ source: 'fn broken()\n    return 1\n' });
      throw new Error('expected syntax error');
    } catch (error) {
      expect(formatOuroborosFailure(error)).toMatchObject({ kind: 'SyntaxError', line: 1 });
    }
  });

  it('stops programs that exceed the execution budget', () => {
    try {
      executeOuroboros({
        source: 'fn forever():\n    while True:\n        pass\n',
        functionName: 'forever',
        limits: { maxSteps: 25 },
      });
      throw new Error('expected limit error');
    } catch (error) {
      expect(formatOuroborosFailure(error)).toMatchObject({ kind: 'LimitError' });
    }
  });

  it('caps emitted output', () => {
    try {
      executeOuroboros({
        source: 'fn noisy():\n    print("123456")\n',
        functionName: 'noisy',
        limits: { maxOutputCharacters: 4 },
      });
      throw new Error('expected output limit error');
    } catch (error) {
      expect(formatOuroborosFailure(error)).toMatchObject({ kind: 'LimitError', line: 2 });
    }
  });
});
