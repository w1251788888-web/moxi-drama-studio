/* moxi-admin-bundle @ 0.2.0 — 由 scripts/build-client.mjs 生成，勿手改 */
window.__ModuleLoader__.load({
  id: "moxi-admin-bundle",
  factory(require) {
    var module = { exports: {} };
    var exports = module.exports;
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// dsh/bundles/moxi-admin/src/client.jsx
var client_exports = {};
__export(client_exports, {
  default: () => client_default
});
module.exports = __toCommonJS(client_exports);
var import_react3 = __toESM(require("react"), 1);

// dsh/bundles/moxi-admin/src/App.jsx
var import_react2 = __toESM(require("react"), 1);

// dsh/bundles/moxi-admin/src/theme.js
var import_react = __toESM(require("react"), 1);
var h = import_react.default.createElement;
var STATUS_META = {
  draft: { label: "\u8349\u7A3F", color: "#8C9194" },
  generating: { label: "\u751F\u6210\u4E2D", color: "#A44736" },
  review: { label: "\u5F85\u5BA1", color: "#B08A4A" },
  rejected: { label: "\u6253\u56DE", color: "#B23A32" },
  approved: { label: "\u5DF2\u6279\u51C6", color: "#4E7A4B" },
  blocked: { label: "\u963B\u585E", color: "#5B6163" }
};
function statusLabel(status) {
  const meta = STATUS_META[status];
  return meta ? meta.label : status || "\u2014";
}
var TOKENS = {
  border: "var(--dsw-alias-border-l1, rgba(127,127,127,.25))",
  bg: "var(--dsw-alias-bg-layer-1, #fff)",
  bgSoft: "var(--dsw-alias-bg-layer-2, rgba(127,127,127,.06))",
  text: "var(--dsw-alias-label-primary, #18181b)",
  labelSecondary: "var(--dsw-alias-label-secondary, rgba(24,24,27,.62))",
  brand: "var(--dsw-alias-brand-primary, #247bbf)",
  mono: "ui-monospace, SFMono-Regular, Menlo, monospace",
  // 状态语义色（数据/状态可视化允许字面色；与画布端收敛为同一套）
  ok: "#4E7A4B",
  info: "#A44736",
  warn: "#B08A4A",
  danger: "#B23A32",
  muted: "#8C9194"
};
var JOB_STATUS_META = {
  queued: { label: "\u6392\u961F\u4E2D", color: TOKENS.muted },
  running: { label: "\u751F\u6210\u4E2D", color: TOKENS.info },
  done: { label: "\u5DF2\u5B8C\u6210", color: TOKENS.ok },
  done_with_errors: { label: "\u90E8\u5206\u5931\u8D25", color: TOKENS.warn },
  cancelled: { label: "\u5DF2\u53D6\u6D88", color: TOKENS.muted },
  failed: { label: "\u5931\u8D25", color: TOKENS.danger }
};
var JOB_ALERT_STATUS = /* @__PURE__ */ new Set(["done_with_errors", "cancelled", "failed"]);
function jobStatusLabel(status) {
  const meta = JOB_STATUS_META[status];
  return meta ? meta.label : status || "\u2014";
}
function JobBadge({ status }) {
  const meta = JOB_STATUS_META[status] || { label: status || "\u672A\u77E5", color: TOKENS.muted };
  return h("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      fontSize: 10.5,
      lineHeight: "16px",
      padding: "0 7px",
      borderRadius: 999,
      color: meta.color,
      border: `1px solid ${meta.color}55`,
      background: `${meta.color}14`,
      whiteSpace: "nowrap"
    }
  }, h("span", { style: { width: 5, height: 5, borderRadius: 999, background: meta.color } }), meta.label);
}
function fmtTime(iso) {
  if (!iso) return "\u2014";
  return String(iso).slice(0, 19).replace("T", " ");
}
function fmtNum(n) {
  const v = Number(n);
  return Number.isFinite(v) ? v.toLocaleString("zh-CN") : "\u2014";
}
function fmtDuration(startIso, endIso) {
  if (!startIso) return "\u2014";
  const a = Date.parse(startIso);
  const b = endIso ? Date.parse(endIso) : Date.now();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return "\u2014";
  const s = Math.round((b - a) / 1e3);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
var TONE_META = {
  success: { color: TOKENS.ok },
  warn: { color: TOKENS.warn },
  danger: { color: TOKENS.danger },
  neutral: { color: TOKENS.muted }
};
function Badge({ status, tone, children }) {
  const meta = tone && TONE_META[tone] || STATUS_META[status] || STATUS_META.draft;
  return h(
    "span",
    {
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 10.5,
        lineHeight: "16px",
        padding: "0 7px",
        borderRadius: 999,
        color: meta.color,
        border: `1px solid ${meta.color}55`,
        background: `${meta.color}14`,
        whiteSpace: "nowrap"
      }
    },
    h("span", { style: { width: 5, height: 5, borderRadius: 999, background: meta.color } }),
    children != null ? children : meta.label
  );
}
function Button({ children, onClick, tone = "default", disabled, title, style }) {
  const errorRed = "var(--dsw-alias-state-error-primary, #B23A32)";
  const tones = {
    default: { color: TOKENS.text, background: TOKENS.bg, border: `1px solid ${TOKENS.border}` },
    primary: { color: "#fff", background: TOKENS.brand, border: `1px solid ${TOKENS.brand}` },
    danger: { color: "#fff", background: errorRed, border: `1px solid ${errorRed}` },
    ghost: { color: TOKENS.text, background: "transparent", border: "1px solid transparent" }
  };
  return h("button", {
    onClick,
    disabled,
    title,
    style: {
      height: 28,
      padding: "0 10px",
      borderRadius: 6,
      fontSize: 12,
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.5 : 1,
      whiteSpace: "nowrap",
      ...tones[tone],
      ...style
    }
  }, children);
}
function Input({ value, onChange, placeholder, style, onEnter, type = "text", min, max, disabled }) {
  return h("input", {
    value: value ?? "",
    placeholder,
    type,
    min,
    max,
    disabled,
    onChange: (e) => onChange && onChange(e.target.value),
    onKeyDown: (e) => {
      if (e.key === "Enter" && onEnter) onEnter();
    },
    style: {
      height: 28,
      padding: "0 9px",
      borderRadius: 6,
      fontSize: 12,
      boxSizing: "border-box",
      border: `1px solid ${TOKENS.border}`,
      background: TOKENS.bg,
      color: TOKENS.text,
      outline: "none",
      ...style
    }
  });
}
function Modal({ title, children, onClose, footer, width = 520 }) {
  return h(
    "div",
    {
      style: {
        position: "fixed",
        inset: 0,
        zIndex: 2e3,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,.32)"
      },
      onClick: onClose
    },
    h(
      "div",
      {
        onClick: (e) => e.stopPropagation(),
        style: {
          width,
          maxWidth: "90vw",
          maxHeight: "86vh",
          overflow: "auto",
          background: TOKENS.bg,
          color: TOKENS.text,
          borderRadius: 12,
          border: `1px solid ${TOKENS.border}`,
          boxShadow: "0 20px 60px rgba(0,0,0,.28)"
        }
      },
      h(
        "div",
        { style: { padding: "14px 16px", borderBottom: `1px solid ${TOKENS.border}`, display: "flex", alignItems: "center" } },
        h("div", { style: { flex: 1, fontSize: 14, fontWeight: 650 } }, title),
        h("button", { onClick: onClose, style: { border: 0, background: "transparent", cursor: "pointer", fontSize: 16, opacity: 0.6 } }, "\xD7")
      ),
      h("div", { style: { padding: 16 } }, children),
      footer ? h("div", { style: { padding: "10px 16px", borderTop: `1px solid ${TOKENS.border}`, display: "flex", justifyContent: "flex-end", gap: 8 } }, footer) : null
    )
  );
}
function Empty({ text, action }) {
  return h(
    "div",
    {
      style: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, height: "100%", minHeight: 240, opacity: 0.75 }
    },
    h("div", { style: { fontSize: 13 } }, text),
    action || null
  );
}
function Toast({ toast }) {
  if (!toast) return null;
  const color = toast.kind === "error" ? TOKENS.danger : toast.kind === "success" ? TOKENS.ok : toast.kind === "warn" ? TOKENS.warn : TOKENS.info;
  return h("div", {
    style: {
      position: "fixed",
      bottom: 24,
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: 3e3,
      padding: "9px 16px",
      borderRadius: 8,
      fontSize: 12.5,
      color: "#fff",
      background: color,
      boxShadow: "0 8px 24px rgba(0,0,0,.25)"
    }
  }, toast.text);
}
function Confirm({ open, title, message, confirmText = "\u786E\u8BA4", cancelText = "\u53D6\u6D88", tone = "default", busy = false, onCancel, onConfirm }) {
  if (!open) return null;
  return h(Modal, {
    title: title || "\u8BF7\u786E\u8BA4",
    width: 460,
    onClose: busy ? void 0 : onCancel,
    footer: [
      h(Button, { key: "cancel", onClick: onCancel, disabled: busy }, cancelText),
      h(
        Button,
        { key: "ok", tone: tone === "danger" ? "danger" : "primary", onClick: onConfirm, disabled: busy },
        busy ? "\u5904\u7406\u4E2D\u2026" : confirmText
      )
    ]
  }, h("div", { style: { fontSize: 12.5, lineHeight: 1.75, opacity: 0.85, whiteSpace: "pre-wrap" } }, message));
}
function Field({ label, hint, children, width }) {
  return h(
    "label",
    { style: { display: "flex", flexDirection: "column", gap: 5, fontSize: 11.5, width, flexShrink: 0 } },
    h("span", { style: { color: TOKENS.labelSecondary } }, label),
    children,
    hint ? h("span", { style: { fontSize: 10.5, color: TOKENS.labelSecondary, opacity: 0.8 } }, hint) : null
  );
}

