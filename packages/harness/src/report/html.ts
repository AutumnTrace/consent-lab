import type { Report, ScenarioResult, StepRecord, Violation } from '../types.js';

// One self-contained HTML file: inline CSS, no scripts, no external requests. Safe to attach to a
// CI run or open from disk.

const esc = (value: unknown): string =>
  String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const anchor = (r: ScenarioResult) => `${r.browser}-${r.scenario}`;

function chip(category: string): string {
  const kind = category === 'first-party' || category === 'necessary' ? 'quiet' : category === 'unclassified' ? 'warn' : 'cat';
  return `<span class="chip ${kind}">${esc(category)}</span>`;
}

function windowStart(step: StepRecord): number {
  return step.expect.from === 'action-end' ? step.actionEnd : step.actionStart;
}

function forbidden(step: StepRecord, category: string, t?: number): boolean {
  return step.expect.forbidden.includes(category) && (t === undefined || t >= windowStart(step));
}

function shortUrl(url: string, site: string): string {
  return url.startsWith(site) ? url.slice(site.length) || '/' : url;
}

function renderStep(step: StepRecord, site: string, firstViolation: Violation | null): string {
  const isFirst = firstViolation?.step === step.index;
  const row = (r: StepRecord['requests'][number]) => `<tr class="${forbidden(step, r.category, r.t) ? 'bad' : ''}">
        <td class="t">+${r.t}</td><td>${esc(r.method)}</td><td class="url">${esc(shortUrl(r.url, site))}</td>
        <td>${esc(r.resourceType)}</td><td>${chip(r.category)}</td><td>${esc(r.outcome)}${r.status ? ` ${r.status}` : ''}${r.failure ? ` (${esc(r.failure)})` : ''}</td></tr>`;
  const head = '<thead><tr><th>t (ms)</th><th>method</th><th>url</th><th>type</th><th>category</th><th>outcome</th></tr></thead>';
  const ownRequests = step.requests.filter((r) => r.category === 'first-party');
  const otherRequests = step.requests.filter((r) => r.category !== 'first-party');
  const requestTable =
    (otherRequests.length === 0
      ? '<p class="muted">None to other origins or listed in the policy.</p>'
      : `<table>${head}<tbody>${otherRequests.map(row).join('')}</tbody></table>`) +
    (ownRequests.length === 0
      ? ''
      : `<details class="own"><summary>${ownRequests.length} first-party request(s) to ${esc(site)}</summary><table>${head}<tbody>${ownRequests.map(row).join('')}</tbody></table></details>`);
  const receipts =
    step.receipts === null
      ? '<p class="muted">No collector configured: received events not observed.</p>'
      : step.receipts.length === 0
        ? '<p class="muted">None.</p>'
        : `<table><thead><tr><th>t (ms)</th><th>#</th><th>endpoint</th><th>event</th><th>page</th><th>category</th></tr></thead><tbody>${step.receipts
            .map(
              (r) => `<tr class="${forbidden(step, r.category, r.t) ? 'bad' : ''}"><td class="t">+${r.t}</td><td>${r.seq}</td><td class="url">${esc(r.path)}</td>
              <td>${esc(r.event ?? '')}</td><td>${esc(r.page ?? '')}</td><td>${chip(r.category)}</td></tr>`,
            )
            .join('')}</tbody></table>`;
  const cookies =
    step.cookies.length === 0
      ? '<span class="muted">none</span>'
      : step.cookies.map((c) => `<span class="item ${forbidden(step, c.category) ? 'bad' : ''}">${esc(c.name)} ${chip(c.category)}</span>`).join(' ');
  const storage =
    step.storage.length === 0
      ? '<span class="muted">none listed in the policy</span>'
      : step.storage.map((s) => `<span class="item ${forbidden(step, s.category) ? 'bad' : ''}">${esc(s.key)} ${chip(s.category)}</span>`).join(' ');
  const rules = [
    step.expect.forbidden.length ? `forbidden: ${step.expect.forbidden.join(', ')}` : '',
    step.expect.required.length ? `required: ${step.expect.required.join(', ')}` : '',
    `window from ${step.expect.from === 'action-end' ? 'end of action' : 'start of action'}`,
  ]
    .filter(Boolean)
    .join(' · ');

  return `<section class="step ${isFirst ? 'first' : ''}" id="s-${step.index}">
    <h4><span class="n">${step.index + 1}</span> ${esc(step.label)} ${isFirst ? '<span class="flag">first violation</span>' : ''}</h4>
    <p class="meta">action +${step.actionStart}–${step.actionEnd} ms, watched until +${step.windowEnd} ms · ${esc(rules)} · page ${esc(shortUrl(step.url, site))}${step.error ? ` · <strong>error: ${esc(step.error)}</strong>` : ''}</p>
    <h5>Requests attempted (${step.requests.length})</h5>
    ${requestTable}
    <h5>Events received by the collector${step.receipts ? ` (${step.receipts.length})` : ''}</h5>
    ${receipts}
    <p class="state"><strong>Cookies at end of step:</strong> ${cookies}</p>
    <p class="state"><strong>localStorage at end of step:</strong> ${storage}${step.otherStorageKeys ? ` <span class="muted">(+${step.otherStorageKeys} key(s) the policy does not list)</span>` : ''}</p>
  </section>`;
}

