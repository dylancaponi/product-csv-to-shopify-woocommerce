// Issue objects returned by every function in the engine.
//
// {
//   severity: 'error' | 'warning' | 'info',
//   code: string,          stable id, e.g. 'MISSING_HANDLE'
//   message: string,       plain English, safe to show to the merchant
//   line?: number,         1-based line in the INPUT file the issue is about
//   handle?: string,       product the issue is about
//   column?: string,       column header the issue is about
//   rule?: { id, text, source, verified }   the documented rule behind it
// }
import { RULES } from './rules.js';

export function makeCollector() {
  const issues = [];
  const issue = (severity, code, message, extra = {}) => {
    const out = { severity, code, message };
    if (extra.line !== undefined) out.line = extra.line;
    if (extra.handle) out.handle = extra.handle;
    if (extra.column) out.column = extra.column;
    if (extra.rule) {
      const r = RULES[extra.rule];
      out.rule = r ? { id: extra.rule, text: r.text, source: r.source, verified: r.verified } : { id: extra.rule };
    }
    issues.push(out);
    return out;
  };
  return { issues, issue };
}

export function summarize(issues) {
  const s = { error: 0, warning: 0, info: 0 };
  for (const i of issues) s[i.severity]++;
  return s;
}