// dsh/bundles/moxi-admin/src/App.jsx
var { useState, useEffect, useCallback, useMemo, useRef } = import_react2.default;
async function post(path, body = {}) {
  const res = await fetch(`/api/moxi${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || json.ok !== true) {
    const e = new Error(json && json.error && json.error.message || `HTTP ${res.status}`);
    e.code = json && json.error && json.error.code;
    throw e;
  }
  return json.value;
}
var EP = {
  stats: "/stats",
  projects: "/projects/list",
  jobs: "/jobs/list",
  export: "/export",
  projectDelete: "/project/delete",
  release: "/project/release",
  llmInfo: "/llm/info",
  llmProbe: "/llm/probe",
  rules: "/admin/rules",
  logs: "/admin/logs",
  legacyModels: "/admin/models"
};
function localNowIso() {
  const d = /* @__PURE__ */ new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
var BTN_SM = { height: 26, padding: "0 8px", fontSize: 11 };
var LOG_OP_LABELS = {
  "node.transition": "\u8282\u70B9\u6D41\u8F6C",
  "content.save": "\u6B63\u6587\u4FDD\u5B58",
  "generate.episode": "\u5206\u96C6\u751F\u6210",
  "check.run": "\u8D28\u68C0\u8FD0\u884C"
};
var LOG_OP_OPTIONS = [{ value: "\u5168\u90E8", label: "\u5168\u90E8\u64CD\u4F5C" }].concat(
  Object.keys(LOG_OP_LABELS).map((op) => ({ value: op, label: LOG_OP_LABELS[op] }))
);
var opLabel = (op) => op === "\u5168\u90E8" ? "\u5168\u90E8\u64CD\u4F5C" : LOG_OP_LABELS[op] || op;
var EXPORT_FORMATS = ["docx", "md", "txt"];
function jobScope(job) {
  const s = job && job.scope;
  if (s && Array.isArray(s.episodes) && s.episodes.length) {
    const eps2 = [...new Set(s.episodes.map(Number))].sort((a, b) => a - b);
    return { episodes: eps2, dense: !!s.dense };
  }
  const eps = [...new Set((job && job.episodes || []).map((e) => Number(e && e.ep)).filter((n) => Number.isInteger(n) && n > 0))].sort((a, b) => a - b);
  if (eps.length) return { episodes: eps, dense: eps.length === eps[eps.length - 1] - eps[0] + 1 };
  const from = Number(job && job.from);
  const to = Number(job && job.to);
  if (Number.isInteger(from) && from > 0 && Number.isInteger(to) && to >= from) {
    const count = Number(job && job.progress && job.progress.total) || 0;
    return { from, to, count: count > 0 ? count : to - from + 1 };
  }
  return null;
}
function fmtScope(scope, job) {
  if (job && job.mode === "ensure") return "\u6982\u5FF5/\u8D44\u4EA7\u8865\u9F50";
  if (!scope) return "\u2014";
  if (!scope.episodes) {
    const span = scope.to - scope.from + 1;
    if (scope.count !== span) return `\u7B2C ${scope.from}\u2013${scope.to} \u96C6\uFF08\u5171 ${scope.count} \u96C6\uFF09`;
    return `\u7B2C ${scope.from}\u2013${scope.to} \u96C6`;
  }
  const eps = scope.episodes;
  if (eps.length === 1) return `\u7B2C ${eps[0]} \u96C6`;
  if (scope.dense) return `\u7B2C ${eps[0]}\u2013${eps[eps.length - 1]} \u96C6`;
  return `\u7B2C ${eps.join("\u3001")} \u96C6\uFF08\u5171 ${eps.length} \u96C6\uFF09`;
}
function Card({ title, value, hint, tone }) {
  return h(
    "div",
    {
      style: {
        padding: "14px 16px",
        borderRadius: 10,
        background: TOKENS.bg,
        border: `1px solid ${TOKENS.border}`,
        boxShadow: "0 1px 3px rgba(0,0,0,.05)"
      }
    },
    h("div", { style: { fontSize: 11.5, opacity: 0.62, marginBottom: 6 } }, title),
    h("div", { style: { fontSize: 24, fontWeight: 700, color: tone || TOKENS.text, lineHeight: 1.1 } }, String(value)),
    hint ? h("div", { style: { fontSize: 11, opacity: 0.5, marginTop: 6 } }, hint) : null
  );
}
function Section({ title, extra, hint, children }) {
  return h(
    "section",
    { style: { marginBottom: 22 } },
    h(
      "div",
      { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 10 } },
      h("h2", { className: "moxi-serif", style: { fontSize: 14, fontWeight: 600, margin: 0, letterSpacing: ".02em" } }, title),
      hint ? h("span", { style: { fontSize: 11, color: TOKENS.labelSecondary } }, hint) : null,
      h("span", { style: { flex: 1 } }),
      extra || null
    ),
    children
  );
}
function Loading({ text = "\u52A0\u8F7D\u4E2D\u2026" }) {
  return h("div", { style: { fontSize: 12, opacity: 0.6, padding: "10px 0" } }, text);
}
function ErrorBox({ error, onRetry }) {
  if (!error) return null;
  return h(
    "div",
    {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 10,
        marginBottom: 10,
        padding: "8px 12px",
        borderRadius: 8,
        fontSize: 12,
        color: TOKENS.danger,
        border: `1px solid ${TOKENS.danger}55`,
        background: `${TOKENS.danger}0f`
      }
    },
    h("span", { style: { flex: 1 } }, "\u8BFB\u53D6\u5931\u8D25\uFF1A" + error),
    onRetry ? h(Button, { onClick: onRetry }, "\u91CD\u8BD5") : null
  );
}
function Table({ columns, rows, empty = "\u6682\u65E0\u6570\u636E" }) {
  if (!rows || rows.length === 0) return h(Empty, { text: empty });
  const head = h(
    "thead",
    null,
    h("tr", null, columns.map((c) => h("th", {
      key: c.key,
      style: {
        textAlign: c.align || "left",
        padding: "9px 12px",
        borderBottom: `1px solid ${TOKENS.border}`,
        fontSize: 11,
        opacity: 0.6,
        fontWeight: 600,
        whiteSpace: "nowrap"
      }
    }, c.title)))
  );
  const body = h("tbody", null, rows.map((r, i) => h("tr", {
    key: r.id || r.seq || i,
    style: { borderBottom: i === rows.length - 1 ? "none" : `1px solid ${TOKENS.border}` }
  }, columns.map((c) => h(
    "td",
    { key: c.key, style: { padding: "8px 12px", verticalAlign: "top", fontSize: 12 } },
    c.render ? c.render(r) : String(r[c.key] ?? "")
  )))));
  return h("div", {
    style: { border: `1px solid ${TOKENS.border}`, borderRadius: 10, overflow: "auto", background: TOKENS.bg }
  }, h("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: 12 } }, head, body));
}
function Select({ value, onChange, options, style, disabled }) {
  return h("select", {
    value,
    disabled,
    onChange: (e) => onChange && onChange(e.target.value),
    style: {
      height: 28,
      padding: "0 8px",
      borderRadius: 6,
      fontSize: 12,
      boxSizing: "border-box",
      border: `1px solid ${TOKENS.border}`,
      background: TOKENS.bg,
      color: TOKENS.text,
      outline: "none",
      cursor: disabled ? "not-allowed" : "pointer",
      ...style
    }
  }, options.map((o) => h("option", { key: o.value ?? o, value: o.value ?? o }, o.label ?? o)));
}
function Progress({ done = 0, total = 0, failed = 0 }) {
  const pct = total > 0 ? Math.min(100, Math.round(done / total * 100)) : 0;
  if (!(total > 0)) {
    return h(
      "div",
      { style: { minWidth: 110, fontSize: 11.5, opacity: 0.6 } },
      "\u2014",
      failed > 0 ? h("span", { style: { color: TOKENS.danger, marginLeft: 8 } }, `\u5931\u8D25 ${failed}`) : null
    );
  }
  return h(
    "div",
    { style: { minWidth: 110 } },
    h(
      "div",
      { style: { display: "flex", alignItems: "center", gap: 8, fontSize: 11.5 } },
      h("span", { style: { fontWeight: 600 } }, `${done}/${total} \u96C6`),
      failed > 0 ? h("span", { style: { color: TOKENS.danger } }, `\u5931\u8D25 ${failed}`) : null
    ),
    h(
      "div",
      { style: { marginTop: 4, height: 5, borderRadius: 999, background: TOKENS.bgSoft, overflow: "hidden" } },
      h("div", { style: { width: `${pct}%`, height: "100%", background: failed > 0 ? TOKENS.danger : TOKENS.info } })
    )
  );
}
function Mono({ children }) {
  return h("span", { style: { fontFamily: TOKENS.mono, fontSize: 11 } }, children);
}
function PageOverview({ stats, jobs, loading, errors, onRefresh, onGoJobs }) {
  const total = stats && stats.total;
  const jobRows = (jobs || []).slice(0, 6);
  const alertCount = (jobs || []).filter((j) => JOB_ALERT_STATUS.has(j.status)).length;
  const kpis = total ? [
    ["\u9879\u76EE\u6570", fmtNum(total.projects), "\u5168\u90E8\u9879\u76EE\u5408\u8BA1", null],
    ["\u8282\u70B9\u6570", fmtNum(total.nodes), "\u753B\u5E03\u8282\u70B9\u5408\u8BA1", null],
    ["\u5DF2\u751F\u6210\u96C6\u6570", fmtNum(total.episodes), "\u5404\u9879\u76EE\u5DF2\u751F\u6210\u96C6\u6570\u5408\u8BA1", null],
    ["\u603B\u5B57\u6570", fmtNum(total.words), "\u6B63\u6587\u51C0\u5B57\u6570\uFF08\u53BB\u7A7A\u767D\uFF09", null],
    ["\u5F85\u5BA1\u8282\u70B9", fmtNum(total.pending), "\u9001\u5BA1 + \u6253\u56DE", total.pending ? TOKENS.warn : null],
    ["\u5DF2\u6279\u51C6", fmtNum(total.approved), "\u5DF2\u901A\u8FC7\u8BC4\u5BA1\u7684\u8282\u70B9", total.approved ? TOKENS.ok : null],
    ["\u963B\u585E", fmtNum(total.blocked), "\u88AB\u963B\u585E\u7684\u8282\u70B9", total.blocked ? TOKENS.danger : null],
    ["\u8349\u7A3F", fmtNum(total.draft), "\u5C1A\u672A\u9001\u5BA1\u7684\u8282\u70B9", null]
  ] : [];
  return h(
    "div",
    null,
    h(ErrorBox, { error: errors.stats, onRetry: onRefresh }),
    h(
      Section,
      {
        title: "\u8FD0\u884C\u6982\u89C8"
      },
      loading.stats && !stats ? h(Loading) : h(
        "div",
        { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px,1fr))", gap: 12 } },
        kpis.map(([title, value, hint, tone]) => h(Card, { key: title, title, value, hint, tone }))
      )
    ),
    h(
      Section,
      {
        title: `\u6700\u8FD1\u751F\u6210\u4EFB\u52A1${alertCount ? `\uFF08\u5F02\u5E38 ${alertCount}\uFF09` : ""}`,
        hint: jobRows.length ? `\u6700\u8FD1 ${jobRows.length} \u6761` : "",
        extra: h(Button, { onClick: onGoJobs }, "\u67E5\u770B\u5168\u90E8\u4EFB\u52A1 \u2192")
      },
      loading.jobs && !jobs ? h(Loading) : h(Table, {
        columns: [
          { key: "projectTitle", title: "\u9879\u76EE", render: (r) => h("span", { style: { fontWeight: 600, whiteSpace: "nowrap" } }, r.projectTitle) },
          { key: "range", title: "\u96C6\u8303\u56F4", render: (r) => h("span", { style: { whiteSpace: "nowrap" } }, fmtScope(jobScope(r), r)) },
          { key: "status", title: "\u72B6\u6001", render: (r) => h(JobBadge, { status: r.status }) },
          { key: "progress", title: "\u8FDB\u5EA6", render: (r) => h(Progress, { ...r.progress || {} }) },
          { key: "model", title: "\u6A21\u578B", render: (r) => h(Mono, null, `${r.provider}/${r.model}`) },
          { key: "time", title: "\u5F00\u59CB\u65F6\u95F4", render: (r) => fmtTime(r.startedAt || r.createdAt) }
        ],
        rows: jobRows,
        empty: "\u6682\u65E0\u751F\u6210\u4EFB\u52A1"
      })
    ),
    h(
      Section,
      { title: "\u9879\u76EE\u7EDF\u8BA1", hint: "\u6309\u9879\u76EE\u6C47\u603B" },
      loading.stats && !stats ? h(Loading) : h(Table, {
        columns: [
          { key: "title", title: "\u9879\u76EE", render: (r) => h("span", { style: { fontWeight: 600 } }, r.title) },
          { key: "nodes", title: "\u8282\u70B9", align: "right", render: (r) => fmtNum(r.nodes) },
          { key: "edges", title: "\u8FB9", align: "right", render: (r) => fmtNum(r.edges) },
          { key: "episodeCount", title: "\u96C6\u6570", align: "right", render: (r) => r.episodeCount == null ? "\u672A\u786E\u8BA4" : r.episodeCount },
          { key: "episodes", title: "\u5DF2\u751F\u6210\u96C6\u6570", align: "right", render: (r) => fmtNum(r.episodes) },
          { key: "words", title: "\u5B57\u6570", align: "right", render: (r) => fmtNum(r.words) },
          { key: "pending", title: "\u5F85\u5BA1", align: "right", render: (r) => fmtNum(r.pending) },
          { key: "lastJob", title: "\u6700\u8FD1\u4EFB\u52A1", render: (r) => r.lastJob ? h(JobBadge, { status: r.lastJob.status }) : "\u2014" },
          { key: "rev", title: "\u753B\u5E03\u7248\u672C", align: "right", render: (r) => h(Mono, null, String(r.rev)) }
        ],
        rows: stats && stats.projects || [],
        empty: "\u8FD8\u6CA1\u6709\u9879\u76EE"
      })
    )
  );
}
function PageProjects({ projects, stats, loading, errors, busy, onRefresh, onOpenCanvas, onExport, onDelete, onRelease }) {
  const [q, setQ] = useState("");
  const statsMap = useMemo(() => {
    const map = {};
    for (const p of stats && stats.projects || []) map[p.id] = p;
    return map;
  }, [stats]);
  const rows = useMemo(() => (projects || []).filter((p) => !q || String(p.title).toLowerCase().includes(q.toLowerCase())).map((p) => {
    const s = statsMap[p.id] || null;
    return { ...p, nodes: s ? s.nodes : null, words: s ? s.words : null, episodes: s ? s.episodes : null, lastJob: s ? s.lastJob : null, byStatus: s ? s.byStatus : null };
  }), [projects, statsMap, q]);
  return h(
    "div",
    null,
    h(ErrorBox, { error: errors.projects, onRetry: onRefresh }),
    h(
      Section,
      {
        title: `\u9879\u76EE\uFF08${rows.length}${q ? ` / ${(projects || []).length}` : ""}\uFF09`,
        hint: "\u8282\u70B9\u3001\u5B57\u6570\u3001\u5DF2\u751F\u6210\u96C6\u6570\u4E0E\u6700\u8FD1\u4EFB\u52A1\u4E3A\u540E\u7AEF\u7EDF\u8BA1",
        extra: h(Input, { value: q, onChange: setQ, placeholder: "\u641C\u7D22\u9879\u76EE\u540D", style: { width: 170 } })
      },
      loading.projects && !projects ? h(Loading) : h(Table, {
        columns: [
          { key: "title", title: "\u9879\u76EE\u540D", render: (r) => h("span", { style: { fontWeight: 600, whiteSpace: "nowrap" } }, r.title) },
          { key: "episodeCount", title: "\u96C6\u6570", align: "right", render: (r) => r.episodeCount == null ? "\u672A\u786E\u8BA4" : r.episodeCount },
          { key: "audience", title: "\u53D7\u4F17", render: (r) => r.audience || "\u2014" },
          { key: "nodes", title: "\u8282\u70B9\u6570", align: "right", render: (r) => r.nodes == null ? "\u2014" : fmtNum(r.nodes) },
          { key: "words", title: "\u5B57\u6570", align: "right", render: (r) => r.words == null ? "\u2014" : fmtNum(r.words) },
          { key: "episodes", title: "\u5DF2\u751F\u6210\u96C6\u6570", align: "right", render: (r) => r.episodes == null ? "\u2014" : fmtNum(r.episodes) },
          {
            key: "lastJob",
            title: "\u6700\u8FD1\u4EFB\u52A1",
            render: (r) => r.lastJob ? h(
              "span",
              { style: { display: "inline-flex", alignItems: "center", gap: 6 } },
              h(JobBadge, { status: r.lastJob.status }),
              h(Mono, null, `${r.lastJob.progress && r.lastJob.progress.done || 0}/${r.lastJob.progress && r.lastJob.progress.total || 0} \u96C6`)
            ) : "\u2014"
          },
          {
            key: "review",
            title: "\u8BC4\u5BA1",
            render: (r) => {
              const st = r.reviewState;
              if (st === "released") return h(Badge, { tone: "success" }, "\u5DF2\u653E\u884C");
              if (st === "generated") return h(Badge, { tone: "warn" }, "\u5F85\u653E\u884C");
              if (st === "has_errors") return h(Badge, { tone: "danger" }, "\u6709\u5931\u8D25\u96C6");
              return h("span", { style: { opacity: 0.5 } }, "\u2014");
            }
          },
          {
            key: "act",
            title: "\u64CD\u4F5C",
            render: (r) => h(
              "div",
              { style: { display: "flex", gap: 6, flexWrap: "nowrap", alignItems: "center" } },
              r.reviewState === "generated" ? h(
                Button,
                { style: BTN_SM, tone: "primary", onClick: () => onRelease(r), disabled: !!busy[`release:${r.id}`], title: "\u4EBA\u5DE5\u653E\u884C\uFF1A\u751F\u6210\u5B8C\u6210 \u2260 \u53EF\u4EA4\u4ED8" },
                busy[`release:${r.id}`] ? "\u653E\u884C\u4E2D\u2026" : "\u653E\u884C"
              ) : null,
              h(Button, { style: BTN_SM, onClick: () => onOpenCanvas(r), title: "\u5728\u58A8\u620F\u753B\u5E03\u4E2D\u6253\u5F00\u8BE5\u9879\u76EE" }, "\u6253\u5F00\u753B\u5E03"),
              h(
                Button,
                { style: BTN_SM, onClick: () => onExport(r), disabled: !!busy[`export:${r.id}`], title: "\u6309\u9879\u76EE\u5BFC\u51FA docx" },
                busy[`export:${r.id}`] ? "\u5BFC\u51FA\u4E2D\u2026" : "\u5BFC\u51FA docx"
              ),
              h(Button, { style: BTN_SM, tone: "danger", onClick: () => onDelete(r), title: "\u5220\u9664\u524D\u4E8C\u6B21\u786E\u8BA4\uFF0C\u79FB\u5165\u56DE\u6536\u7AD9" }, "\u5220\u9664")
            )
          }
        ],
        rows,
        empty: "\u8FD8\u6CA1\u6709\u9879\u76EE\uFF08\u5728\u300C\u58A8\u620F\u753B\u5E03\u300D\u4E2D\u65B0\u5EFA\uFF09"
      })
    )
  );
}
function PageRules({ data, loading, scanning, error, onScan }) {
  const d = data || {};
  const rules = d.rules || [];
  const pipeline = d.pipeline || null;
  const skills = d.skills || [];
  const steps = pipeline && pipeline.steps || [];
  const hardGates = pipeline && pipeline.hardGates || [];
  return h(
    "div",
    null,
    h(ErrorBox, { error, onRetry: onScan }),
    h(
      Section,
      {
        title: "\u89C4\u5219\u5305\u626B\u63CF",
        hint: "\u53EA\u8BFB\u626B\u63CF\u89C4\u5219\u76EE\u5F55",
        extra: h(Button, { onClick: onScan, disabled: scanning || loading }, scanning || loading ? "\u626B\u63CF\u4E2D\u2026" : "\u91CD\u65B0\u626B\u63CF")
      },
      loading && !data ? h(Loading, { text: "\u9996\u6B21\u626B\u63CF\u89C4\u5219\u5305\u2026" }) : h(
        "div",
        null,
        h(
          "div",
          { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px,1fr))", gap: 12, marginBottom: 12 } },
          h(Card, { title: "\u89C4\u5219\u6587\u4EF6\u6570", value: fmtNum(d.count != null ? d.count : rules.length), hint: "\u540E\u7AEF\u626B\u63CF\u8BA1\u6570" }),
          h(Card, { title: "\u6D41\u6C34\u7EBF\u6B65\u9AA4", value: fmtNum(steps.length), hint: "\u89C4\u5219\u6D41\u6C34\u7EBF\u5B9A\u4E49" }),
          h(Card, { title: "\u786C\u95E8", value: fmtNum(hardGates.length), hint: hardGates.join(", ") || "\u65E0" }),
          h(Card, { title: "\u6280\u80FD\u6570", value: fmtNum(skills.length), hint: "\u626B\u63CF\u5230\u7684\u6280\u80FD\u76EE\u5F55" })
        ),
        h(
          "div",
          { style: { fontSize: 11.5, opacity: 0.6, marginBottom: 10 } },
          "\u6839\u76EE\u5F55\uFF1A",
          h(Mono, null, d.root || "\u2014"),
          steps.length ? h("span", null, ` \xB7 \u6D41\u6C34\u7EBF\uFF1A${steps.length} \u4E2A\u6B65\u9AA4 \xB7 ${hardGates.length} \u4E2A\u786C\u95E8`) : null
        ),
        h(Table, {
          columns: [
            { key: "path", title: "\u8DEF\u5F84", render: (r) => h(Mono, null, r.path) },
            { key: "title", title: "\u6807\u9898" },
            { key: "words", title: "\u5B57\u6570", align: "right", render: (r) => fmtNum(r.words) }
          ],
          rows: rules,
          empty: "\u89C4\u5219\u6839\u76EE\u5F55\u4E3A\u7A7A\uFF1A\u628A\u89C4\u5219\u5305\u653E\u56DE\u4ED3\u5E93\u6839\u76EE\u5F55\u540E\u70B9\u300C\u91CD\u65B0\u626B\u63CF\u300D"
        })
      )
    ),
    h(
      Section,
      { title: `\u6280\u80FD\uFF08${skills.length}\uFF09` },
      loading && !data ? h(Loading, { text: "\u626B\u63CF\u6280\u80FD\u76EE\u5F55\u2026" }) : h(Table, {
        columns: [
          { key: "name", title: "\u540D\u79F0" },
          { key: "dir", title: "\u76EE\u5F55", render: (r) => h(Mono, null, r.dir) },
          { key: "files", title: "\u6587\u4EF6\u6570", align: "right" },
          { key: "hasSkillMd", title: "SKILL.md", render: (r) => r.hasSkillMd ? "\u2713" : "\u2014" }
        ],
        rows: skills,
        empty: "\u672A\u626B\u63CF\u5230\u6280\u80FD\u76EE\u5F55"
      })
    )
  );
}
function PageModels({ llmInfo, legacy, jobs, probeRuns, probing, loading, error, onProbe, onRefresh }) {
  const models = llmInfo && llmInfo.models || [];
  const latest = probeRuns[0] || null;
  const defaultProvider = llmInfo && llmInfo.provider || latest && latest.provider || "\u2014";
  const defaultModel = latest && latest.model || jobs && jobs[0] && jobs[0].model || "\u5F85\u63A2\u6D4B";
  const usage = useMemo(() => {
    const acc = { calls: 0, inputTokens: 0, outputTokens: 0, jobs: (jobs || []).length };
    for (const j of jobs || []) {
      const u = j.usage || {};
      acc.calls += Number(u.calls) || 0;
      acc.inputTokens += Number(u.inputTokens) || 0;
      acc.outputTokens += Number(u.outputTokens) || 0;
    }
    return acc;
  }, [jobs]);
  const legacyProviders = legacy && legacy.providers || [];
  const legacyProbe = legacy && legacy.probe || [];
  return h(
    "div",
    null,
    h(ErrorBox, { error, onRetry: onRefresh }),
    h(
      Section,
      { title: "\u6A21\u578B\u6982\u89C8", hint: "\u6A21\u578B\u4FE1\u606F\u4E0E\u63A2\u6D4B\u7ED3\u679C" },
      h(
        "div",
        { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px,1fr))", gap: 12 } },
        h(Card, { title: "\u5F53\u524D\u670D\u52A1\u5546", value: defaultProvider, hint: "\u6A21\u578B\u6E05\u5355\u8FD4\u56DE\u7684\u9ED8\u8BA4\u670D\u52A1\u5546" }),
        h(Card, { title: "\u5F53\u524D\u9ED8\u8BA4\u6A21\u578B", value: defaultModel, hint: latest ? "\u6700\u8FD1\u4E00\u6B21\u63A2\u6D4B\u5B9E\u6D4B" : "\u53D6\u6700\u8FD1\u4EFB\u52A1\u6240\u7528\u6A21\u578B\uFF0C\u53EF\u70B9\u63A2\u6D4B\u5668\u5B9E\u6D4B" }),
        h(Card, { title: "\u53EF\u9009\u6A21\u578B\u6570", value: fmtNum(models.length), hint: "\u6A21\u578B\u6E05\u5355\u6761\u6570" }),
        h(Card, { title: "\u6700\u8FD1\u63A2\u6D4B\u5EF6\u8FDF", value: latest ? `${latest.ms} ms` : "\u2014", hint: latest ? `${latest.provider}/${latest.model}` : "\u5C1A\u672A\u63A2\u6D4B" })
      )
    ),
    h(
      Section,
      {
        title: `\u6A21\u578B\u5217\u8868\uFF08${models.length}\uFF09`,
        hint: "\u53EA\u8BFB\uFF0C\u4E0D\u5728\u540E\u53F0\u4FEE\u6539"
      },
      loading.llmInfo && !llmInfo ? h(Loading) : h(Table, {
        columns: [
          { key: "id", title: "\u6A21\u578B ID", render: (r) => h(Mono, null, r.id) },
          { key: "name", title: "\u663E\u793A\u540D" },
          { key: "target", title: "\u5F52\u5C5E", render: (r) => r.id === defaultModel ? "\u5F53\u524D\u9ED8\u8BA4" : "\u53EF\u9009" }
        ],
        rows: models,
        empty: "\u672A\u8BFB\u53D6\u5230\u6A21\u578B\u5217\u8868"
      })
    ),
    h(
      Section,
      {
        title: `\u94FE\u8DEF\u63A2\u6D4B\u5668\uFF08\u672C\u6B21\u4F1A\u8BDD ${probeRuns.length} \u6B21\u5B9E\u6D4B\uFF09`,
        hint: "\u9010\u6B21\u5B9E\u6D4B\uFF0C\u5EF6\u8FDF\u4E3A\u540E\u7AEF\u6BEB\u79D2\u6570",
        extra: h(Button, { onClick: onProbe, disabled: probing, tone: "primary" }, probing ? "\u63A2\u6D4B\u4E2D\u2026" : "\u5F00\u59CB\u63A2\u6D4B")
      },
      h(Table, {
        columns: [
          { key: "ts", title: "\u65F6\u95F4", render: (r) => fmtTime(r.ts) },
          { key: "provider", title: "\u670D\u52A1\u5546", render: (r) => r.provider ? h(Mono, null, r.provider) : "\u2014" },
          { key: "model", title: "\u6A21\u578B", render: (r) => r.model ? h(Mono, null, r.model) : "\u2014" },
          { key: "ms", title: "\u5EF6\u8FDF(ms)", align: "right", render: (r) => r.ok === false ? "\u2014" : fmtNum(r.ms) },
          { key: "ok", title: "\u7ED3\u679C", render: (r) => r.ok === false ? h("span", { style: { color: TOKENS.danger } }, "\u5931\u8D25") : h("span", { style: { color: TOKENS.ok } }, "\u901A") },
          { key: "chars", title: "\u5B57\u7B26\u6570", align: "right", render: (r) => fmtNum(r.chars) },
          { key: "sample", title: "\u8FD4\u56DE\u6837\u4F8B", render: (r) => h(Mono, null, String(r.sample || "").slice(0, 60)) }
        ],
        rows: probeRuns,
        empty: "\u70B9\u51FB\u4E0A\u65B9\u300C\u5F00\u59CB\u63A2\u6D4B\u300D\u5B9E\u6D4B\u5F53\u524D\u9ED8\u8BA4\u6A21\u578B\u7684\u94FE\u8DEF\u5EF6\u8FDF"
      })
    ),
    h(
      Section,
      {
        title: "\u7528\u91CF\uFF08\u751F\u6210\u4EFB\u52A1\u5408\u8BA1\uFF09",
        hint: `\u6309 ${usage.jobs} \u4E2A\u751F\u6210\u4EFB\u52A1\u5408\u8BA1`
      },
      h(
        "div",
        { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px,1fr))", gap: 12 } },
        h(Card, { title: "LLM \u8C03\u7528\u6B21\u6570", value: fmtNum(usage.calls), hint: "\u5404\u4EFB\u52A1\u8C03\u7528\u6B21\u6570\u5408\u8BA1" }),
        h(Card, { title: "\u8F93\u5165 tokens", value: fmtNum(usage.inputTokens), hint: "\u5404\u4EFB\u52A1\u8F93\u5165\u6D88\u8017\u5408\u8BA1" }),
        h(Card, { title: "\u8F93\u51FA tokens", value: fmtNum(usage.outputTokens), hint: "\u5404\u4EFB\u52A1\u8F93\u51FA\u6D88\u8017\u5408\u8BA1" })
      )
    ),
    h(
      Section,
      { title: `\u670D\u52A1\u5546\u5168\u91CF\u6E05\u5355\uFF08${legacyProviders.length}\uFF09`, hint: "\u53EA\u8BFB\u6E05\u5355\uFF0C\u4E0D\u5728\u540E\u53F0\u4FEE\u6539" },
      loading.legacy && !legacy ? h(Loading) : h(
        "div",
        { style: { display: "grid", gap: 10 } },
        legacyProviders.map((p) => h(
          "div",
          { key: p.provider, style: { padding: "10px 12px", borderRadius: 8, border: `1px solid ${TOKENS.border}`, background: TOKENS.bg } },
          h("div", { style: { fontSize: 12.5, fontWeight: 650, marginBottom: 6 } }, p.provider),
          h(
            "div",
            { style: { display: "flex", gap: 6, flexWrap: "wrap" } },
            (p.models || []).map((m) => h("span", { key: m, style: { fontSize: 11, padding: "2px 8px", borderRadius: 999, background: TOKENS.bgSoft, border: `1px solid ${TOKENS.border}`, fontFamily: TOKENS.mono } }, m))
          )
        )),
        legacyProviders.length === 0 ? h(Empty, { text: "\u672A\u8BFB\u53D6\u5230\u670D\u52A1\u5546\u6E05\u5355" }) : null,
        legacyProbe.length ? h(
          "div",
          null,
          h(
            "div",
            { style: { fontSize: 11.5, opacity: 0.6, margin: "12px 0 8px" } },
            `\u5386\u53F2\u63A2\u6D4B\u5FEB\u7167\uFF08\u975E\u672C\u6B21\u5B9E\u6D4B\uFF09`
          ),
          h(Table, {
            columns: [
              { key: "provider", title: "\u670D\u52A1\u5546", render: (r) => h(Mono, null, r.provider) },
              { key: "model", title: "\u6A21\u578B", render: (r) => h(Mono, null, r.model) },
              { key: "http_status", title: "HTTP \u72B6\u6001", align: "right" },
              { key: "latency_ms", title: "\u5EF6\u8FDF(ms)", align: "right" },
              { key: "verdict", title: "\u5224\u5B9A" }
            ],
            rows: legacyProbe,
            empty: "\u6682\u65E0\u5386\u53F2\u63A2\u6D4B\u8BB0\u5F55"
          })
        ) : null
      )
    )
  );
}
function PageLogs({ logs, jobs, projects, loading, errors, busy, onRefresh, onCancelJob, onExportRange }) {
  const [op, setOp] = useState("\u5168\u90E8");
  const [form, setForm] = useState({ projectId: "", from: "", to: "", format: "docx" });
  const filtered = useMemo(() => (logs || []).filter((r) => op === "\u5168\u90E8" || r.op === op), [logs, op]);
  const set = (patch) => setForm((s) => ({ ...s, ...patch }));
  const rangeBusy = !!busy["export:range"];
  const jobBusy = (j) => !!busy[`cancel:${j.id}`];
  const submitExport = () => {
    if (!form.projectId) return onExportRange({ ...form, error: "\u8BF7\u5148\u9009\u62E9\u9879\u76EE" });
    onExportRange(form);
  };
  return h(
    "div",
    null,
    h(ErrorBox, { error: errors.jobs || errors.logs || errors.projects, onRetry: onRefresh }),
    h(
      Section,
      {
        title: `\u751F\u6210\u4EFB\u52A1\uFF08${(jobs || []).length}\uFF09`,
        hint: "\u53D6\u6D88\u4EFB\u52A1\u9700\u4E8C\u6B21\u786E\u8BA4"
      },
      loading.jobs && !jobs ? h(Loading) : h(Table, {
        columns: [
          { key: "id", title: "\u4EFB\u52A1", render: (r) => h(Mono, null, String(r.id).replace(/^job_/, "").slice(0, 10) + "\u2026") },
          { key: "projectTitle", title: "\u9879\u76EE", render: (r) => h("span", { style: { fontWeight: 600, whiteSpace: "nowrap" } }, r.projectTitle) },
          { key: "range", title: "\u96C6\u8303\u56F4", render: (r) => h("span", { style: { whiteSpace: "nowrap" } }, fmtScope(jobScope(r), r)) },
          { key: "status", title: "\u72B6\u6001", render: (r) => h(JobBadge, { status: r.status }) },
          { key: "progress", title: "\u8FDB\u5EA6", render: (r) => h(Progress, { ...r.progress || {} }) },
          { key: "duration", title: "\u8017\u65F6", render: (r) => h("span", { style: { whiteSpace: "nowrap" } }, fmtDuration(r.startedAt || r.createdAt, r.finishedAt)) },
          { key: "model", title: "\u6A21\u578B", render: (r) => h("span", { whiteSpace: "nowrap", title: `${r.provider}/${r.model}` }, h(Mono, null, r.model)) },
          {
            key: "act",
            title: "\u64CD\u4F5C",
            render: (r) => h(Button, {
              tone: "danger",
              onClick: () => onCancelJob(r),
              disabled: !["queued", "running"].includes(r.status) || jobBusy(r),
              title: ["queued", "running"].includes(r.status) ? "\u53D6\u6D88\u4EFB\u52A1\uFF08\u9700\u786E\u8BA4\uFF09" : "\u4EFB\u52A1\u5DF2\u7ED3\u675F\uFF0C\u65E0\u9700\u53D6\u6D88"
            }, jobBusy(r) ? "\u53D6\u6D88\u4E2D\u2026" : "\u53D6\u6D88")
          }
        ],
        rows: jobs || [],
        empty: "\u6682\u65E0\u751F\u6210\u4EFB\u52A1"
      })
    ),
    h(
      Section,
      { title: "\u5BFC\u51FA\uFF08\u6309\u9879\u76EE \xB7 \u96C6\u8303\u56F4\uFF09", hint: "\u6309\u9879\u76EE\u5BFC\u51FA\uFF1B\u586B\u4E86\u96C6\u8303\u56F4\u5C31\u53EA\u5BFC\u51FA\u8BE5\u8303\u56F4" },
      h(
        "div",
        { style: { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", padding: "12px 14px", border: `1px solid ${TOKENS.border}`, borderRadius: 10, background: TOKENS.bg } },
        h(
          Field,
          { label: "\u9879\u76EE", width: 220 },
          h(Select, {
            value: form.projectId,
            onChange: (v) => set({ projectId: v }),
            options: [{ value: "", label: "\u8BF7\u9009\u62E9\u9879\u76EE\u2026" }].concat((projects || []).map((p) => ({ value: p.id, label: p.title }))),
            style: { width: "100%" }
          })
        ),
        h(
          Field,
          { label: "\u8D77\u59CB\u96C6", width: 110 },
          h(Input, { value: form.from, type: "number", min: 1, onChange: (v) => set({ from: v }), placeholder: "1" })
        ),
        h(
          Field,
          { label: "\u7ED3\u675F\u96C6", width: 110 },
          h(Input, { value: form.to, type: "number", min: 1, onChange: (v) => set({ to: v }), placeholder: "\u7559\u7A7A=\u8D77\u59CB\u96C6" })
        ),
        h(
          Field,
          { label: "\u683C\u5F0F", width: 100 },
          h(Select, { value: form.format, onChange: (v) => set({ format: v }), options: EXPORT_FORMATS })
        ),
        h(Button, { tone: "primary", onClick: submitExport, disabled: rangeBusy }, rangeBusy ? "\u5BFC\u51FA\u4E2D\u2026" : "\u5BFC\u51FA"),
        h("span", { style: { fontSize: 11, color: TOKENS.labelSecondary, paddingBottom: 6 } }, "\u96C6\u8303\u56F4\u7559\u7A7A = \u6574\u90E8\u9879\u76EE")
      )
    ),
    h(
      Section,
      {
        title: `\u5BA1\u8BA1\u65E5\u5FD7\uFF08${filtered.length}/${(logs || []).length}\uFF09`,
        hint: "\u6700\u8FD1 300 \u6761",
        extra: h(
          "div",
          { style: { display: "flex", gap: 8, alignItems: "center" } },
          h("span", { style: { fontSize: 11, color: TOKENS.labelSecondary } }, "\u64CD\u4F5C\u7C7B\u578B"),
          h(Select, { value: op, onChange: setOp, options: LOG_OP_OPTIONS })
        )
      },
      loading.logs && !logs ? h(Loading) : h(Table, {
        columns: [
          { key: "ts", title: "\u65F6\u95F4", render: (r) => fmtTime(r.ts) },
          { key: "projectTitle", title: "\u9879\u76EE" },
          { key: "actor", title: "\u64CD\u4F5C\u4EBA" },
          { key: "op", title: "\u64CD\u4F5C", render: (r) => opLabel(r.op) },
          { key: "nodeId", title: "\u8282\u70B9", render: (r) => r.nodeId ? h(Mono, null, String(r.nodeId).slice(0, 12) + "\u2026") : "\u2014" },
          { key: "seq", title: "\u5E8F\u53F7", align: "right" }
        ],
        rows: filtered,
        empty: op === "\u5168\u90E8" ? "\u8FD8\u6CA1\u6709\u5BA1\u8BA1\u4E8B\u4EF6" : `\u300C${opLabel(op)}\u300D\u6682\u65E0\u65E5\u5FD7`
      })
    )
  );
}
var TABS = [
  { id: "overview", label: "\u5DE5\u4F5C\u53F0", icon: "\u25A4" },
  { id: "projects", label: "\u9879\u76EE", icon: "\u25A6" },
  { id: "rules", label: "\u89C4\u5219\u4E0E\u6280\u80FD", icon: "\u2699" },
  { id: "models", label: "\u6A21\u578B\u4E0E\u7528\u91CF", icon: "\u25C8" },
  { id: "logs", label: "\u65E5\u5FD7\u4E0E\u5BFC\u51FA", icon: "\u2630" }
];
var TAB_HINT = {
  overview: "\u6570\u636E\u81EA\u52A8\u5237\u65B0\uFF0C\u6570\u5B57\u6765\u81EA\u540E\u7AEF\u7EDF\u8BA1",
  projects: "\u8282\u70B9\u3001\u5B57\u6570\u4E0E\u5DF2\u751F\u6210\u96C6\u6570\u4E3A\u540E\u7AEF\u7EDF\u8BA1",
  rules: "\u53EA\u8BFB\u626B\u63CF\u89C4\u5219\u4E0E\u6280\u80FD\u76EE\u5F55",
  models: "\u6A21\u578B\u4FE1\u606F\u4E0E\u94FE\u8DEF\u63A2\u6D4B\uFF08\u53EA\u8BFB\uFF09",
  logs: "\u4EFB\u52A1\u3001\u65E5\u5FD7\u4E0E\u5BFC\u51FA"
};
function App() {
  const [tab, setTab] = useState("overview");
  const [data, setData] = useState({ stats: null, projects: null, jobs: null, rules: null, logs: null, llmInfo: null, legacy: null });
  const [loading, setLoading] = useState({});
  const [errors, setErrors] = useState({});
  const [toast, setToast] = useState(null);
  const [confirmSpec, setConfirmSpec] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [busy, setBusy] = useState({});
  const [probeRuns, setProbeRuns] = useState([]);
  const [probing, setProbing] = useState(false);
  const toastTimer = useRef(null);
  const showToast = useCallback((t) => {
    setToast(t);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), t && t.duration || 3200);
  }, []);
  useEffect(() => () => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
  }, []);
  const setLoad = (key, val) => setLoading((s) => ({ ...s, [key]: val }));
  const setErr = (key, val) => setErrors((s) => ({ ...s, [key]: val }));
  const setKey = (key, val) => setData((s) => ({ ...s, [key]: val }));
  const markBusy = (key, val) => setBusy((s) => ({ ...s, [key]: val }));
  const load = useCallback(async (key, path, body) => {
    setLoad(key, true);
    try {
      const value = await post(path, body || {});
      setKey(key, value);
      setErr(key, "");
      return value;
    } catch (e) {
      setErr(key, e.message);
      return null;
    } finally {
      setLoad(key, false);
    }
  }, []);
  const loadStats = useCallback(() => load("stats", EP.stats), [load]);
  const loadProjects = useCallback(() => load("projects", EP.projects), [load]);
  const loadJobs = useCallback(() => load("jobs", EP.jobs), [load]);
  const loadRules = useCallback(() => load("rules", EP.rules), [load]);
  const loadLogs = useCallback(() => load("logs", EP.logs, { limit: 300 }), [load]);
  const loadLlmInfo = useCallback(() => load("llmInfo", EP.llmInfo), [load]);
  const loadLegacy = useCallback(() => load("legacy", EP.legacyModels), [load]);
  useEffect(() => {
    if (tab === "overview") {
      loadStats();
      loadJobs();
      loadProjects();
    } else if (tab === "projects") {
      loadProjects();
      loadStats();
      loadJobs();
    } else if (tab === "rules") {
      loadRules();
    } else if (tab === "models") {
      loadLlmInfo();
      loadLegacy();
    } else if (tab === "logs") {
      loadLogs();
      loadJobs();
      loadProjects();
    }
  }, [tab, loadStats, loadJobs, loadProjects, loadRules, loadLlmInfo, loadLegacy, loadLogs]);
  const refreshCurrent = useCallback(() => {
    if (tab === "overview") {
      loadStats();
      loadJobs();
      loadProjects();
    } else if (tab === "projects") {
      loadProjects();
      loadStats();
      loadJobs();
    } else if (tab === "rules") loadRules();
    else if (tab === "models") {
      loadLlmInfo();
      loadLegacy();
    } else if (tab === "logs") {
      loadLogs();
      loadJobs();
      loadProjects();
    }
  }, [tab, loadStats, loadJobs, loadProjects, loadRules, loadLlmInfo, loadLegacy, loadLogs]);
  const openConfirm = useCallback((spec) => setConfirmSpec({ tone: "default", confirmText: "\u786E\u8BA4", ...spec }), []);
  const runConfirm = useCallback(async () => {
    if (!confirmSpec || confirmBusy) return;
    setConfirmBusy(true);
    try {
      await confirmSpec.onConfirm();
      setConfirmSpec(null);
    } catch (e) {
      showToast({ kind: "error", text: "\u64CD\u4F5C\u5931\u8D25\uFF1A" + (e && e.message ? e.message : e) });
    } finally {
      setConfirmBusy(false);
    }
  }, [confirmSpec, confirmBusy, showToast]);
  const statsMap = useMemo(() => {
    const map = {};
    for (const p of data.stats && data.stats.projects || []) map[p.id] = p;
    return map;
  }, [data.stats]);
  const onOpenCanvas = useCallback((project) => {
    try {
      window.localStorage.setItem("moxi:lastProject", project.id);
    } catch {
    }
    showToast({ kind: "success", text: `\u5DF2\u5B9A\u4F4D\u9879\u76EE\u300C${project.title}\u300D\u2192 \u70B9\u5DE6\u4FA7\u300C\u58A8\u620F\u753B\u5E03\u300D\u6253\u5F00` });
  }, [showToast]);
  const exportOne = useCallback(async (project, opts = {}) => {
    const key = `export:${project.id}`;
    if (busy[key]) return;
    markBusy(key, true);
    try {
      const payload = { projectId: project.id, format: opts.format || "docx" };
      if (opts.range && opts.range.from) payload.range = opts.range;
      const r = await post(EP.export, payload);
      const kb = `${Math.max(1, Math.round((Number(r.bytes) || 0) / 1024))} KB`;
      if (r.fallback) {
        showToast({
          kind: "warn",
          text: `docx \u4E0D\u53EF\u7528\uFF0C\u5DF2\u964D\u7EA7 ${r.format} \xB7 ${r.path} \xB7 ${kb}\uFF08${String(r.fallback.reason || "").slice(0, 70)}\uFF09`,
          duration: 6e3
        });
      } else {
        showToast({ kind: "success", text: `\u5DF2\u5BFC\u51FA ${r.format} \xB7 ${r.path} \xB7 ${kb} \xB7 ${r.sections} \u8282`, duration: 6e3 });
      }
    } catch (e) {
      showToast({ kind: "error", text: "\u5BFC\u51FA\u5931\u8D25\uFF1A" + e.message });
    } finally {
      markBusy(key, false);
    }
  }, [busy, showToast]);
  const onExportRange = useCallback(async (form) => {
    if (form && form.error) {
      showToast({ kind: "error", text: form.error });
      return;
    }
    const from = Number(form.from);
    const to = Number(form.to);
    if (Number.isFinite(from) && from > 0 && Number.isFinite(to) && to > 0 && to < from) {
      showToast({ kind: "error", text: `\u96C6\u8303\u56F4\u4E0D\u5408\u6CD5\uFF1A\u7ED3\u675F\u96C6\uFF08${to}\uFF09\u65E9\u4E8E\u8D77\u59CB\u96C6\uFF08${from}\uFF09` });
      return;
    }
    const project = (data.projects || []).find((p) => p.id === form.projectId) || { id: form.projectId, title: form.projectId };
    const range = Number.isFinite(from) && from > 0 ? { from, to: Number.isFinite(to) && to > 0 ? to : from } : null;
    await exportOne(project, { format: form.format, range });
  }, [data.projects, exportOne, showToast]);
  const onDeleteProject = useCallback((project) => {
    const s = statsMap[project.id] || {};
    openConfirm({
      tone: "danger",
      title: "\u5220\u9664\u9879\u76EE",
      confirmText: "\u5220\u9664\u9879\u76EE",
      message: `\u786E\u8BA4\u5220\u9664\u9879\u76EE\u300C${project.title}\u300D\uFF1F

\u8282\u70B9\u6570\uFF1A${s.nodes == null ? "\u2014" : s.nodes} \xB7 \u5B57\u6570\uFF1A${s.words == null ? "\u2014" : s.words} \xB7 \u5DF2\u751F\u6210\uFF1A${s.episodes == null ? "\u2014" : s.episodes} \u96C6

\u9879\u76EE\u4F1A\u79FB\u5165\u5DE5\u4F5C\u533A\u56DE\u6536\u7AD9\uFF0C\u53EF\u4ECE\u78C1\u76D8\u4E0A\u627E\u56DE\u3002`,
      onConfirm: async () => {
        const r = await post(EP.projectDelete, { projectId: project.id });
        showToast({ kind: "success", text: `\u5DF2\u5220\u9664\u300C${project.title}\u300D\u2192 ${r.trashPath}`, duration: 5e3 });
        loadProjects();
        loadStats();
        loadJobs();
      }
    });
  }, [openConfirm, statsMap, showToast, loadProjects, loadStats, loadJobs]);
  const releaseProject = useCallback((project) => {
    const key = `release:${project.id}`;
    openConfirm({
      tone: "primary",
      title: "\u4EBA\u5DE5\u653E\u884C",
      confirmText: "\u786E\u8BA4\u653E\u884C",
      message: `\u786E\u8BA4\u653E\u884C\u9879\u76EE\u300C${project.title}\u300D\uFF1F

\u542B\u4E49\uFF1A\u4F60\u5DF2\u901A\u8BFB/\u62BD\u67E5\u5267\u672C\uFF0C\u786E\u8BA4\u53EF\u4EE5\u4F5C\u4E3A\u4EA4\u4ED8\u7A3F\u3002\u653E\u884C\u540E\u4EA4\u4ED8\u8282\u70B9\u8F6C\u4E3A\u300C\u5DF2\u6279\u51C6\u300D\uFF0C\u5E76\u8BB0\u5F55\u653E\u884C\u65F6\u95F4\u3002`,
      onConfirm: async () => {
        markBusy(key, true);
        try {
          const r = await post(EP.release, { projectId: project.id });
          const st = r.deliveryStatus ? statusLabel(r.deliveryStatus) : "\u5DF2\u6279\u51C6";
          showToast({ kind: "success", text: `\u5DF2\u653E\u884C\u300C${project.title}\u300D\xB7 \u4EA4\u4ED8\u8282\u70B9${st}` });
          loadProjects();
          loadStats();
        } finally {
          markBusy(key, false);
        }
      }
    });
  }, [openConfirm, showToast, loadProjects, loadStats, markBusy]);
  const onCancelJob = useCallback((job) => {
    if (!job || !["queued", "running"].includes(job.status)) {
      showToast({ kind: "info", text: "\u4EFB\u52A1\u5DF2\u7ED3\u675F\uFF0C\u65E0\u9700\u53D6\u6D88" });
      return;
    }
    const p = job.progress || {};
    const scopeText = fmtScope(jobScope(job), job);
    openConfirm({
      tone: "danger",
      title: "\u53D6\u6D88\u751F\u6210\u4EFB\u52A1",
      confirmText: "\u53D6\u6D88\u4EFB\u52A1",
      message: `\u786E\u8BA4\u53D6\u6D88\u4EFB\u52A1 ${job.id}\uFF1F

\u9879\u76EE\uFF1A${job.projectTitle}
\u96C6\u8303\u56F4\uFF1A${scopeText}
\u8FDB\u5EA6\uFF1A${p.done || 0}/${p.total || 0} \u96C6\uFF08\u5931\u8D25 ${p.failed || 0} \u96C6\uFF09

\u5DF2\u751F\u6210\u7684\u96C6\u4E0E\u6B63\u6587\u4F1A\u4FDD\u7559\uFF0C\u53EF\u7A0D\u540E\u7EED\u8DD1\u3002`,
      onConfirm: async () => {
        const r = await post("/jobs/cancel", { jobId: job.id });
        showToast({ kind: "success", text: `\u5DF2\u53D6\u6D88\u4EFB\u52A1 ${r.id}\uFF08${jobStatusLabel(r.status)}\uFF09` });
        loadJobs();
        loadStats();
      }
    });
  }, [openConfirm, showToast, loadJobs, loadStats]);
  const runProbe = useCallback(async () => {
    if (probing) return;
    setProbing(true);
    try {
      const r = await post(EP.llmProbe, { maxTokens: 16, user: "ping", system: "\u53EA\u56DE\u590D pong \u56DB\u4E2A\u5B57\u6BCD\u3002" });
      const row = { ...r, ts: localNowIso() };
      setProbeRuns((rs) => [row, ...rs].slice(0, 20));
      showToast({ kind: "success", text: `\u63A2\u6D4B\u6210\u529F \xB7 ${r.provider}/${r.model} \xB7 ${r.ms} ms \xB7 ${r.chars} \u5B57\u7B26` });
    } catch (e) {
      setProbeRuns((rs) => [{ ts: localNowIso(), ok: false, provider: data.llmInfo && data.llmInfo.provider || "", model: "", ms: null, chars: 0, sample: e.message }, ...rs].slice(0, 20));
      showToast({ kind: "error", text: "\u63A2\u6D4B\u5931\u8D25\uFF1A" + e.message, duration: 5e3 });
    } finally {
      setProbing(false);
    }
  }, [probing, showToast, data.llmInfo]);
  const scanRules = useCallback(() => loadRules(), [loadRules]);
  const pages = {
    overview: h(PageOverview, {
      stats: data.stats,
      jobs: data.jobs,
      loading,
      errors,
      onRefresh: refreshCurrent,
      onGoJobs: () => setTab("logs")
    }),
    projects: h(PageProjects, {
      projects: data.projects,
      stats: data.stats,
      loading,
      errors,
      busy,
      onRefresh: refreshCurrent,
      onOpenCanvas,
      onExport: exportOne,
      onDelete: onDeleteProject,
      onRelease: releaseProject
    }),
    rules: h(PageRules, {
      data: data.rules,
      loading: !!loading.rules,
      scanning: !!loading.rules,
      error: errors.rules,
      onScan: scanRules
    }),
    models: h(PageModels, {
      llmInfo: data.llmInfo,
      legacy: data.legacy,
      jobs: data.jobs,
      probeRuns,
      probing,
      loading,
      error: errors.llmInfo || errors.legacy,
      onProbe: runProbe,
      onRefresh: refreshCurrent
    }),
    logs: h(PageLogs, {
      logs: data.logs,
      jobs: data.jobs,
      projects: data.projects,
      loading,
      errors,
      busy,
      onRefresh: refreshCurrent,
      onCancelJob,
      onExportRange
    })
  };
  const title = (TABS.find((t) => t.id === tab) || {}).label;
  const statsTime = (tab === "overview" || tab === "projects") && data.stats && data.stats.generatedAt ? `\u7EDF\u8BA1\u65F6\u95F4 ${fmtTime(data.stats.generatedAt)}` : "";
  const tabLoading = tab === "overview" ? !!(loading.stats || loading.jobs || loading.projects) : tab === "projects" ? !!(loading.projects || loading.stats || loading.jobs) : tab === "rules" ? !!loading.rules : tab === "models" ? !!(loading.llmInfo || loading.legacy) : !!(loading.logs || loading.jobs || loading.projects);
  return h(
    "div",
    {
      className: "moxi-app moxi-paper-bg",
      style: {
        height: "100%",
        width: "100%",
        display: "flex",
        boxSizing: "border-box",
        background: TOKENS.bg,
        color: TOKENS.text
      }
    },
    /* 左侧导航 */
    h(
      "div",
      {
        style: {
          width: 176,
          flex: "0 0 176px",
          borderRight: `1px solid ${TOKENS.border}`,
          padding: "14px 10px",
          display: "flex",
          flexDirection: "column",
          gap: 2
        }
      },
      h("div", { style: { fontSize: 11, opacity: 0.55, padding: "0 8px 8px" } }, "\u58A8\u620F\u540E\u53F0"),
      TABS.map((t) => h(
        "button",
        {
          key: t.id,
          onClick: () => setTab(t.id),
          style: {
            display: "flex",
            alignItems: "center",
            gap: 8,
            height: 32,
            padding: "0 10px",
            borderRadius: 7,
            border: 0,
            cursor: "pointer",
            fontSize: 12.5,
            textAlign: "left",
            background: tab === t.id ? TOKENS.bgSoft : "transparent",
            color: TOKENS.text,
            fontWeight: tab === t.id ? 650 : 400
          }
        },
        h("span", { style: { opacity: 0.7, width: 16 } }, t.icon),
        t.label
      ))
    ),
    /* 内容区 */
    h(
      "div",
      { style: { flex: 1, overflow: "auto", padding: "20px 24px", minWidth: 0 } },
      h(
        "div",
        { style: { display: "flex", alignItems: "baseline", gap: 10, marginBottom: 18, flexWrap: "wrap" } },
        h("h1", { style: { fontSize: 17, fontWeight: 680, margin: 0 } }, title),
        h("span", { style: { fontSize: 11, opacity: 0.5 } }, TAB_HINT[tab] || ""),
        h("span", { style: { flex: 1 } }),
        statsTime ? h("span", { style: { fontSize: 11, opacity: 0.5 } }, statsTime) : null,
        h(Button, { onClick: refreshCurrent, disabled: tabLoading }, "\u5237\u65B0")
      ),
      pages[tab]
    ),
    h(Toast, { toast }),
    h(Confirm, {
      open: !!confirmSpec,
      title: confirmSpec && confirmSpec.title,
      message: confirmSpec && confirmSpec.message,
      confirmText: confirmSpec && confirmSpec.confirmText,
      tone: confirmSpec && confirmSpec.tone,
      busy: confirmBusy,
      onCancel: () => {
        if (!confirmBusy) setConfirmSpec(null);
      },
      onConfirm: runConfirm
    })
  );
}

// dsh/bundles/moxi-admin/src/client.jsx
function SidebarIcon(props) {
  const size = props && props.size || 20;
  const active = !!(props && props.active);
  return import_react3.default.createElement(
    "svg",
    {
      viewBox: "0 0 24 24",
      width: size,
      height: size,
      "aria-hidden": true,
      style: { display: "block" },
      fill: "none",
      stroke: "currentColor",
      strokeWidth: active ? 2 : 1.6,
      strokeLinecap: "round",
      strokeLinejoin: "round"
    },
    import_react3.default.createElement("rect", { x: 3, y: 3, width: 18, height: 18, rx: 3 }),
    import_react3.default.createElement("path", { d: "M3 9h18M9 21V9" })
  );
}
var client_default = {
  inject: ["slots"],
  apply(ctx) {
    ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({
      name: "sidebar.panellist",
      id: "moxi-admin",
      order: 40,
      label: "\u58A8\u620F\u540E\u53F0"
    }, SidebarIcon));
    ctx.slots.inject("main", () => ctx.slots.register({
      name: "main",
      key: "moxi-admin"
    }, App));
  }
};

    var plugin = module.exports;
    if (plugin && plugin.default) plugin = plugin.default;
    return plugin;
  },
});