function renderViolation(v: Violation): string {
  return `<div class="violation">
    <p><strong>Step ${v.step + 1}: ${esc(v.stepLabel)}</strong> · rule <code>${esc(v.rule)}</code> · ${chip(v.category)}</p>
    <dl><dt>Expected</dt><dd>${esc(v.expected)}</dd><dt>Observed</dt><dd>${esc(v.observed)}</dd></dl>
    ${v.evidence.length ? `<pre>${v.evidence.map(esc).join('\n')}</pre>` : ''}
  </div>`;
}

function renderResult(r: ScenarioResult, site: string): string {
  const open = r.status !== 'pass' ? ' open' : '';
  const head = `<span class="status ${r.status}">${r.status}</span> ${esc(r.title)} <span class="muted">· ${esc(r.browser)} ${esc(r.browserVersion)}</span>`;
  const body = [
    `<p class="question">${esc(r.question)}</p>`,
    `<p class="meta">Started in a new browser context holding ${r.initialState.cookies} cookies.</p>`,
    r.error ? `<div class="violation"><p><strong>Could not run:</strong> ${esc(r.error)}</p></div>` : '',
    r.firstViolation
      ? `<h3>First violating action</h3>${renderViolation(r.firstViolation)}${
          r.violations.length > 1
            ? `<details><summary>${r.violations.length - 1} more violation(s) in this run</summary>${r.violations.slice(1).map(renderViolation).join('')}</details>`
            : ''
        }`
      : '',
    `<h3>Timeline</h3>`,
    r.steps.map((s) => renderStep(s, site, r.firstViolation)).join(''),
  ].join('');
  return `<details class="result" id="${anchor(r)}"${open}><summary>${head}</summary>${body}</details>`;
}

export function renderHtml(report: Report): string {
  const site = new URL(report.target.baseURL).origin;
  const browsers = [...new Set(report.results.map((r) => r.browser))];
  const scenarios = [...new Set(report.results.map((r) => r.scenario))];
  const cell = (b: string, s: string) => {
    const r = report.results.find((x) => x.browser === b && x.scenario === s);
    if (!r) return '<td></td>';
    const text = r.status === 'pass' ? 'pass' : r.status === 'error' ? 'error' : `fail at step ${r.firstViolation!.step + 1}: ${r.firstViolation!.rule}`;
    return `<td class="${r.status}"><a href="#${anchor(r)}">${esc(text)}</a></td>`;
  };
  const versions = browsers.map((b) => `${b} ${report.results.find((r) => r.browser === b)?.browserVersion ?? ''}`).join(', ');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>consent-lab: ${esc(report.verdict)}${report.label ? ` · ${esc(report.label)}` : ''}</title>
<style>
  :root { --ink:#1d232b; --muted:#5f6b78; --line:#dde2e8; --bad:#fbe9e7; --badline:#c8473b; --ok:#2e7d4f; }
  body { margin:0; font:14px/1.5 system-ui,-apple-system,'Segoe UI',sans-serif; color:var(--ink); background:#f5f6f8; }
  main { max-width:1100px; margin:0 auto; padding:28px 24px 60px; }
  h1 { font-size:22px; margin:0 0 4px; } h2 { font-size:17px; margin:28px 0 10px; } h3 { font-size:15px; margin:18px 0 8px; }
  h4 { font-size:14px; margin:0 0 4px; } h5 { font-size:12px; text-transform:uppercase; letter-spacing:.04em; color:var(--muted); margin:12px 0 4px; }
  .verdict { display:inline-block; padding:2px 10px; border-radius:6px; font-weight:700; color:#fff; background:var(--ok); }
  .verdict.fail, .verdict.error { background:var(--badline); }
  .muted, .meta { color:var(--muted); } .meta { font-size:13px; margin:2px 0 8px; }
  .card { background:#fff; border:1px solid var(--line); border-radius:10px; padding:14px 18px; margin:12px 0; }
  table { border-collapse:collapse; width:100%; font-size:13px; background:#fff; }
  th, td { text-align:left; padding:4px 8px; border-bottom:1px solid var(--line); vertical-align:top; }
  th { color:var(--muted); font-weight:600; }
  td.t { font-variant-numeric:tabular-nums; white-space:nowrap; } td.url { font-family:ui-monospace,Consolas,monospace; word-break:break-all; }
  td.pass a { color:var(--ok); } td.fail a, td.error a { color:var(--badline); font-weight:600; }
  tr.bad td { background:var(--bad); } .item.bad { background:var(--bad); outline:1px solid var(--badline); }
  .chip { display:inline-block; font-size:11px; padding:0 6px; border-radius:9px; background:#e7eefc; color:#2a4d9b; }
  .chip.quiet { background:#eceff2; color:#56606b; } .chip.warn { background:#fff1d6; color:#7a5200; }
  .item { display:inline-block; padding:1px 6px; border-radius:5px; margin:2px 4px 2px 0; font-family:ui-monospace,Consolas,monospace; font-size:12px; }
  .result { background:#fff; border:1px solid var(--line); border-radius:10px; margin:10px 0; padding:0 16px; }
  .result > summary { cursor:pointer; padding:12px 0; font-weight:600; }
  .status { display:inline-block; min-width:44px; text-align:center; font-size:12px; border-radius:5px; color:#fff; background:var(--ok); padding:1px 6px; margin-right:6px; }
  .status.fail, .status.error { background:var(--badline); }
  .question { font-style:italic; }
  .violation { border-left:4px solid var(--badline); background:var(--bad); padding:8px 14px; border-radius:6px; margin:8px 0; }
  .violation dl { display:grid; grid-template-columns:90px 1fr; margin:6px 0; } .violation dt { font-weight:600; } .violation dd { margin:0; }
  pre { background:#fff; border:1px solid var(--line); border-radius:6px; padding:8px 10px; overflow-x:auto; font-size:12px; margin:6px 0; }
  .step { border-top:1px solid var(--line); padding:12px 0; } .step.first h4 { color:var(--badline); }
  .n { display:inline-block; width:20px; height:20px; border-radius:50%; background:var(--ink); color:#fff; text-align:center; font-size:12px; line-height:20px; margin-right:4px; }
  .flag { font-size:11px; background:var(--badline); color:#fff; border-radius:5px; padding:1px 6px; margin-left:6px; }
  .state { margin:6px 0; }
  details.own > summary { cursor:pointer; color:var(--muted); font-size:13px; margin:4px 0; }
  ul.surfaces { margin:4px 0 0 18px; padding:0; }
  footer { margin-top:32px; font-size:13px; color:var(--muted); }
</style>
</head>
<body>
<main>
  <h1>consent-lab report <span class="verdict ${esc(report.verdict)}">${esc(report.verdict)}</span></h1>
  <p class="meta">${report.label ? `${esc(report.label)} · ` : ''}${esc(report.target.baseURL)} · ${esc(report.startedAt)} · ${esc(report.tool.name)} ${esc(report.tool.version)}</p>

  <div class="card">
    <p><strong>${report.summary.passed}</strong> of ${report.summary.runs} runs passed · <strong>${report.summary.violations}</strong> violation(s) · <strong>${report.summary.unclassified}</strong> unclassified request URL(s) · ${report.summary.errors} error(s)</p>
    <p>Category under test: ${chip(report.policy.categoryUnderTest)} · optional categories: ${report.policy.optional.map(chip).join(' ')} · policy <code>${esc(report.policy.source.split(/[\\/]/).pop())}</code> (sha256 ${esc(report.policy.sha256.slice(0, 12))}) · unclassified requests: ${esc(report.policy.unclassified)}</p>
    <p>Adapter: ${esc(report.target.adapter)} · start page ${esc(report.target.startPath)} · client-side navigation via link "${esc(report.target.navigation.link)}" to ${esc(report.target.navigation.path)} · ${esc(versions)}</p>
    <p><strong>Observed after each action for ${report.observation.windowMs} ms.</strong> Surfaces:</p>
    <ul class="surfaces">${report.observation.surfaces.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
  </div>

  <h2>Scenarios</h2>
  <table>
    <thead><tr><th>scenario</th>${browsers.map((b) => `<th>${esc(b)}</th>`).join('')}</tr></thead>
    <tbody>${scenarios.map((s) => `<tr><td>${esc(s)}</td>${browsers.map((b) => cell(b, s)).join('')}</tr>`).join('')}</tbody>
  </table>

  <h2>Runs</h2>
  ${report.results.map((r) => renderResult(r, site)).join('')}

  <h2>Unclassified requests</h2>
  ${
    report.unclassified.length === 0
      ? '<p class="muted">None.</p>'
      : `<p class="meta">Requests to another origin that no category in the policy lists. With <code>unclassified: "${esc(report.policy.unclassified)}"</code> they ${report.policy.unclassified === 'fail' ? 'fail the run' : 'are reported but do not fail the run'}.</p>
         <table><thead><tr><th>url</th><th>first seen</th></tr></thead><tbody>${report.unclassified
           .map((u) => `<tr><td class="url">${esc(u.url)}</td><td>${esc(u.firstSeen.browser)} · ${esc(u.firstSeen.scenario)} · step ${u.firstSeen.step + 1}</td></tr>`)
           .join('')}</tbody></table>`
  }

  <footer>
    This report records what the browsers above did on ${esc(report.target.baseURL)} during the listed observation windows, on the
    listed surfaces only. It does not see server-side processing, other storage (IndexedDB, cache), or requests after the window
    closes, and it is not a legal assessment of compliance.
  </footer>
</main>
</body>
</html>
`;
}
