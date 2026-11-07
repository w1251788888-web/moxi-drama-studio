/* moxi-canvas-bundle @ 0.1.0-spike — 由 scripts/build-client.mjs 生成，勿手改 */
window.__ModuleLoader__.load({
  id: "moxi-canvas-bundle",
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

// dsh/bundles/moxi-canvas/src/client.jsx
var client_exports = {};
__export(client_exports, {
  default: () => client_default
});
module.exports = __toCommonJS(client_exports);
var import_react4 = __toESM(require("react"), 1);

// dsh/bundles/moxi-canvas/src/App.jsx
var import_react2 = __toESM(require("react"), 1);

// dsh/bundles/moxi-canvas/src/api.js
var BASE = "/api/moxi";
async function call(path, body = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  let json;
  const text = await res.text();
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`\u54CD\u5E94\u4E0D\u662F JSON\uFF08HTTP ${res.status}\uFF09\uFF1A${text.slice(0, 120)}`);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (!json || json.ok !== true) {
    const err = json && json.error || {};
    const e = new Error(err.message || "\u8BF7\u6C42\u5931\u8D25");
    e.code = err.code || "E_UNKNOWN";
    e.details = err.details;
    throw e;
  }
  return json.value;
}
var _seq = 0;
function newIdemKey(prefix = "ui") {
  _seq += 1;
  return `${prefix}-${Date.now()}-${_seq}-${Math.random().toString(36).slice(2, 8)}`;
}
var api = {
  hello: () => call("/hello"),
  listProjects: () => call("/projects/list"),
  createProject: (input) => call("/projects/create", input),
  getProject: (projectId) => call("/project/get", { projectId }),
  deleteProject: (projectId) => call("/project/delete", { projectId }),
  getRev: (projectId) => call("/canvas/rev", { projectId }),
  apply: (projectId, ops, opts = {}) => call("/canvas/apply", { projectId, ops, ...opts }),
  getContent: (projectId, nodeId) => call("/node/content", { projectId, nodeId }),
  saveContent: (projectId, nodeId, text, baseVersion) => call("/node/save", { projectId, nodeId, text, baseVersion }),
  runCheck: (projectId, nodeId) => call("/check/run", { projectId, nodeId }),
  exportProject: (projectId, format, range, includeReports) => call("/export", { projectId, format, range, includeReports }),
  // 交付闭环
  releaseProject: (projectId, opts = {}) => call("/project/release", { projectId, ...opts }),
  listSnapshots: (projectId) => call("/snapshots/list", { projectId }),
  createSnapshot: (projectId, reason) => call("/snapshots/create", { projectId, reason }),
  restoreSnapshot: (projectId, snapshotId) => call("/snapshots/restore", { projectId, snapshotId }),
  revealFile: (path) => call("/reveal", { path }),
  readFile: (path) => call("/file/read", { path }),
  tailEvents: (projectId, limit = 30) => call("/events/tail", { projectId, limit }),
  // 可拍性：报告 + 逐集签收
  shootability: (projectId, format = "json", pacing) => call("/report/shootability", { projectId, format, pacing }),
  signoff: (projectId, episode, action = "sign", notes = "") => call("/episode/signoff", { projectId, episode, action, notes }),
  /* 生成任务（契约 §2） */
  startJob: (input) => call("/jobs/start", input),
  listJobs: (projectId) => call("/jobs/list", projectId ? { projectId } : {}),
  getJob: (jobId, projectId) => call("/jobs/get", projectId ? { jobId, projectId } : { jobId }),
  cancelJob: (jobId) => call("/jobs/cancel", { jobId }),
  resumeJob: (projectId, jobId) => call("/jobs/resume", { projectId, jobId }),
  /* 模型（契约 §3） */
  llmInfo: () => call("/llm/info"),
  llmProbe: (input) => call("/llm/probe", input || {}),
  /* 统计（契约 §4） */
  stats: () => call("/stats")
};
var JOB_TERMINAL = /* @__PURE__ */ new Set(["done", "done_with_errors", "cancelled", "failed"]);
function isJobTerminal(job) {
  return !job || JOB_TERMINAL.has(String(job.status || ""));
}

// dsh/bundles/moxi-canvas/src/theme.js
var import_react = __toESM(require("react"), 1);
var h = import_react.default.createElement;
var NODE_TYPES = {
  project_root: { label: "\u9879\u76EE\u6839", glyph: "\u25C6", accent: "#8b5cf6" },
  settings: { label: "\u8BBE\u5B9A\u96C6", glyph: "\u25A4", accent: "#0ea5e9" },
  asset: { label: "\u8D44\u4EA7", glyph: "\u25C8", accent: "#14b8a6" },
  beat_sheet: { label: "\u5206\u96C6\u8282\u62CD", glyph: "\u25A6", accent: "#f59e0b" },
  scene_list: { label: "\u5206\u573A\u8868", glyph: "\u2630", accent: "#eab308" },
  script_scene: { label: "\u5267\u672C\u573A\u6B21", glyph: "\u270E", accent: "#ef4444" },
  quality: { label: "\u8D28\u68C0", glyph: "\u2713", accent: "#22c55e" },
  compliance: { label: "\u5408\u89C4", glyph: "\u2696", accent: "#6366f1" },
  delivery: { label: "\u5206\u955C\xB7\u5BFC\u51FA", glyph: "\u2913", accent: "#ec4899" }
};
var STATUS_META = {
  draft: { label: "\u8349\u7A3F", color: "#94a3b8" },
  generating: { label: "\u751F\u6210\u4E2D", color: "#3b82f6" },
  review: { label: "\u5F85\u5BA1", color: "#f59e0b" },
  rejected: { label: "\u6253\u56DE", color: "#ef4444" },
  approved: { label: "\u5DF2\u6279\u51C6", color: "#22c55e" },
  blocked: { label: "\u963B\u585E", color: "#a1a1aa" }
};
var JOB_STATUS_META = {
  queued: { label: "\u6392\u961F\u4E2D", color: "#94a3b8" },
  running: { label: "\u8FD0\u884C\u4E2D", color: "#3b82f6" },
  done: { label: "\u5DF2\u5B8C\u6210", color: "#22c55e" },
  done_with_errors: { label: "\u5B8C\u6210\u4F46\u6709\u5931\u8D25", color: "#f97316" },
  cancelled: { label: "\u5DF2\u53D6\u6D88", color: "#a1a1aa" },
  failed: { label: "\u5931\u8D25", color: "#ef4444" }
};
var EP_STATUS_META = {
  pending: { label: "\u5F85\u751F\u6210", color: "#94a3b8" },
  running: { label: "\u751F\u6210\u4E2D", color: "#3b82f6" },
  done: { label: "\u5B8C\u6210", color: "#22c55e" },
  failed: { label: "\u5931\u8D25", color: "#ef4444" }
};
var EP_STAGE_LABEL = {
  pending: "\u5F85\u751F\u6210",
  beat: "\u8282\u62CD",
  scene: "\u5206\u573A",
  script: "\u5267\u672C",
  check: "\u786E\u5B9A\u6027\u68C0\u67E5",
  compliance: "\u5408\u89C4",
  done: "\u5B8C\u6210"
};
var TRANSITION_LABEL = {
  generating: "\u5F00\u59CB\u751F\u6210",
  review: "\u9001\u5BA1",
  approved: "\u901A\u8FC7",
  rejected: "\u6253\u56DE",
  draft: "\u9000\u56DE\u8349\u7A3F",
  blocked: "\u7F6E\u4E3A\u963B\u585E"
};
var TOKENS = {
  border: "var(--dsw-alias-border-l1, rgba(127,127,127,.25))",
  bg: "var(--dsw-alias-bg-layer-1, #fff)",
  bgSoft: "var(--dsw-alias-bg-layer-2, rgba(127,127,127,.06))",
  text: "var(--dsw-alias-label-primary, #18181b)",
  dim: "var(--dsw-alias-label-secondary, rgba(127,127,127,1))",
  brand: "var(--dsw-alias-brand-primary, #247bbf)",
  mono: "ui-monospace, SFMono-Regular, Menlo, monospace"
};
function Pill({ color, children, title }) {
  return h("span", {
    title,
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      fontSize: 10.5,
      lineHeight: "16px",
      padding: "0 7px",
      borderRadius: 999,
      color,
      border: `1px solid ${color}55`,
      background: `${color}14`,
      whiteSpace: "nowrap"
    }
  }, h("span", { style: { width: 5, height: 5, borderRadius: 999, background: color } }), children);
}
function Badge({ status }) {
  const meta = STATUS_META[status] || STATUS_META.draft;
  return h(Pill, { color: meta.color }, meta.label);
}
function JobBadge({ status }) {
  const meta = JOB_STATUS_META[status] || JOB_STATUS_META.queued;
  return h(Pill, { color: meta.color }, meta.label);
}
function EpBadge({ status }) {
  const meta = EP_STATUS_META[status] || EP_STATUS_META.pending;
  return h(Pill, { color: meta.color }, meta.label);
}
function Button({ children, onClick, tone = "default", disabled, title, style, ...rest }) {
  const tones = {
    default: { color: TOKENS.text, background: TOKENS.bg, border: `1px solid ${TOKENS.border}` },
    primary: { color: "#fff", background: "#247bbf", border: "1px solid #247bbf" },
    danger: { color: "#fff", background: "#dc2626", border: "1px solid #dc2626" },
    ghost: { color: TOKENS.text, background: "transparent", border: "1px solid transparent" }
  };
  return h("button", {
    onClick,
    disabled,
    title,
    ...rest,
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
function Input({ value, onChange, placeholder, style, onEnter, disabled, type, min, max, ...rest }) {
  return h("input", {
    value: value ?? "",
    placeholder,
    disabled,
    type,
    min,
    max,
    onChange: (e) => onChange && onChange(e.target.value),
    onKeyDown: (e) => {
      if (e.key === "Enter" && onEnter) onEnter();
    },
    ...rest,
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
function Select({ value, onChange, options, style, disabled, ...rest }) {
  return h("select", {
    value: value ?? "",
    disabled,
    onChange: (e) => onChange && onChange(e.target.value),
    ...rest,
    style: {
      height: 28,
      padding: "0 6px",
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
  }, (options || []).map((o) => h("option", { key: o.value, value: o.value, disabled: o.disabled }, o.label)));
}
function Checkbox({ checked, onChange, label, ...rest }) {
  return h(
    "label",
    { style: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" } },
    h("input", {
      type: "checkbox",
      checked: !!checked,
      onChange: (e) => onChange && onChange(e.target.checked),
      ...rest,
      style: { width: 14, height: 14, accentColor: "#247bbf", cursor: "pointer" }
    }),
    label
  );
}
function Field({ label, hint, children, style }) {
  return h(
    "label",
    { style: { display: "block", fontSize: 12, ...style } },
    h("div", { style: { marginBottom: 4, opacity: 0.85 } }, label),
    children,
    hint ? h("div", { style: { marginTop: 4, fontSize: 11, opacity: 0.55, lineHeight: 1.45 } }, hint) : null
  );
}
function SectionTitle({ children, right }) {
  return h(
    "div",
    { style: { display: "flex", alignItems: "center", gap: 8, margin: "2px 0 8px" } },
    h("div", { style: { fontSize: 12, fontWeight: 650 } }, children),
    h("span", { style: { flex: 1 } }),
    right || null
  );
}
function ProgressBar({ done = 0, total = 0, failed = 0, height = 8 }) {
  const safeTotal = Math.max(1, Number(total) || 0);
  const donePct = Math.min(100, (Number(done) || 0) / safeTotal * 100);
  const failPct = Math.min(100 - donePct, (Number(failed) || 0) / safeTotal * 100);
  return h(
    "div",
    {
      style: { height, borderRadius: 999, background: TOKENS.bgSoft, border: `1px solid ${TOKENS.border}`, overflow: "hidden", display: "flex" }
    },
    h("div", { style: { width: `${donePct}%`, background: "#22c55e", transition: "width .3s" } }),
    h("div", { style: { width: `${failPct}%`, background: "#ef4444", transition: "width .3s" } })
  );
}
function Spinner({ size = 12 }) {
  return h("span", {
    style: {
      display: "inline-block",
      width: size,
      height: size,
      borderRadius: 999,
      border: "2px solid rgba(127,127,127,.35)",
      borderTopColor: TOKENS.brand,
      animation: "mxspin .8s linear infinite"
    }
  }, h("style", null, "@keyframes mxspin{to{transform:rotate(360deg)}}"));
}
function Modal({ title, children, onClose, footer, width = 520, testid }) {
  return h(
    "div",
    {
      "data-testid": testid,
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
        { style: { padding: "14px 16px", borderBottom: `1px solid ${TOKENS.border}`, display: "flex", alignItems: "center", gap: 8 } },
        h("div", { style: { flex: 1, fontSize: 14, fontWeight: 650 } }, title),
        h("button", {
          "data-testid": testid ? `${testid}-close` : void 0,
          onClick: onClose,
          style: { border: 0, background: "transparent", cursor: "pointer", fontSize: 16, opacity: 0.6, color: "inherit" }
        }, "\xD7")
      ),
      h("div", { style: { padding: 16 } }, children),
      footer ? h("div", { style: { padding: "10px 16px", borderTop: `1px solid ${TOKENS.border}`, display: "flex", justifyContent: "flex-end", gap: 8 } }, footer) : null
    )
  );
}
function Drawer({ title, onClose, children, footer, width = 520, testid }) {
  return h(
    "div",
    {
      "data-testid": testid,
      style: {
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        zIndex: 1800,
        width,
        maxWidth: "96vw",
        display: "flex",
        flexDirection: "column",
        background: TOKENS.bg,
        color: TOKENS.text,
        borderLeft: `1px solid ${TOKENS.border}`,
        boxShadow: "-12px 0 40px rgba(0,0,0,.18)"
      }
    },
    h(
      "div",
      { style: { padding: "12px 14px", borderBottom: `1px solid ${TOKENS.border}`, display: "flex", alignItems: "center", gap: 8 } },
      h("div", { style: { flex: 1, fontSize: 13.5, fontWeight: 650 } }, title),
      h("button", {
        "data-testid": testid ? `${testid}-close-icon` : void 0,
        onClick: onClose,
        style: { border: 0, background: "transparent", cursor: "pointer", fontSize: 16, opacity: 0.6, color: "inherit" }
      }, "\xD7")
    ),
    h("div", { style: { flex: 1, minHeight: 0, overflow: "auto", padding: "12px 14px" } }, children),
    footer ? h("div", { style: { padding: "10px 14px", borderTop: `1px solid ${TOKENS.border}`, display: "flex", gap: 8, justifyContent: "flex-end" } }, footer) : null
  );
}
function ConfirmModal({ title = "\u786E\u8BA4\u64CD\u4F5C", message, detail, confirmText = "\u786E\u8BA4", cancelText = "\u53D6\u6D88", danger, busy, onConfirm, onCancel, testid = "modal-confirm" }) {
  return h(
    Modal,
    {
      title,
      onClose: busy ? () => {
      } : onCancel,
      width: 460,
      testid,
      footer: [
        h(Button, { key: "no", "data-testid": "btn-confirm-no", onClick: onCancel, disabled: busy }, cancelText),
        h(Button, {
          key: "yes",
          "data-testid": "btn-confirm-yes",
          tone: danger ? "danger" : "primary",
          onClick: onConfirm,
          disabled: busy
        }, busy ? "\u5904\u7406\u4E2D\u2026" : confirmText)
      ]
    },
    h("div", { style: { fontSize: 13, lineHeight: 1.6 } }, message),
    detail ? h("div", { style: { marginTop: 8, fontSize: 11.5, opacity: 0.65, lineHeight: 1.55 } }, detail) : null
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
  const color = toast.kind === "error" ? "#dc2626" : toast.kind === "success" ? "#16a34a" : "#3b82f6";
  return h(
    "div",
    {
      "data-testid": "toast",
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
        boxShadow: "0 8px 24px rgba(0,0,0,.25)",
        maxWidth: "86vw",
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap"
      }
    },
    h("span", { "data-testid": "toast-text", style: { lineHeight: 1.55, wordBreak: "break-all" } }, toast.text),
    toast.action ? h("button", {
      "data-testid": "toast-action",
      onClick: (e) => {
        e.stopPropagation();
        if (toast.action && typeof toast.action.onClick === "function") toast.action.onClick();
      },
      style: {
        height: 24,
        padding: "0 10px",
        borderRadius: 6,
        fontSize: 11.5,
        whiteSpace: "nowrap",
        cursor: "pointer",
        color: "#fff",
        background: "rgba(255,255,255,.18)",
        border: "1px solid rgba(255,255,255,.55)"
      }
    }, toast.action.label) : null
  );
}

// dsh/bundles/moxi-canvas/src/App.jsx
var { useState, useRef, useEffect, useMemo, useCallback } = import_react2.default;
var ALLOWED = {
  draft: ["generating"],
  generating: ["review", "draft"],
  review: ["approved", "rejected"],
  rejected: ["draft", "review"],
  approved: ["blocked", "draft"],
  blocked: ["approved", "draft"]
};
var UNDO_LIMIT = 100;
var fmtTs = (iso) => {
  if (!iso) return "\u2014";
  return String(iso).slice(5, 16).replace("T", " ");
};
var baseName = (p) => String(p || "").split("/").pop() || "";
var isEditableTarget = (t) => {
  if (!t) return false;
  const tag = String(t.tagName || "").toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable === true;
};
var randId = (prefix) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
async function copyTextToClipboard(text) {
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(String(text));
      return true;
    }
  } catch {
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = String(text);
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
var jobDone = (job) => {
  const p = job && job.progress || {};
  return { done: Number(p.done) || 0, failed: Number(p.failed) || 0, total: Number(p.total) || 0, current: p.current };
};
function ProjectsView({ projects, loading, onCreate, onOpen, onDelete, onRefresh, error }) {
  const [skin, setSkin] = useState(() => typeof window !== "undefined" && window.__moxiSkin ? window.__moxiSkin.getSkin() : "ink");
  const toggleSkin = () => {
    const next = skin === "ink" ? "host" : "ink";
    setSkin(next);
    if (window.__moxiSkin) window.__moxiSkin.setSkin(next);
  };
  const pendingOf = (p) => ((p.byStatus || {}).review || 0) + ((p.byStatus || {}).rejected || 0);
  return h(
    "div",
    {
      className: "moxi-app moxi-paper-bg",
      style: { height: "100%", overflow: "auto", padding: "34px 36px", boxSizing: "border-box" }
    },
    // 品牌头
    h(
      "div",
      { style: { display: "flex", alignItems: "flex-end", gap: 14, marginBottom: 6 } },
      h("h1", { className: "moxi-title", style: { fontSize: 26, margin: 0, lineHeight: 1.15 } }, "\u58A8\u620F\u751F\u82B1"),
      h("span", { style: { fontSize: 12.5, opacity: 0.6, paddingBottom: 2 } }, "\u58A8\u7A3F\u521B\u4F5C\u53F0 \xB7 \u65E0\u9650\u753B\u5E03"),
      h("span", { style: { flex: 1 } }),
      h("span", { className: "moxi-stamp" }, "\u5B9E\u9A8C\u7248"),
      h("span", { className: "moxi-stamp" }, skin === "ink" ? "\u58A8\u7A3F" : "\u539F\u751F"),
      h(
        Button,
        { onClick: toggleSkin, title: "\u5728\u58A8\u7A3F\u76AE\u80A4\u4E0E\u5BBF\u4E3B\u5916\u89C2\u4E4B\u95F4\u5207\u6362", "data-testid": "btn-skin-toggle" },
        skin === "ink" ? "\u7528\u5BBF\u4E3B\u5916\u89C2" : "\u7528\u58A8\u7A3F\u76AE\u80A4"
      )
    ),
    h(
      "p",
      { style: { fontSize: 13, opacity: 0.68, margin: "0 0 22px" } },
      "\u4E00\u5F20\u753B\u5E03\u5199\u4E00\u90E8\u5267\uFF1A\u5BF9\u8BDD\u662F\u5BFC\u6F14\uFF0C\u753B\u5E03\u662F\u7247\u573A\uFF0C\u5DE5\u4F4D\u662F\u62CD\u6444\u73B0\u573A\u3002"
    ),
    error ? h("div", { style: { marginBottom: 14, padding: "8px 12px", borderRadius: 8, fontSize: 12, background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca" } }, error) : null,
    h(
      "div",
      { style: { display: "flex", gap: 8, marginBottom: 18 } },
      h(Button, { tone: "primary", onClick: onCreate, "data-testid": "btn-new-project" }, "+ \u65B0\u5F00\u4E00\u90E8\u5267"),
      h(Button, { onClick: onRefresh, "data-testid": "btn-refresh-projects" }, "\u5237\u65B0")
    ),
    loading ? h("div", { style: { fontSize: 12, opacity: 0.6 } }, "\u52A0\u8F7D\u4E2D\u2026") : projects.length === 0 ? h(Empty, { text: "\u8FD8\u6CA1\u6709\u5267\u4F5C", action: h(Button, { tone: "primary", onClick: onCreate }, "\u65B0\u5F00\u7B2C\u4E00\u90E8\u5267") }) : h(
      "div",
      { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14, maxWidth: 1240 } },
      projects.map((p) => h(
        "div",
        {
          key: p.id,
          "data-testid": `project-card-${p.id}`,
          onClick: () => onOpen(p.id),
          className: "moxi-card",
          style: {
            cursor: "pointer",
            padding: "16px 18px",
            borderRadius: 12,
            background: TOKENS.bg,
            border: `1px solid ${TOKENS.border}`
          }
        },
        h(
          "div",
          { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 8 } },
          h("div", { className: "moxi-serif", style: { flex: 1, fontSize: 17, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, p.title),
          h("button", {
            "data-testid": `btn-delete-project-${p.id}`,
            onClick: (e) => {
              e.stopPropagation();
              onDelete(p);
            },
            title: "\u5220\u9664\u5230\u56DE\u6536\u7AD9",
            style: { border: 0, background: "transparent", cursor: "pointer", opacity: 0.4, fontSize: 13, color: "inherit" }
          }, "\u{1F5D1}")
        ),
        h(
          "div",
          { style: { fontSize: 11.5, opacity: 0.62, display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 } },
          h("span", null, `${p.episodeCount ?? "\u96C6\u6570\u672A\u786E\u8BA4"} \u96C6`),
          p.audience ? h("span", null, p.audience) : null,
          p.genre && p.genre.main ? h("span", null, p.genre.main) : null,
          h("span", null, "\u66F4\u65B0\u4E8E " + fmtTs(p.updatedAt))
        ),
        h(
          "div",
          { style: { display: "flex", alignItems: "center", gap: 8 } },
          p.reviewState === "generated" ? h("span", { className: "moxi-stamp" }, "\u5F85\u653E\u884C") : p.reviewState === "released" ? h("span", { className: "moxi-stamp", style: { color: TOKENS.success || "var(--moxi-accent)", borderColor: TOKENS.success || "var(--moxi-accent)" } }, "\u5DF2\u653E\u884C") : p.reviewState === "has_errors" ? h("span", { className: "moxi-stamp", style: { color: "#b91c1c", borderColor: "#b91c1c" } }, "\u6709\u5931\u8D25\u96C6") : pendingOf(p) > 0 ? h("span", { className: "moxi-stamp" }, `\u5F85\u5BA1 ${pendingOf(p)}`) : h("span", { style: { fontSize: 11, opacity: 0.5 } }, "\u6682\u65E0\u5F85\u5BA1"),
          h("span", { style: { flex: 1 } }),
          h(Button, { tone: "primary", onClick: (e) => {
            e.stopPropagation();
            onOpen(p.id);
          }, "data-testid": `btn-continue-${p.id}` }, "\u7EE7\u7EED\u521B\u4F5C")
        )
      ))
    )
  );
}
function NewProjectModal({ onClose, onSubmit, busy }) {
  const [title, setTitle] = useState("");
  const [episodes, setEpisodes] = useState("");
  const [audience, setAudience] = useState("\u5973\u9891");
  const [genre, setGenre] = useState("\u5BB6\u5EAD");
  const [logline, setLogline] = useState("");
  const submit = () => {
    if (!title.trim()) return;
    onSubmit({
      title: title.trim(),
      episodeCount: episodes ? Number(episodes) : null,
      audience,
      genreMain: genre,
      logline
    });
  };
  return h(
    Modal,
    {
      title: "\u65B0\u5EFA\u9879\u76EE",
      onClose,
      testid: "modal-new-project",
      footer: [
        h(Button, { key: "c", onClick: onClose }, "\u53D6\u6D88"),
        h(Button, { key: "s", tone: "primary", onClick: submit, disabled: busy || !title.trim(), "data-testid": "btn-create-project" }, busy ? "\u521B\u5EFA\u4E2D\u2026" : "\u521B\u5EFA\u5E76\u8FDB\u5165\u753B\u5E03")
      ]
    },
    h(
      "div",
      { style: { display: "grid", gap: 10 } },
      h(Field, { label: "\u9879\u76EE\u540D *" }, h(Input, { value: title, onChange: setTitle, placeholder: "\u4F8B\u5982\uFF1A\u6211\u7684\u7236\u6BCD\u6CA1\u7D20\u8D28", style: { width: "100%" }, "data-testid": "input-project-title" })),
      h(Field, { label: "\u96C6\u6570\uFF08\u786E\u8BA4\u540E\u624D\u751F\u6210\u5206\u96C6\u8282\u70B9\uFF09" }, h(Input, { value: episodes, onChange: setEpisodes, placeholder: "\u4F8B\u5982 60\uFF1B\u7559\u7A7A = \u672A\u786E\u8BA4", style: { width: "100%" } })),
      h(
        "div",
        { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 } },
        h(Field, { label: "\u53D7\u4F17" }, h(Input, { value: audience, onChange: setAudience, style: { width: "100%" } })),
        h(Field, { label: "\u4E3B\u7C7B\u578B" }, h(Input, { value: genre, onChange: setGenre, style: { width: "100%" } }))
      ),
      h(Field, { label: "\u4E00\u53E5\u8BDD\u6545\u4E8B" }, h(Input, { value: logline, onChange: setLogline, style: { width: "100%" } }))
    )
  );
}
function NodeCard({ node, selected, onPointerDown, onClick, findings, editing, editingText, onStartRename, onEditText, onCommitRename, onCancelRename }) {
  const meta = NODE_TYPES[node.type] || NODE_TYPES.settings;
  const errs = findings ? findings.filter((f) => f.severity === "error").length : 0;
  const warns = findings ? findings.filter((f) => f.severity === "warning").length : 0;
  const inputRef = useRef(null);
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);
  return h(
    "div",
    {
      "data-testid": `node-${node.id}`,
      "data-node-type": node.type,
      onPointerDown: editing ? (e) => e.stopPropagation() : onPointerDown,
      onClick,
      style: {
        position: "absolute",
        left: node.x,
        top: node.y,
        width: node.w,
        minHeight: node.h,
        boxSizing: "border-box",
        padding: "10px 12px",
        borderRadius: 10,
        cursor: editing ? "default" : "grab",
        background: TOKENS.bg,
        border: selected ? `2px solid ${meta.accent}` : `1px solid ${TOKENS.border}`,
        boxShadow: selected ? `0 0 0 3px ${meta.accent}22, 0 6px 18px rgba(0,0,0,.10)` : "0 1px 3px rgba(0,0,0,.06)",
        color: TOKENS.text,
        userSelect: "none"
      }
    },
    h(
      "div",
      { style: { display: "flex", alignItems: "center", gap: 6, marginBottom: 6 } },
      h("span", { style: { color: meta.accent, fontSize: 13 } }, meta.glyph),
      h("span", { style: { fontSize: 11, color: meta.accent, fontWeight: 600 } }, meta.label),
      h("span", { style: { flex: 1 } }),
      h(Badge, { status: node.status })
    ),
    editing ? h("input", {
      ref: inputRef,
      "data-testid": `input-rename-${node.id}`,
      value: editingText,
      onChange: (e) => onEditText(e.target.value),
      onKeyDown: (e) => {
        e.stopPropagation();
        if (e.key === "Enter") onCommitRename();
        if (e.key === "Escape") onCancelRename();
      },
      onBlur: onCommitRename,
      style: {
        width: "100%",
        fontSize: 13,
        fontWeight: 600,
        height: 26,
        boxSizing: "border-box",
        padding: "0 8px",
        borderRadius: 6,
        border: `1px solid ${TOKENS.border}`,
        background: TOKENS.bgSoft,
        color: TOKENS.text,
        outline: "none"
      }
    }) : h("div", {
      "data-testid": `node-title-${node.id}`,
      title: "\u53CC\u51FB\u91CD\u547D\u540D",
      onDoubleClick: (e) => {
        e.stopPropagation();
        onStartRename();
      },
      style: { fontSize: 13, fontWeight: 600, lineHeight: 1.35, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }
    }, node.title),
    errs || warns ? h(
      "div",
      { style: { marginTop: 6, fontSize: 10.5, display: "flex", gap: 8 } },
      errs ? h("span", { style: { color: "#dc2626" } }, `\u2715 ${errs}`) : null,
      warns ? h("span", { style: { color: "#d97706" } }, `! ${warns}`) : null
    ) : null
  );
}
function Inspector({ project, node, onClose, onSaved, onTransition, onCheck, onDelete, onDirtyChange, onRename, onSaveReady, toast }) {
  const [text, setText] = useState("");
  const [version, setVersion] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("content");
  const [events, setEvents] = useState([]);
  const savedTextRef = useRef("");
  const dirtyRef = useRef(false);
  const nodeRef = useRef(node);
  nodeRef.current = node;
  useEffect(() => {
    let alive = true;
    setText("");
    setDirty(false);
    setVersion(0);
    savedTextRef.current = "";
    setDirtySilent(false);
    if (!node) return void 0;
    api.getContent(project.id, node.id).then((r) => {
      if (!alive) return;
      setText(r.text || "");
      savedTextRef.current = r.text || "";
      setVersion(r.version || 0);
    }).catch((e) => toast({ kind: "error", text: "\u8BFB\u6B63\u6587\u5931\u8D25\uFF1A" + e.message }));
    api.tailEvents(project.id, 30).then((rows) => {
      if (alive) setEvents(rows.filter((e) => e.nodeId === node.id).slice(-12).reverse());
    }).catch(() => {
    });
    return () => {
      alive = false;
    };
  }, [node && node.id]);
  useEffect(() => {
    const cur = nodeRef.current;
    if (!cur || dirtyRef.current) return void 0;
    let alive = true;
    api.getContent(project.id, cur.id).then((r) => {
      if (!alive || dirtyRef.current) return;
      setText(r.text || "");
      savedTextRef.current = r.text || "";
      setVersion(r.version || 0);
    }).catch(() => {
    });
    return () => {
      alive = false;
    };
  }, [node && node.id, node && node.contentVersion, project.id]);
  useEffect(() => {
    onDirtyChange && onDirtyChange(dirty);
  }, [dirty]);
  useEffect(() => () => {
    onDirtyChange && onDirtyChange(false);
  }, []);
  const setDirtySilent = (val) => {
    dirtyRef.current = val;
    setDirty(val);
  };
  const save = useCallback(async () => {
    if (!node) return false;
    const before = savedTextRef.current;
    const after = text;
    setBusy(true);
    try {
      await api.saveContent(project.id, node.id, text, version);
      savedTextRef.current = after;
      setDirty(false);
      setDirtySilent(false);
      setVersion((v) => v + 1);
      toast({ kind: "success", text: "\u6B63\u6587\u5DF2\u4FDD\u5B58" });
      onSaved && onSaved(before, after);
      return true;
    } catch (e) {
      toast({ kind: "error", text: e.code === "E_CONFLICT" ? "\u7248\u672C\u51B2\u7A81\uFF1A\u8BF7\u5237\u65B0\u540E\u91CD\u8BD5" : "\u4FDD\u5B58\u5931\u8D25\uFF1A" + e.message });
      return false;
    } finally {
      setBusy(false);
    }
  }, [node, project.id, text, version, toast, onSaved]);
  useEffect(() => {
    if (onSaveReady) onSaveReady(save);
  }, [save, onSaveReady]);
  if (!node) return null;
  const meta = NODE_TYPES[node.type] || NODE_TYPES.settings;
  const findings = node.meta && node.meta.findings || [];
  const allowed = ALLOWED[node.status] || [];
  const header = h(
    "div",
    { style: { padding: "12px 14px", borderBottom: `1px solid ${TOKENS.border}`, display: "flex", alignItems: "center", gap: 8 } },
    h("span", { style: { color: meta.accent } }, meta.glyph),
    h("div", { style: { flex: 1, fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, node.title),
    h("button", {
      "data-testid": "btn-close-inspector",
      onClick: onClose,
      style: { border: 0, background: "transparent", cursor: "pointer", fontSize: 15, opacity: 0.6, color: "inherit" }
    }, "\xD7")
  );
  const tabs = h(
    "div",
    { style: { display: "flex", gap: 4, padding: "8px 12px 0" } },
    ["content", "meta", "events"].map((t) => h("button", {
      key: t,
      onClick: () => setTab(t),
      style: {
        border: 0,
        background: "transparent",
        cursor: "pointer",
        fontSize: 12,
        padding: "4px 8px",
        borderBottom: tab === t ? `2px solid ${meta.accent}` : "2px solid transparent",
        color: tab === t ? TOKENS.text : TOKENS.dim,
        opacity: tab === t ? 1 : 0.7
      }
    }, t === "content" ? "\u6B63\u6587" : t === "meta" ? "\u68C0\u67E5\u7ED3\u679C" : "\u4E8B\u4EF6"))
  );
  const contentTab = h(
    "div",
    { style: { display: "flex", flexDirection: "column", flex: 1, minHeight: 0, padding: "10px 14px" } },
    h(
      "div",
      { style: { display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" } },
      h(Button, { tone: "primary", onClick: save, disabled: busy || !dirty, "data-testid": "btn-save-content" }, busy ? "\u4FDD\u5B58\u4E2D\u2026" : dirty ? "\u4FDD\u5B58\u6B63\u6587" : "\u5DF2\u4FDD\u5B58"),
      h(Button, { onClick: () => onCheck && onCheck(node), "data-testid": "btn-check-run" }, "\u8DD1\u786E\u5B9A\u6027\u68C0\u67E5"),
      h("span", { style: { flex: 1 } }),
      h("span", { style: { fontSize: 11, opacity: 0.55, lineHeight: "28px" } }, `${text.length} \u5B57\u7B26 \xB7 v${version}`)
    ),
    h("textarea", {
      "data-testid": "textarea-content",
      value: text,
      onChange: (e) => {
        setText(e.target.value);
        setDirtySilent(true);
        setDirty(true);
      },
      placeholder: "\u5728\u8FD9\u91CC\u5199/\u6539\u6B63\u6587\uFF08Markdown\uFF09\u3002Agent \u4E5F\u53EF\u4EE5\u901A\u8FC7 moxi_node_write \u5199\u540C\u4E00\u4EFD\u5185\u5BB9\u3002",
      style: {
        flex: 1,
        minHeight: 220,
        resize: "none",
        padding: 12,
        borderRadius: 8,
        boxSizing: "border-box",
        fontSize: 12.5,
        lineHeight: 1.7,
        fontFamily: TOKENS.mono,
        color: TOKENS.text,
        background: TOKENS.bgSoft,
        border: `1px solid ${TOKENS.border}`,
        outline: "none"
      }
    }),
    allowed.length ? h(
      "div",
      { style: { display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" } },
      h("span", { style: { fontSize: 11, opacity: 0.6, lineHeight: "28px" } }, "\u72B6\u6001\u8FC1\u79FB\uFF1A"),
      allowed.map((to) => h(Button, {
        key: to,
        "data-testid": `btn-transition-${to}`,
        tone: to === "approved" ? "primary" : to === "rejected" ? "danger" : "default",
        onClick: () => onTransition(node, to)
      }, TRANSITION_LABEL[to] || to))
    ) : null,
    h(
      "div",
      { style: { display: "flex", gap: 6, marginTop: 8, alignItems: "center" } },
      h(Button, { tone: "ghost", onClick: () => onRename && onRename(node), "data-testid": "btn-rename-node" }, "\u91CD\u547D\u540D"),
      h("span", { style: { flex: 1 } }),
      h(Button, { tone: "danger", onClick: () => onDelete && onDelete(node), "data-testid": "btn-delete-node" }, "\u5220\u9664\u8282\u70B9")
    )
  );
  const metaTab = h(
    "div",
    { style: { flex: 1, overflow: "auto", padding: "10px 14px" } },
    findings.length === 0 ? h("div", { style: { fontSize: 12, opacity: 0.6 } }, "\u8FD8\u6CA1\u6709\u68C0\u67E5\u7ED3\u679C\u3002\u70B9\u300C\u8DD1\u786E\u5B9A\u6027\u68C0\u67E5\u300D\u3002") : h(
      "div",
      { style: { display: "grid", gap: 8 } },
      findings.map((f, i) => h(
        "div",
        {
          key: i,
          style: {
            padding: "8px 10px",
            borderRadius: 8,
            fontSize: 12,
            background: f.severity === "error" ? "#fef2f2" : f.severity === "warning" ? "#fffbeb" : TOKENS.bgSoft,
            border: `1px solid ${f.severity === "error" ? "#fecaca" : f.severity === "warning" ? "#fde68a" : TOKENS.border}`
          }
        },
        h("div", { style: { fontWeight: 600, marginBottom: 2 } }, `${f.code} \xB7 ${f.severity}`),
        h("div", null, f.message),
        f.evidence ? h("div", { style: { marginTop: 4, opacity: 0.7, fontFamily: TOKENS.mono, fontSize: 11 } }, f.evidence) : null
      ))
    ),
    h("div", { style: { marginTop: 14, fontSize: 11, opacity: 0.55 } }, `id: ${node.id} \xB7 type: ${node.type} \xB7 ref: ${JSON.stringify(node.ref || {})}`)
  );
  const eventsTab = h(
    "div",
    { style: { flex: 1, overflow: "auto", padding: "10px 14px", display: "grid", gap: 6 } },
    events.length === 0 ? h("div", { style: { fontSize: 12, opacity: 0.6 } }, "\u8BE5\u8282\u70B9\u6682\u65E0\u4E8B\u4EF6") : events.map((ev, i) => h(
      "div",
      { key: i, style: { fontSize: 11.5, fontFamily: TOKENS.mono, opacity: 0.85, padding: "5px 8px", borderRadius: 6, background: TOKENS.bgSoft } },
      `${fmtTs(ev.ts)} \xB7 ${ev.actor} \xB7 ${ev.op}`,
      ev.data && ev.data.from ? ` ${ev.data.from}\u2192${ev.data.to}` : ""
    ))
  );
  return h(
    "div",
    {
      "data-testid": "inspector",
      style: {
        width: 380,
        flex: "0 0 380px",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        borderLeft: `1px solid ${TOKENS.border}`,
        background: TOKENS.bg,
        color: TOKENS.text
      }
    },
    header,
    h(
      "div",
      { style: { padding: "8px 14px", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" } },
      h(Badge, { status: node.status }),
      h("span", { style: { fontSize: 11, opacity: 0.6 } }, meta.label),
      dirty ? h("span", { style: { fontSize: 11, color: "#d97706" } }, "\u25CF \u672A\u4FDD\u5B58") : null
    ),
    tabs,
    tab === "content" ? contentTab : tab === "meta" ? metaTab : eventsTab
  );
}
function GenerateModal({ project, onClose, onStarted, toast }) {
  const epCount = Number(project.episodeCount) || 0;
  const maxTo = epCount > 0 ? Math.min(30, epCount) : 30;
  const [from, setFrom] = useState("1");
  const [to, setTo] = useState(String(maxTo));
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [skipConcept, setSkipConcept] = useState(false);
  const [probing, setProbing] = useState(false);
  const [probe, setProbe] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    api.llmInfo().then((r) => {
      if (!alive) return;
      setInfo(r);
      setProvider(r.provider || "");
      const models2 = (r.models || []).filter((m) => m && m.id);
      setModel(models2[0] ? models2[0].id : "");
    }).catch((e) => toast({ kind: "error", text: "\u8BFB\u53D6\u6A21\u578B\u5217\u8868\u5931\u8D25\uFF1A" + e.message })).finally(() => {
      if (alive) setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);
  const models = (info && info.models ? info.models : []).filter((m) => m && m.id);
  const f = Number(from);
  const t = Number(to);
  const invalid = !Number.isFinite(f) || !Number.isFinite(t) || f < 1 || t > maxTo || t < f;
  const start = async () => {
    if (invalid) return;
    setBusy(true);
    try {
      const job = await api.startJob({
        projectId: project.id,
        from: f,
        to: t,
        provider: provider || void 0,
        model: model || void 0,
        skipConcept
      });
      toast({ kind: "success", text: `\u751F\u6210\u4EFB\u52A1\u5DF2\u542F\u52A8\uFF1A\u7B2C ${job.from}\u2013${job.to} \u96C6` });
      onStarted(job);
    } catch (e) {
      const hint = e.code === "E_JOB_RUNNING" ? "\u8BE5\u9879\u76EE\u5DF2\u6709\u4EFB\u52A1\u5728\u8DD1\uFF0C\u5148\u5230\u300C\u4EFB\u52A1\u300D\u91CC\u67E5\u770B/\u53D6\u6D88\u3002" : e.message;
      toast({ kind: "error", text: "\u542F\u52A8\u5931\u8D25\uFF1A" + hint });
      setBusy(false);
    }
  };
  const probeModel = async () => {
    setProbing(true);
    setProbe(null);
    try {
      const r = await api.llmProbe({ maxTokens: 24 });
      setProbe(r);
      toast({ kind: "success", text: `\u6A21\u578B\u63A2\u6D4B\u901A\u8FC7\uFF1A${r.provider}/${r.model} \xB7 ${r.ms}ms` });
    } catch (e) {
      setProbe({ error: e.message });
      toast({ kind: "error", text: "\u6A21\u578B\u63A2\u6D4B\u5931\u8D25\uFF1A" + e.message });
    } finally {
      setProbing(false);
    }
  };
  return h(
    Modal,
    {
      title: "\u751F\u6210\u5267\u672C",
      onClose: busy ? () => {
      } : onClose,
      width: 560,
      testid: "modal-generate",
      footer: [
        h(Button, { key: "c", onClick: onClose, disabled: busy, "data-testid": "btn-cancel-generate" }, "\u53D6\u6D88"),
        h(Button, { key: "s", tone: "primary", onClick: start, disabled: busy || invalid, "data-testid": "btn-start-job" }, busy ? "\u542F\u52A8\u4E2D\u2026" : "\u5F00\u59CB\u751F\u6210")
      ]
    },
    h(
      "div",
      { style: { display: "grid", gap: 12 } },
      h(
        "div",
        { style: { fontSize: 12, opacity: 0.7, lineHeight: 1.6 } },
        `\u9879\u76EE\u300C${project.title}\u300D \xB7 \u751F\u6210\u4F1A\u6309\u96C6\u8DD1\uFF1A\u8282\u62CD \u2192 \u5206\u573A \u2192 \u5267\u672C \u2192 \u786E\u5B9A\u6027\u68C0\u67E5 \u2192 \u8D28\u68C0/\u5408\u89C4\uFF0C\u5E76\u5728\u53F3\u4E0B\u62BD\u5C49\u5B9E\u65F6\u663E\u793A\u8FDB\u5EA6\u3002`
      ),
      epCount > 0 ? h(
        "div",
        { "data-testid": "gen-episode-confirmed", style: { fontSize: 11.5, padding: "7px 10px", borderRadius: 8, background: TOKENS.bgSoft, border: `1px solid ${TOKENS.border}`, lineHeight: 1.6 } },
        `\u5DF2\u786E\u8BA4\u96C6\u6570\uFF1A${epCount} \u96C6\uFF1B\u5355\u4EFB\u52A1\u751F\u6210\u8303\u56F4\u4E0A\u9650 ${maxTo} \u96C6\uFF08\u5E73\u53F0\u6807\u51C6\u4E0A\u9650 30 \u96C6\uFF09\u3002`
      ) : h(
        "div",
        { "data-testid": "gen-episode-unknown", style: { fontSize: 11.5, padding: "7px 10px", borderRadius: 8, background: "#fffbeb", border: "1px solid #fde68a", color: "#92400e", lineHeight: 1.6 } },
        h("div", { style: { fontWeight: 650, marginBottom: 2 } }, "\u96C6\u6570\u672A\u786E\u8BA4\uFF0C\u6309\u5E73\u53F0\u6807\u51C6 30 \u96C6\u5904\u7406"),
        h("div", null, "\u8BE5\u9879\u76EE\u5C1A\u672A\u786E\u8BA4\u96C6\u6570\uFF1A\u9ED8\u8BA4\u7ED3\u675F\u96C6 = 30\uFF08\u53EF\u5728\u4E0B\u65B9\u624B\u52A8\u8C03\u6574\uFF0C\u5355\u4EFB\u52A1\u4E0A\u9650 30 \u96C6\uFF09\u3002\u751F\u6210\u5B8C\u6210\u540E\u4EE5\u5B9E\u9645\u751F\u6210\u96C6\u6570\u4E3A\u51C6\u3002")
      ),
      h(
        "div",
        { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 } },
        h(
          Field,
          { label: "\u8D77\u59CB\u96C6", hint: "\u9ED8\u8BA4 1" },
          h(Input, { value: from, onChange: setFrom, type: "number", min: 1, max: maxTo, "data-testid": "gen-from", style: { width: "100%" } })
        ),
        h(
          Field,
          { label: `\u7ED3\u675F\u96C6\uFF08\u2264 ${maxTo}\uFF09`, hint: "\u4EFB\u52A1\u603B\u96C6\u6570 = \u7ED3\u675F \u2212 \u8D77\u59CB + 1" },
          h(Input, { value: to, onChange: setTo, type: "number", min: 1, max: maxTo, "data-testid": "gen-to", style: { width: "100%" } })
        )
      ),
      h(
        "div",
        { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 } },
        h(
          Field,
          { label: "\u6A21\u578B provider" },
          h(Select, {
            value: provider,
            onChange: setProvider,
            disabled: loading,
            "data-testid": "gen-provider",
            options: info && info.provider ? [{ value: info.provider, label: info.provider }] : [{ value: "", label: loading ? "\u8BFB\u53D6\u4E2D\u2026" : "\uFF08\u9ED8\u8BA4\uFF09" }],
            style: { width: "100%" }
          })
        ),
        h(
          Field,
          { label: "\u6A21\u578B" },
          h(Select, {
            value: model,
            onChange: setModel,
            disabled: loading,
            "data-testid": "gen-model",
            options: loading ? [{ value: "", label: "\u8BFB\u53D6\u4E2D\u2026" }] : models.length ? models.map((m) => ({ value: m.id, label: `${m.name || m.id}\uFF08${m.id}\uFF09` })) : [{ value: "", label: "\uFF08\u9ED8\u8BA4\uFF09" }],
            style: { width: "100%" }
          })
        )
      ),
      h(
        "div",
        { style: { display: "grid", gap: 4 } },
        h(Checkbox, {
          checked: skipConcept,
          onChange: setSkipConcept,
          "data-testid": "gen-skip-concept",
          label: "\u8DF3\u8FC7\u6982\u5FF5/\u8D44\u4EA7\uFF08\u8BBE\u5B9A\u96C6\u5DF2\u6709\u5185\u5BB9\u65F6\u66F4\u5FEB\uFF1B\u52FE\u9009\u540E\u76F4\u63A5\u751F\u6210\u5206\u96C6\uFF09"
        }),
        h(
          "div",
          { "data-testid": "gen-skip-hint", style: { fontSize: 11, opacity: 0.62, paddingLeft: 20, lineHeight: 1.6 } },
          "\u52FE\u9009\u540E\u679C\uFF1A\u4E0D\u4F1A\u751F\u6210\u8BBE\u5B9A\u96C6\u4E0E\u89D2\u8272\u8D44\u4EA7\uFF0C\u76F4\u63A5\u51FA\u5206\u96C6\uFF1B\u4E16\u754C\u89C2 / \u89D2\u8272\u8D44\u4EA7\u8282\u70B9\u4FDD\u6301\u539F\u6837\uFF08\u9002\u5408\u8BBE\u5B9A\u96C6\u5DF2\u5199\u597D\u7684\u9879\u76EE\uFF09\u3002"
        )
      ),
      h(
        "div",
        { style: { display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, background: TOKENS.bgSoft, border: `1px solid ${TOKENS.border}` } },
        h(Button, { onClick: probeModel, disabled: probing, "data-testid": "btn-probe" }, probing ? "\u63A2\u6D4B\u4E2D\u2026" : "\u6A21\u578B\u63A2\u6D4B"),
        h(
          "div",
          { style: { fontSize: 11.5, lineHeight: 1.5, opacity: 0.8, flex: 1 } },
          probing ? h("span", null, h(Spinner, { size: 10 }), " \u6B63\u5728\u8C03\u7528 /llm/probe\u2026") : probe ? probe.error ? h("span", { style: { color: "#dc2626" } }, `\u63A2\u6D4B\u5931\u8D25\uFF1A${probe.error}`) : h("span", null, `\u2713 ${probe.provider}/${probe.model} \xB7 ${probe.ms}ms \xB7 ${probe.chars} \u5B57\u7B26 \xB7 \u6837\u4F8B\u300C${String(probe.sample || "").slice(0, 20)}\u300D`) : "\u70B9\u51FB\u63A2\u6D4B\u5F53\u524D provider/model \u94FE\u8DEF\u662F\u5426\u53EF\u7528\uFF08\u4F1A\u771F\u5B9E\u8C03\u7528\u4E00\u6B21\u6A21\u578B\uFF09"
        )
      ),
      invalid ? h("div", { style: { fontSize: 11.5, color: "#dc2626" } }, `\u96C6\u6570\u8303\u56F4\u975E\u6CD5\uFF1A\u8981\u6C42 1 \u2264 \u8D77\u59CB \u2264 \u7ED3\u675F \u2264 ${maxTo}`) : null
    )
  );
}
function EpisodeRows({ job }) {
  const eps = job && job.episodes || [];
  if (!eps.length) return h("div", { style: { fontSize: 12, opacity: 0.6 } }, "\u6682\u65E0\u5206\u96C6\u8FDB\u5EA6");
  return h(
    "div",
    { style: { display: "grid", gap: 2 } },
    h("div", {
      style: { display: "grid", gridTemplateColumns: "46px 62px 58px 48px 46px 1fr", gap: 6, padding: "4px 6px", fontSize: 10.5, opacity: 0.55, borderBottom: `1px solid ${TOKENS.border}` }
    }, h("span", null, "\u96C6"), h("span", null, "\u9636\u6BB5"), h("span", null, "\u72B6\u6001"), h("span", null, "\u5B57\u6570"), h("span", null, "findings"), h("span", null, "\u9519\u8BEF")),
    ...eps.map((ep) => h(
      "div",
      {
        key: ep.ep,
        "data-testid": `job-ep-${ep.ep}`,
        style: { display: "grid", gridTemplateColumns: "46px 62px 58px 48px 46px 1fr", gap: 6, padding: "3px 6px", fontSize: 11.5, alignItems: "center", borderRadius: 5, background: ep.status === "running" ? "rgba(59,130,246,.08)" : "transparent" }
      },
      h("span", { style: { fontFamily: TOKENS.mono } }, `\u7B2C${ep.ep}\u96C6`),
      h("span", { style: { opacity: 0.8 } }, EP_STAGE_LABEL[ep.stage] || ep.stage || "\u2014"),
      h(EpBadge, { status: ep.status }),
      h("span", { style: { fontFamily: TOKENS.mono, opacity: 0.8 } }, String(ep.words || 0)),
      h("span", { style: { fontFamily: TOKENS.mono, opacity: ep.findings ? 0.9 : 0.5, color: ep.findings ? "#d97706" : "inherit" } }, String(ep.findings || 0)),
      h("span", { style: { opacity: 0.65, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, title: ep.error || "" }, ep.error || "")
    ))
  );
}
function JobLog({ log }) {
  const rows = (log || []).slice(-20);
  if (!rows.length) return h("div", { style: { fontSize: 11.5, opacity: 0.6 } }, "\u6682\u65E0\u65E5\u5FD7");
  const color = (level) => level === "error" ? "#dc2626" : level === "warn" ? "#d97706" : TOKENS.dim;
  return h(
    "div",
    { style: { display: "grid", gap: 2, maxHeight: 150, overflow: "auto", fontFamily: TOKENS.mono, fontSize: 10.5, lineHeight: 1.5 } },
    rows.map((row, i) => h(
      "div",
      { key: i, style: { display: "flex", gap: 6, whiteSpace: "nowrap" } },
      h("span", { style: { opacity: 0.5 } }, String(row.ts || "").slice(11, 19)),
      h("span", { style: { color: color(row.level), width: 34 } }, String(row.level || "info")),
      h("span", { style: { overflow: "hidden", textOverflow: "ellipsis" }, title: row.msg }, row.msg)
    ))
  );
}
function JobDrawer({ projectId, jobId, onClose, onJobChanged, toast, confirm }) {
  const [job, setJob] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const aliveRef = useRef(true);
  const fetchJob = useCallback(async (silent) => {
    try {
      const j = await api.getJob(jobId, projectId);
      if (!aliveRef.current) return;
      setJob(j);
      setErr("");
      onJobChanged && onJobChanged(j);
    } catch (e) {
      if (!aliveRef.current) return;
      if (!silent) {
        const msg = e.code === "E_NOT_FOUND" ? "\u4EFB\u52A1\u8BB0\u5F55\u4E0D\u5B58\u5728\uFF08\u53EF\u80FD\u5DF2\u88AB\u6E05\u7406\uFF09" : "\u8BFB\u53D6\u4EFB\u52A1\u5931\u8D25\uFF1A" + e.message;
        setErr(msg);
      }
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  }, [jobId, projectId, onJobChanged]);
  useEffect(() => {
    aliveRef.current = true;
    fetchJob(false);
    return () => {
      aliveRef.current = false;
    };
  }, [fetchJob]);
  const status = job && job.status;
  const terminal = isJobTerminal(job);
  useEffect(() => {
    if (!job || terminal) return void 0;
    const timer = window.setInterval(() => fetchJob(true), 1500);
    return () => window.clearInterval(timer);
  }, [status, terminal, fetchJob]);
  const cancel = async () => {
    const ok = await confirm({
      title: "\u53D6\u6D88\u751F\u6210\u4EFB\u52A1",
      message: `\u786E\u8BA4\u53D6\u6D88\u4EFB\u52A1 ${job.id}\uFF08\u7B2C ${job.from}\u2013${job.to} \u96C6\uFF09\uFF1F\u5DF2\u5B8C\u6210\u7684\u96C6\u4F1A\u4FDD\u7559\u3002`,
      detail: "\u53D6\u6D88\u540E\u53EF\u7528\u300C\u7EED\u8DD1\u300D\u4ECE\u7B2C\u4E00\u4E2A\u672A\u5B8C\u6210\u96C6\u7EE7\u7EED\u3002",
      danger: true,
      confirmText: "\u53D6\u6D88\u4EFB\u52A1",
      cancelText: "\u7EE7\u7EED\u8DD1"
    });
    if (!ok) return;
    setBusy(true);
    try {
      const j = await api.cancelJob(job.id);
      setJob(j);
      toast({ kind: "success", text: "\u5DF2\u8BF7\u6C42\u53D6\u6D88\u4EFB\u52A1" });
    } catch (e) {
      toast({ kind: "error", text: "\u53D6\u6D88\u5931\u8D25\uFF1A" + e.message });
    } finally {
      setBusy(false);
    }
  };
  const resume = async () => {
    setBusy(true);
    try {
      const j = await api.resumeJob(projectId, job.id);
      setJob(j);
      toast({ kind: "success", text: "\u5DF2\u8BF7\u6C42\u7EED\u8DD1\uFF08\u4ECE\u7B2C\u4E00\u4E2A\u672A\u5B8C\u6210\u96C6\u7EE7\u7EED\uFF09" });
    } catch (e) {
      toast({ kind: "error", text: "\u7EED\u8DD1\u5931\u8D25\uFF1A" + (e.code === "E_JOB_RUNNING" ? "\u4EFB\u52A1\u4ECD\u5728\u8FD0\u884C" : e.message) });
    } finally {
      setBusy(false);
    }
  };
  const [restoring, setRestoring] = useState(false);
  const restoreSnapshot = async () => {
    const ok = await confirm({
      title: "\u56DE\u9000\u5230\u751F\u6210\u524D\uFF1F",
      message: "\u4F1A\u628A\u753B\u5E03\u4E0E\u5168\u90E8\u6B63\u6587\u6062\u590D\u5230\u672C\u6B21\u751F\u6210\u5F00\u59CB\u524D\uFF0C\u5E76\u81EA\u52A8\u4E3A\u5F53\u524D\u72B6\u6001\u518D\u62CD\u4E00\u5F20\u5FEB\u7167\uFF08\u56DE\u9000\u672C\u8EAB\u4E5F\u53EF\u64A4\u9500\uFF09\u3002",
      detail: `\u5FEB\u7167\uFF1A${job.snapshotId}`,
      danger: true,
      confirmText: "\u56DE\u9000"
    });
    if (!ok) return;
    setRestoring(true);
    try {
      const r = await api.restoreSnapshot(projectId, job.snapshotId);
      toast({ kind: "success", text: `\u5DF2\u56DE\u9000\u5230\u751F\u6210\u524D\uFF08rev ${r.rev}\uFF09` });
      onJobChanged && onJobChanged(null);
      onClose && onClose();
    } catch (e) {
      toast({ kind: "error", text: "\u56DE\u9000\u5931\u8D25\uFF1A" + e.message });
    } finally {
      setRestoring(false);
    }
  };
  const progress = jobDone(job);
  const pctText = `${progress.done}/${progress.total}`;
  const canResume = terminal && ["cancelled", "failed", "done_with_errors"].includes(String(status));
  const failedEps = (job && job.episodes || []).filter((e) => e && e.status === "failed").map((e) => Number(e.ep)).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  const failedCount = progress.failed || failedEps.length;
  return h(
    Drawer,
    {
      title: h(
        "span",
        { style: { display: "inline-flex", alignItems: "center", gap: 8 } },
        h("span", { className: "moxi-serif" }, "\u521B\u4F5C\u8FDB\u5EA6"),
        job ? h(JobBadge, { status: job.status }) : null,
        job ? h("span", { style: { fontSize: 11, opacity: 0.6, fontFamily: TOKENS.mono } }, job.id) : null
      ),
      onClose,
      width: 540,
      testid: "drawer-job",
      footer: [
        job ? h(Button, {
          key: "cancel",
          tone: "danger",
          onClick: cancel,
          disabled: busy || terminal,
          "data-testid": "btn-job-cancel"
        }, busy ? "\u5904\u7406\u4E2D\u2026" : "\u53D6\u6D88\u4EFB\u52A1") : null,
        job && canResume ? h(Button, { key: "resume", tone: "primary", onClick: resume, disabled: busy, "data-testid": "btn-job-resume" }, "\u7EED\u8DD1") : null,
        h(Button, { key: "refresh", onClick: () => fetchJob(false), disabled: busy, "data-testid": "btn-job-refresh" }, "\u5237\u65B0"),
        h(Button, { key: "close", onClick: onClose, "data-testid": "btn-job-close" }, "\u5173\u95ED")
      ]
    },
    loading ? h("div", { style: { display: "flex", alignItems: "center", gap: 8, fontSize: 12 } }, h(Spinner), "\u52A0\u8F7D\u4EFB\u52A1\u2026") : err ? h("div", { style: { fontSize: 12.5, color: "#dc2626", lineHeight: 1.6 } }, err) : !job ? h("div", { style: { fontSize: 12 } }, "\u4EFB\u52A1\u4E0D\u5B58\u5728") : h(
      "div",
      { style: { display: "grid", gap: 12 } },
      h(
        "div",
        { style: { display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" } },
        h("div", { style: { fontSize: 13, fontWeight: 650, flex: 1 } }, job.projectTitle || "\u672A\u77E5\u9879\u76EE"),
        h("div", { style: { fontSize: 11.5, opacity: 0.65 } }, `\u7B2C ${job.from}\u2013${job.to} \u96C6 \xB7 ${job.provider}/${job.model}`)
      ),
      status === "done_with_errors" ? h(
        "div",
        {
          "data-testid": "drawer-job-alert",
          style: { padding: "9px 11px", borderRadius: 8, background: "#fef2f2", border: "1px solid #fca5a5", color: "#991b1b", fontSize: 12.5, lineHeight: 1.6 }
        },
        h("div", { style: { fontWeight: 700, marginBottom: 2 } }, `${failedCount} \u96C6\u5931\u8D25\uFF1A\u5BFC\u51FA\u524D\u8BF7\u5148\u7EED\u8DD1\u6216\u4FEE\u590D`),
        h(
          "div",
          { style: { fontSize: 11.5, opacity: 0.9 } },
          `\u5931\u8D25\u96C6\uFF1A${failedEps.length ? failedEps.map((n) => `\u7B2C ${n} \u96C6`).join("\u3001") : `${failedCount} \u96C6`}\u3002\u53EF\u70B9\u4E0B\u65B9\u300C\u7EED\u8DD1\u300D\u4ECE\u7B2C\u4E00\u4E2A\u672A\u5B8C\u6210\u96C6\u7EE7\u7EED\uFF1B\u672A\u4FEE\u590D\u524D\u5BFC\u51FA\u7684 docx \u4F1A\u7F3A\u8FD9\u4E9B\u96C6\u3002`
        )
      ) : status === "cancelled" ? h("div", {
        "data-testid": "drawer-job-cancelled-hint",
        style: { padding: "8px 11px", borderRadius: 8, background: TOKENS.bgSoft, border: `1px solid ${TOKENS.border}`, fontSize: 11.5, lineHeight: 1.6, opacity: 0.9 }
      }, "\u4EFB\u52A1\u5DF2\u53D6\u6D88\uFF1A\u5DF2\u5B8C\u6210\u7684\u96C6\u4FDD\u7559\uFF1B\u53EF\u70B9\u300C\u7EED\u8DD1\u300D\u4ECE\u7B2C\u4E00\u4E2A\u672A\u5B8C\u6210\u96C6\u7EE7\u7EED\uFF0C\u6216\u5173\u95ED\u62BD\u5C49\u7EE7\u7EED\u7F16\u8F91\u753B\u5E03\u3002") : null,
      h(
        "div",
        { style: { display: "grid", gap: 4 } },
        h(
          "div",
          { style: { display: "flex", fontSize: 11.5, opacity: 0.75, justifyContent: "space-between" } },
          h("span", null, `\u8FDB\u5EA6 ${pctText}${progress.failed ? ` \xB7 \u5931\u8D25 ${progress.failed}` : ""}`),
          h("span", null, progress.current ? `\u5F53\u524D\uFF1A\u7B2C ${progress.current} \u96C6` : terminal ? "\u5DF2\u7ED3\u675F" : "\u7B49\u5F85\u4E2D")
        ),
        h(ProgressBar, { done: progress.done, total: progress.total, failed: progress.failed })
      ),
      h(
        "div",
        { style: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, fontSize: 11.5 } },
        h(
          "div",
          { style: { padding: "7px 9px", borderRadius: 8, background: TOKENS.bgSoft, border: `1px solid ${TOKENS.border}` } },
          h("div", { style: { opacity: 0.6, marginBottom: 2 } }, "\u72B6\u6001"),
          h(JobBadge, { status: job.status })
        ),
        h(
          "div",
          { style: { padding: "7px 9px", borderRadius: 8, background: TOKENS.bgSoft, border: `1px solid ${TOKENS.border}` } },
          h("div", { style: { opacity: 0.6, marginBottom: 2 } }, "\u6A21\u578B\u7528\u91CF"),
          h("div", { style: { fontFamily: TOKENS.mono } }, `calls ${job.usage ? job.usage.calls : 0} \xB7 in ${job.usage ? job.usage.inputTokens : 0} \xB7 out ${job.usage ? job.usage.outputTokens : 0}`)
        ),
        h(
          "div",
          { style: { padding: "7px 9px", borderRadius: 8, background: TOKENS.bgSoft, border: `1px solid ${TOKENS.border}` } },
          h("div", { style: { opacity: 0.6, marginBottom: 2 } }, "\u65F6\u95F4"),
          h("div", { style: { fontFamily: TOKENS.mono } }, `${fmtTs(job.createdAt)} \u2192 ${fmtTs(job.finishedAt)}`)
        )
      ),
      h(
        "div",
        null,
        h(SectionTitle, null, "\u5206\u96C6\u8FDB\u5EA6"),
        h(EpisodeRows, { job })
      ),
      job.snapshotId ? h(
        "div",
        {
          style: { padding: "9px 11px", borderRadius: 8, background: TOKENS.bgSoft, border: `1px solid ${TOKENS.border}`, fontSize: 11.5, lineHeight: 1.7 }
        },
        h(
          "div",
          { style: { display: "flex", alignItems: "center", gap: 8 } },
          h("span", { className: "moxi-stamp" }, "\u751F\u6210\u524D\u5FEB\u7167"),
          h("span", { style: { flex: 1, opacity: 0.75, fontFamily: TOKENS.mono, overflow: "hidden", textOverflow: "ellipsis" } }, job.snapshotId)
        ),
        h(
          "div",
          { style: { marginTop: 6, display: "flex", alignItems: "center", gap: 8 } },
          h("span", { style: { flex: 1, opacity: 0.62 } }, "\u4E0D\u6EE1\u610F\u53EF\u4EE5\u4E00\u952E\u56DE\u5230\u751F\u6210\u524D\u7684\u753B\u5E03\u3002"),
          h(Button, { onClick: restoreSnapshot, disabled: restoring, "data-testid": "btn-snapshot-restore" }, restoring ? "\u56DE\u9000\u4E2D\u2026" : "\u56DE\u9000\u5230\u751F\u6210\u524D")
        )
      ) : null,
      h(
        "div",
        null,
        h(SectionTitle, null, "\u6700\u8FD1\u65E5\u5FD7"),
        h(JobLog, { log: job.log })
      )
    )
  );
}
function ShootabilityDrawer({ project, onClose, toast, confirm }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyEp, setBusyEp] = useState(null);
  const [signEp, setSignEp] = useState(null);
  const [notes, setNotes] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.shootability(project.id, "json");
      setReport(r);
    } catch (e) {
      toast({ kind: "error", text: "\u53EF\u62CD\u6027\u62A5\u544A\u5931\u8D25\uFF1A" + e.message });
    } finally {
      setLoading(false);
    }
  }, [project.id, toast]);
  useEffect(() => {
    load();
  }, [load]);
  const doSign = async () => {
    if (!signEp) return;
    setBusyEp(signEp.episode);
    try {
      await api.signoff(project.id, signEp.episode, "sign", notes);
      toast({ kind: "success", text: `\u7B2C ${signEp.episode} \u96C6\u5DF2\u7B7E\u6536` });
      setSignEp(null);
      setNotes("");
      await load();
    } catch (e) {
      toast({ kind: "error", text: "\u7B7E\u6536\u5931\u8D25\uFF1A" + e.message });
    } finally {
      setBusyEp(null);
    }
  };
  const revoke = async (ep) => {
    const ok = await confirm({
      title: "\u64A4\u56DE\u7B7E\u6536",
      message: `\u64A4\u56DE\u7B2C ${ep.episode} \u96C6\u7684\u7B7E\u6536\u8BB0\u5F55\uFF1F`,
      confirmText: "\u64A4\u56DE",
      cancelText: "\u4FDD\u7559"
    });
    if (!ok) return;
    setBusyEp(ep.episode);
    try {
      await api.signoff(project.id, ep.episode, "revoke");
      toast({ kind: "success", text: `\u7B2C ${ep.episode} \u96C6\u7B7E\u6536\u5DF2\u64A4\u56DE` });
      await load();
    } catch (e) {
      toast({ kind: "error", text: "\u64A4\u56DE\u5931\u8D25\uFF1A" + e.message });
    } finally {
      setBusyEp(null);
    }
  };
  const download = async () => {
    try {
      const r = await api.shootability(project.id, "md");
      const blob = new Blob([r.markdown || ""], { type: "text/markdown;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${project.title}-\u53EF\u62CD\u6027\u62A5\u544A.md`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4e3);
      toast({ kind: "success", text: "\u53EF\u62CD\u6027\u62A5\u544A\u5DF2\u4E0B\u8F7D" });
    } catch (e) {
      toast({ kind: "error", text: "\u4E0B\u8F7D\u5931\u8D25\uFF1A" + e.message });
    }
  };
  const s = report ? report.summary : null;
  const card = (label, value, hint) => h(
    "div",
    {
      style: { padding: "9px 11px", borderRadius: 8, background: TOKENS.bgSoft, border: `1px solid ${TOKENS.border}` }
    },
    h("div", { style: { fontSize: 11, opacity: 0.6, marginBottom: 2 } }, label),
    h("div", { className: "moxi-serif", style: { fontSize: 19, fontWeight: 600 } }, value),
    hint ? h("div", { style: { fontSize: 10.5, opacity: 0.55 } }, hint) : null
  );
  return h(
    Drawer,
    {
      title: h(
        "span",
        { style: { display: "inline-flex", alignItems: "center", gap: 8 } },
        h("span", { className: "moxi-serif" }, "\u53EF\u62CD\u6027\u62A5\u544A"),
        h("span", { className: "moxi-stamp" }, "\u5B9E\u9A8C")
      ),
      onClose,
      width: 760,
      testid: "drawer-shootability",
      footer: [
        h(Button, { key: "d", onClick: download, "data-testid": "btn-shootability-download" }, "\u4E0B\u8F7D\u62A5\u544A md"),
        h(Button, { key: "r", onClick: load, disabled: loading, "data-testid": "btn-shootability-refresh" }, loading ? "\u5237\u65B0\u4E2D\u2026" : "\u5237\u65B0"),
        h(Button, { key: "c", tone: "primary", onClick: onClose }, "\u5173\u95ED")
      ]
    },
    loading && !report ? h("div", { style: { display: "flex", alignItems: "center", gap: 8, fontSize: 12 } }, h(Spinner), "\u6B63\u5728\u4F30\u7B97\u2026") : !report ? h("div", { style: { fontSize: 12 } }, "\u6682\u65E0\u6570\u636E") : h(
      "div",
      { style: { display: "grid", gap: 12 } },
      h(
        "div",
        { style: { display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 } },
        card("\u96C6\u6570", s.episodes),
        card("\u5E73\u5747\u4F30\u7B97", `${s.avgDurationSeconds}s`, `\u76EE\u6807 ${report.project.episodeSeconds}s`),
        card("\u7F3A\u94A9\u5B50", s.hooksMissing),
        card("\u964C\u751F\u89D2\u8272", s.unknownSpeakerEpisodes, "\u5BF9\u767D\u4EBA\u7269\u4E0D\u5728\u8BBE\u5B9A\u96C6"),
        card("\u5DF2\u7B7E\u6536", `${s.signedOff}/${s.episodes}`, s.staleSignoffs ? `\u5931\u6548 ${s.staleSignoffs}` : "\u9010\u96C6\u4EBA\u5DE5\u7B7E\u6536")
      ),
      h(
        "div",
        { style: { fontSize: 11.5, opacity: 0.65, lineHeight: 1.7 } },
        "\u65F6\u957F\u6309\u5BF9\u767D\u5B57\u6570\uFF08\u7EA6 4.6 \u5B57/\u79D2\uFF09\u4E0E\u52A8\u4F5C\u884C\u63A8\u7B97\uFF0C\xB125% \u5BB9\u5DEE\uFF1B\u94A9\u5B50\u4E3A\u6587\u672C\u7279\u5F81\u68C0\u6D4B\u3002\u4E24\u8005\u90FD\u53EA\u662F\u5BA1\u8BFB\u8F85\u52A9\uFF0C\u4E0D\u66FF\u4EE3\u4F60\u7684\u5224\u65AD\u3002"
      ),
      h(
        "div",
        { style: { overflow: "auto", maxHeight: 420, border: `1px solid ${TOKENS.border}`, borderRadius: 8 } },
        h(
          "table",
          { style: { width: "100%", borderCollapse: "collapse", fontSize: 12 } },
          h("thead", null, h(
            "tr",
            null,
            ["\u96C6", "\u573A\u6B21", "\u4F30\u7B97", "\u89D2\u8272", "\u94A9\u5B50", "\u7B7E\u6536", "\u64CD\u4F5C"].map((t) => h("th", {
              key: t,
              style: { textAlign: "left", padding: "7px 8px", borderBottom: `1px solid ${TOKENS.border}`, fontSize: 11, opacity: 0.7, position: "sticky", top: 0, background: TOKENS.bg }
            }, t))
          )),
          h("tbody", null, report.episodes.map((e) => h(
            "tr",
            { key: e.episode, "data-testid": `shoot-row-${e.episode}` },
            h("td", { style: { padding: "6px 8px", borderBottom: `1px solid ${TOKENS.border}` } }, `\u7B2C ${e.episode} \u96C6`),
            h("td", { style: { padding: "6px 8px", borderBottom: `1px solid ${TOKENS.border}` } }, e.scenes),
            h("td", { style: { padding: "6px 8px", borderBottom: `1px solid ${TOKENS.border}` } }, `${e.durationSeconds}s`),
            h(
              "td",
              { style: { padding: "6px 8px", borderBottom: `1px solid ${TOKENS.border}`, maxWidth: 180 } },
              e.speakers.length ? e.speakers.slice(0, 4).join("\u3001") : "\u2014",
              e.unknownSpeakers.length ? h("span", { style: { color: "#b45309" }, title: `\u4E0D\u5728\u8BBE\u5B9A\u96C6\uFF1A${e.unknownSpeakers.join("\u3001")}` }, ` \u26A0${e.unknownSpeakers.length}`) : null
            ),
            h("td", { style: { padding: "6px 8px", borderBottom: `1px solid ${TOKENS.border}` } }, e.hook.has ? "\u6709" : h("span", { style: { color: "#b45309" } }, "\u7F3A")),
            h(
              "td",
              { style: { padding: "6px 8px", borderBottom: `1px solid ${TOKENS.border}` } },
              e.signoff ? e.signoff.stale ? h("span", { style: { color: "#b45309" } }, "\u5DF2\u7B7E\u6536\uFF08\u6539\u7A3F\u5931\u6548\uFF09") : `\u5DF2\u7B7E\u6536 ${String(e.signoff.at || "").slice(5, 16)}` : "\u672A\u7B7E\u6536"
            ),
            h(
              "td",
              { style: { padding: "6px 8px", borderBottom: `1px solid ${TOKENS.border}`, whiteSpace: "nowrap" } },
              e.signoff ? h(Button, { onClick: () => revoke(e), disabled: busyEp === e.episode, title: "\u64A4\u56DE\u7B7E\u6536" }, "\u64A4\u56DE") : h(Button, { onClick: () => {
                setSignEp(e);
                setNotes("");
              }, disabled: busyEp === e.episode, title: "\u6211\u8BFB\u8FC7\u8FD9\u4E00\u96C6\uFF0C\u7B7E\u5B57" }, "\u7B7E\u6536")
            )
          )))
        )
      ),
      h(
        "div",
        { style: { fontSize: 11, opacity: 0.55 } },
        `\u95EE\u9898\u9879 ${s.issueCount} \u4E2A\uFF1B\u89D2\u8272\u51FA\u573A\u5206\u5E03\uFF1A` + Object.entries(report.presence || {}).map(([k, v]) => `${k}(${v.length}\u96C6)`).join(" \xB7 ").slice(0, 160)
      ),
      signEp ? h(
        Modal,
        {
          title: `\u7B7E\u6536\u7B2C ${signEp.episode} \u96C6`,
          onClose: () => setSignEp(null),
          width: 460,
          testid: "modal-signoff",
          footer: [
            h(Button, { key: "c", onClick: () => setSignEp(null) }, "\u53D6\u6D88"),
            h(Button, { key: "s", tone: "primary", onClick: doSign, disabled: busyEp === signEp.episode, "data-testid": "btn-confirm-signoff" }, busyEp === signEp.episode ? "\u7B7E\u6536\u4E2D\u2026" : "\u786E\u8BA4\u7B7E\u6536")
          ]
        },
        h(
          "div",
          { style: { fontSize: 12.5, lineHeight: 1.7, marginBottom: 10 } },
          "\u7B7E\u6536\u8868\u793A\u4F60\u5DF2\u901A\u8BFB\u8FD9\u4E00\u96C6\uFF0C\u8BA4\u53EF\u5267\u60C5\u3001\u4EBA\u7269\u4E0E\u5408\u89C4\uFF1B\u7B7E\u6536\u7ED1\u5B9A\u5F53\u524D\u7A3F\u4EF6\u7248\u672C\uFF0C\u4E4B\u540E\u6539\u7A3F\u4F1A\u81EA\u52A8\u5931\u6548\u3002"
        ),
        h(
          "div",
          { style: { display: "grid", gap: 6 } },
          h("div", { style: { fontSize: 11, opacity: 0.65 } }, `\u5907\u6CE8\uFF08\u53EF\u9009\uFF0C\u2264200 \u5B57\uFF09`),
          h("textarea", {
            value: notes,
            maxLength: 200,
            onChange: (ev) => setNotes(ev.target.value),
            placeholder: "\u4F8B\u5982\uFF1A\u7B2C 3 \u573A\u8282\u594F\u504F\u6162\uFF0C\u5DF2\u8BA9\u7F16\u5267\u6539\uFF1B\u6574\u4F53\u53EF\u62CD\u3002",
            "data-testid": "input-signoff-notes",
            style: { width: "100%", minHeight: 70, padding: "8px 10px", borderRadius: 8, border: `1px solid ${TOKENS.border}`, background: TOKENS.bg, color: TOKENS.text, fontSize: 12, resize: "vertical", boxSizing: "border-box" }
          })
        )
      ) : null
    )
  );
}
function JobListModal({ project, onClose, onOpenJob, toast, confirm }) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await api.listJobs(project.id);
      setJobs(Array.isArray(rows) ? rows : []);
    } catch (e) {
      toast({ kind: "error", text: "\u8BFB\u53D6\u4EFB\u52A1\u5217\u8868\u5931\u8D25\uFF1A" + e.message });
    } finally {
      setLoading(false);
    }
  }, [project.id]);
  useEffect(() => {
    load();
  }, [load]);
  const cancel = async (job) => {
    const ok = await confirm({
      title: "\u53D6\u6D88\u751F\u6210\u4EFB\u52A1",
      message: `\u786E\u8BA4\u53D6\u6D88\u4EFB\u52A1 ${job.id}\uFF08\u7B2C ${job.from}\u2013${job.to} \u96C6\uFF09\uFF1F\u5DF2\u5B8C\u6210\u7684\u96C6\u4FDD\u7559\u3002`,
      danger: true,
      confirmText: "\u53D6\u6D88\u4EFB\u52A1",
      cancelText: "\u7EE7\u7EED\u8DD1"
    });
    if (!ok) return;
    setBusyId(job.id);
    try {
      await api.cancelJob(job.id);
      toast({ kind: "success", text: "\u5DF2\u8BF7\u6C42\u53D6\u6D88\u4EFB\u52A1" });
      await load();
    } catch (e) {
      toast({ kind: "error", text: "\u53D6\u6D88\u5931\u8D25\uFF1A" + e.message });
    } finally {
      setBusyId("");
    }
  };
  const resume = async (job) => {
    setBusyId(job.id);
    try {
      await api.resumeJob(project.id, job.id);
      toast({ kind: "success", text: "\u5DF2\u8BF7\u6C42\u7EED\u8DD1" });
      await load();
    } catch (e) {
      toast({ kind: "error", text: "\u7EED\u8DD1\u5931\u8D25\uFF1A" + e.message });
    } finally {
      setBusyId("");
    }
  };
  return h(
    Modal,
    {
      title: "\u751F\u6210\u4EFB\u52A1",
      onClose,
      width: 760,
      testid: "modal-jobs",
      footer: [
        h(Button, { key: "r", onClick: load, "data-testid": "btn-jobs-refresh" }, "\u5237\u65B0"),
        h(Button, { key: "c", onClick: onClose }, "\u5173\u95ED")
      ]
    },
    loading ? h("div", { style: { display: "flex", gap: 8, alignItems: "center", fontSize: 12 } }, h(Spinner), "\u52A0\u8F7D\u4EFB\u52A1\u2026") : jobs.length === 0 ? h("div", { style: { fontSize: 12, opacity: 0.65, padding: "12px 4px" } }, "\u8BE5\u9879\u76EE\u8FD8\u6CA1\u6709\u751F\u6210\u4EFB\u52A1\u3002\u70B9\u5DE5\u5177\u680F\u300C\u751F\u6210\u300D\u542F\u52A8\u4E00\u4E2A\u3002") : h(
      "div",
      { style: { display: "grid", gap: 6 } },
      jobs.map((job) => {
        const p = jobDone(job);
        const terminal = isJobTerminal(job);
        return h(
          "div",
          {
            key: job.id,
            "data-testid": `job-row-${job.id}`,
            style: { display: "grid", gridTemplateColumns: "1fr 110px 90px 120px 170px", gap: 8, alignItems: "center", padding: "8px 10px", borderRadius: 8, border: `1px solid ${TOKENS.border}`, background: TOKENS.bgSoft, fontSize: 11.5 }
          },
          h(
            "div",
            null,
            h("div", { style: { fontFamily: TOKENS.mono, fontSize: 11 } }, job.id),
            h("div", { style: { opacity: 0.65 } }, `\u7B2C ${job.from}\u2013${job.to} \u96C6 \xB7 ${job.provider}/${job.model}`)
          ),
          h(JobBadge, { status: job.status }),
          h("div", { style: { fontFamily: TOKENS.mono } }, `${p.done}/${p.total}${p.failed ? ` \xB7 \u2715${p.failed}` : ""}`),
          h("div", { style: { opacity: 0.65, fontFamily: TOKENS.mono } }, fmtTs(job.createdAt)),
          h(
            "div",
            { style: { display: "flex", gap: 4, justifyContent: "flex-end" } },
            h(Button, { "data-testid": `btn-view-job-${job.id}`, onClick: () => onOpenJob(job) }, "\u67E5\u770B"),
            !terminal ? h(Button, { "data-testid": `btn-list-cancel-${job.id}`, tone: "danger", disabled: busyId === job.id, onClick: () => cancel(job) }, "\u53D6\u6D88") : null,
            terminal && ["cancelled", "failed", "done_with_errors"].includes(String(job.status)) ? h(Button, { "data-testid": `btn-list-resume-${job.id}`, disabled: busyId === job.id, onClick: () => resume(job) }, "\u7EED\u8DD1") : null
          )
        );
      })
    )
  );
}
function ImportModal({ project, canvas, onClose, onImported, toast }) {
  const [phase, setPhase] = useState("pick");
  const [source, setSource] = useState(null);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [fileMode, setFileMode] = useState("dir");
  const dirInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const pickerSupported = typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
  const reset = () => {
    setPhase("pick");
    setSource(null);
    setError("");
    setWarnings([]);
    setProgress({ done: 0, total: 0 });
  };
  const readFromFiles = async (files) => {
    setError("");
    const list = Array.from(files || []);
    if (!list.length) return;
    const norm = (f) => String(f.webkitRelativePath || f.name || "");
    const byPath = new Map(list.map((f) => [norm(f), f]));
    const findOne = (name) => {
      const hit = [...byPath.entries()].filter(([p]) => baseName(p) === name).sort((a, b) => a[0].length - b[0].length)[0];
      return hit ? hit[1] : null;
    };
    const projectFile = findOne("project.json");
    const canvasFile = findOne("canvas.json");
    if (!projectFile || !canvasFile) {
      setError("\u8BE5\u76EE\u5F55\u4E0D\u662F v2 \u9879\u76EE\u5DE5\u4F5C\u533A\uFF1A\u7F3A\u5C11 project.json \u6216 canvas.json\u3002");
      return;
    }
    try {
      const projectJson = JSON.parse(await projectFile.text());
      const canvasJson = JSON.parse(await canvasFile.text());
      if (!canvasJson || !Array.isArray(canvasJson.nodes)) {
        setError("canvas.json \u7ED3\u6784\u4E0D\u5408\u6CD5\uFF1A\u7F3A\u5C11 nodes \u6570\u7EC4\u3002");
        return;
      }
      const contentByName = /* @__PURE__ */ new Map();
      for (const f of list) {
        const name = baseName(norm(f));
        if (!name.endsWith(".md")) continue;
        contentByName.set(name, await f.text());
      }
      const contents = /* @__PURE__ */ new Map();
      for (const node of canvasJson.nodes) {
        const fileName = baseName(node && node.contentFile);
        const text = fileName && contentByName.get(fileName) || contentByName.get(`${node && node.id}.md`) || "";
        if (text) contents.set(node.id, text);
      }
      buildPreview(projectJson, canvasJson, contents, list);
    } catch (e) {
      setError("\u89E3\u6790\u5931\u8D25\uFF1A" + e.message);
    }
  };
  const readFromPicker = async () => {
    setError("");
    try {
      const dir = await window.showDirectoryPicker({ mode: "read" });
      const all = [];
      const walk = async (handle, prefix) => {
        for await (const entry of handle.values()) {
          const path = prefix ? `${prefix}/${entry.name}` : entry.name;
          if (entry.kind === "directory") await walk(entry, path);
          else all.push(await entry.getFile());
        }
      };
      await walk(dir, "");
      await readFromFiles(all);
    } catch (e) {
      if (e && (e.name === "AbortError" || e.name === "NotAllowedError")) {
        setError("\u5DF2\u53D6\u6D88\u76EE\u5F55\u9009\u62E9\u3002\u4E5F\u53EF\u4EE5\u70B9\u300C\u6539\u7528\u9010\u4E2A\u9009\u6587\u4EF6\u300D\u3002");
        return;
      }
      setError("\u76EE\u5F55\u9009\u62E9\u5931\u8D25\uFF1A" + (e && e.message ? e.message : String(e)) + "\u3002\u53EF\u6539\u7528\u300C\u9010\u4E2A\u9009\u6587\u4EF6\u300D\u3002");
    }
  };
  const buildPreview = (projectJson, canvasJson, contents, files) => {
    const warnings2 = [];
    const nodes = canvasJson.nodes.filter((n) => {
      if (!n || typeof n !== "object" || !n.id || !n.type) {
        warnings2.push("\u8DF3\u8FC7 1 \u4E2A\u7F3A\u5C11 id/type \u7684\u8282\u70B9");
        return false;
      }
      if (!NODE_TYPES[n.type]) {
        warnings2.push(`\u8DF3\u8FC7\u672A\u77E5\u7C7B\u578B\u8282\u70B9\u300C${n.title || n.id}\u300D\uFF08type=${n.type}\uFF09`);
        return false;
      }
      return true;
    });
    const edges = Array.isArray(canvasJson.edges) ? canvasJson.edges.filter((e) => e && e.from && e.to) : [];
    const expected = nodes.filter((n) => n.contentFile).length;
    const withContent = nodes.filter((n) => contents.has(n.id)).length;
    let chars = 0;
    for (const text of contents.values()) chars += text.length;
    if (nodes.length !== canvasJson.nodes.length) warnings2.push(`\u5171 ${canvasJson.nodes.length - nodes.length} \u4E2A\u8282\u70B9\u56E0\u7ED3\u6784\u4E0D\u5408\u6CD5\u88AB\u8DF3\u8FC7`);
    if (expected > withContent) warnings2.push(`\u6709 ${expected - withContent} \u4E2A\u8282\u70B9\u6807\u4E86 contentFile \u4F46\u76EE\u5F55\u91CC\u6CA1\u627E\u5230\u5BF9\u5E94 .md`);
    const byType = {};
    for (const n of nodes) byType[n.type] = (byType[n.type] || 0) + 1;
    setSource({
      projectJson: projectJson || {},
      canvasJson: { nodes, edges, viewport: canvasJson.viewport || null },
      contents,
      files: files.map((f) => String(f.webkitRelativePath || f.name || "")),
      stats: { nodes: nodes.length, edges: edges.length, withContent, chars, byType }
    });
    setWarnings(warnings2);
    setPhase("preview");
  };
  const doImport = async () => {
    if (!source) return;
    const existing = new Set((canvas.nodes || []).map((n) => n.id));
    const idMap = /* @__PURE__ */ new Map();
    const ops = [];
    for (const node of source.canvasJson.nodes) {
      let id = node.id;
      if (existing.has(id)) id = randId("n_imp");
      existing.add(id);
      idMap.set(node.id, id);
      const nodePayload = {
        id,
        type: node.type,
        title: String(node.title || ""),
        x: Number(node.x) || 0,
        y: Number(node.y) || 0,
        w: Number(node.w) || 280,
        h: Number(node.h) || 150,
        ref: node.ref || { episode: null, scene: null },
        meta: node.meta || {}
      };
      const text = source.contents.get(node.id) || "";
      ops.push({ op: "node.create", node: nodePayload, text });
    }
    for (const edge of source.canvasJson.edges) {
      const from = idMap.get(edge.from);
      const to = idMap.get(edge.to);
      if (!from || !to) continue;
      ops.push({ op: "edge.create", from, to, kind: edge.kind === "context" ? "context" : "dependency" });
    }
    if (source.canvasJson.viewport && !(canvas.nodes || []).length) {
      ops.push({ op: "viewport.set", viewport: source.canvasJson.viewport });
    }
    if (!ops.length) {
      setError("\u6CA1\u6709\u53EF\u5BFC\u5165\u7684\u5185\u5BB9\u3002");
      return;
    }
    setPhase("importing");
    setProgress({ done: 0, total: ops.length });
    try {
      for (let i = 0; i < ops.length; i += 50) {
        const chunk = ops.slice(i, i + 50);
        await api.apply(project.id, chunk, { idempotencyKey: newIdemKey("import") });
        setProgress({ done: Math.min(ops.length, i + chunk.length), total: ops.length });
      }
      toast({ kind: "success", text: `\u5BFC\u5165\u5B8C\u6210\uFF1A${source.stats.nodes} \u8282\u70B9 / ${source.stats.edges} \u8FDE\u7EBF / ${source.stats.chars} \u5B57\u7B26` });
      onImported && onImported();
    } catch (e) {
      setPhase("preview");
      setError(`\u5BFC\u5165\u7B2C ${Math.floor(progress.done / 50) + 1} \u6279\u5931\u8D25\uFF08\u5DF2\u5199\u5165\u7684\u90E8\u5206\u4FDD\u7559\uFF09\uFF1A${e.message}`);
    }
  };
  const footer = phase === "pick" ? [h(Button, { key: "c", onClick: onClose }, "\u53D6\u6D88")] : phase === "preview" ? [
    h(Button, { key: "b", onClick: reset }, "\u91CD\u65B0\u9009\u62E9"),
    h(Button, { key: "c", onClick: onClose }, "\u53D6\u6D88"),
    h(Button, { key: "ok", tone: "primary", onClick: doImport, "data-testid": "btn-import-confirm" }, "\u786E\u8BA4\u5BFC\u5165")
  ] : [h(Button, { key: "c", onClick: () => {
  }, disabled: true }, "\u5BFC\u5165\u4E2D\u2026")];
  const statsCards = source ? [["\u8282\u70B9", source.stats.nodes], ["\u8FDE\u7EBF", source.stats.edges], ["\u6709\u6B63\u6587", source.stats.withContent], ["\u6B63\u6587\u5B57\u7B26", source.stats.chars]].map(([label, value]) => h(
    "div",
    { key: label, style: { padding: "8px 10px", borderRadius: 8, background: TOKENS.bgSoft, border: `1px solid ${TOKENS.border}` } },
    h("div", { style: { fontSize: 10.5, opacity: 0.6 } }, label),
    h("div", { style: { fontSize: 15, fontWeight: 650, fontFamily: TOKENS.mono } }, String(value))
  )) : [];
  return h(
    Modal,
    {
      title: "\u5BFC\u5165\u672C\u5730\u9879\u76EE\u5DE5\u4F5C\u533A",
      onClose: phase === "importing" ? () => {
      } : onClose,
      width: 640,
      testid: "modal-import",
      footer
    },
    phase === "pick" ? h(
      "div",
      { style: { display: "grid", gap: 12 } },
      h(
        "div",
        { style: { fontSize: 12.5, lineHeight: 1.65, opacity: 0.85 } },
        `\u628A\u672C\u5730 v2 \u5DE5\u4F5C\u533A\uFF08project.json + canvas.json + content/*.md\uFF09\u5BFC\u5165\u5230\u5F53\u524D\u9879\u76EE\u300C${project.title}\u300D\u3002`,
        "\u5BFC\u5165\u4F1A\u6309 \u226450 \u4E2A\u64CD\u4F5C/\u6279\u8D70 /canvas/apply\uFF0C\u5206\u6279\u5199\u5165\uFF1B\u540C id \u8282\u70B9\u4F1A\u81EA\u52A8\u6539\u540D\u907F\u514D\u51B2\u7A81\u3002"
      ),
      h(
        "div",
        { style: { display: "flex", gap: 8, flexWrap: "wrap" } },
        pickerSupported ? h(Button, { tone: "primary", onClick: readFromPicker, "data-testid": "btn-choose-dir" }, "\u9009\u62E9\u76EE\u5F55\uFF08\u7CFB\u7EDF\u5BF9\u8BDD\u6846\uFF09") : null,
        h(Button, {
          onClick: () => {
            setFileMode("dir");
            setTimeout(() => dirInputRef.current && dirInputRef.current.click(), 0);
          },
          "data-testid": "btn-choose-dir-input"
        }, "\u9009\u62E9\u76EE\u5F55\uFF08\u6D4F\u89C8\u5668\u6587\u4EF6\u6846\uFF09"),
        h(Button, {
          onClick: () => {
            setFileMode("files");
            setTimeout(() => fileInputRef.current && fileInputRef.current.click(), 0);
          },
          "data-testid": "btn-choose-files"
        }, "\u6539\u7528\u9010\u4E2A\u9009\u6587\u4EF6")
      ),
      h("input", {
        ref: dirInputRef,
        type: "file",
        multiple: true,
        webkitdirectory: "",
        directory: "",
        "data-testid": "input-import-dir",
        style: { display: "none" },
        onChange: (e) => readFromFiles(e.target.files)
      }),
      h("input", {
        ref: fileInputRef,
        type: "file",
        multiple: true,
        "data-testid": "input-import-files",
        style: { display: "none" },
        onChange: (e) => readFromFiles(e.target.files)
      }),
      h(
        "div",
        { style: { fontSize: 11.5, opacity: 0.6, lineHeight: 1.6 } },
        "\u8BF4\u660E\uFF1A\u6D4F\u89C8\u5668\u5B89\u5168\u9650\u5236\u4E0B\u65E0\u6CD5\u76F4\u63A5\u6309\u7EDD\u5BF9\u8DEF\u5F84\u8BFB\u76D8\uFF0C\u56E0\u6B64\u300C\u9010\u4E2A\u9009\u6587\u4EF6\u300D\u662F\u515C\u5E95\u65B9\u5F0F\uFF08\u9009 project.json\u3001canvas.json \u548C content \u4E0B\u7684 .md \u5373\u53EF\uFF09\u3002"
      ),
      error ? h("div", { style: { fontSize: 12, color: "#dc2626", lineHeight: 1.6 } }, error) : null
    ) : phase === "preview" && source ? h(
      "div",
      { style: { display: "grid", gap: 12 } },
      h("div", { style: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 } }, statsCards),
      h(
        "div",
        { style: { fontSize: 12, lineHeight: 1.7 } },
        h("div", null, `\u9879\u76EE\u540D\uFF1A${source.projectJson.title || "\uFF08\u672A\u547D\u540D\uFF09"} \xB7 \u96C6\u6570\uFF1A${source.projectJson.episodeCount ?? "\u672A\u786E\u8BA4"}`),
        h("div", { style: { opacity: 0.7 } }, `\u5DE5\u4F4D\u7C7B\u578B\uFF1A${Object.entries(source.stats.byType).map(([k, v]) => `${(NODE_TYPES[k] || {}).label || k}\xD7${v}`).join(" \xB7 ")}`),
        h("div", { style: { opacity: 0.7 } }, `\u6587\u4EF6\uFF1A${source.files.slice(0, 4).join("\u3001")}${source.files.length > 4 ? ` \u7B49 ${source.files.length} \u4E2A` : ""}`)
      ),
      warnings.length ? h(
        "div",
        { style: { padding: "8px 10px", borderRadius: 8, background: "#fffbeb", border: "1px solid #fde68a", fontSize: 11.5, lineHeight: 1.6, color: "#92400e" } },
        ...warnings.map((w, i) => h("div", { key: i }, `\u26A0 ${w}`))
      ) : null,
      error ? h("div", { style: { fontSize: 12, color: "#dc2626", lineHeight: 1.6 } }, error) : null
    ) : h(
      "div",
      { style: { display: "grid", gap: 10 } },
      h("div", { style: { display: "flex", alignItems: "center", gap: 8, fontSize: 12 } }, h(Spinner), `\u6B63\u5728\u5206\u6279\u5BFC\u5165\uFF1A${progress.done}/${progress.total} \u4E2A\u64CD\u4F5C\u2026`),
      h(ProgressBar, { done: progress.done, total: progress.total })
    )
  );
}
function CanvasView({ project, canvas, rev, onBack, onChanged, toast, confirm }) {
  const [nodes, setNodes] = useState(canvas.nodes);
  const [edges, setEdges] = useState(canvas.edges);
  const [viewport, setViewport] = useState(canvas.viewport || { x: 0, y: 0, zoom: 0.85 });
  const [selected, setSelected] = useState(null);
  const [showGrid, setShowGrid] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [genOpen, setGenOpen] = useState(false);
  const [jobsOpen, setJobsOpen] = useState(false);
  const [shootOpen, setShootOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [drawerJob, setDrawerJob] = useState(null);
  const [history, setHistory] = useState({ undo: [], redo: [] });
  const [historyBusy, setHistoryBusy] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState("");
  const [activeJobs, setActiveJobs] = useState(0);
  const [latestJob, setLatestJob] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [exportConflictOpen, setExportConflictOpen] = useState(false);
  const [exportDone, setExportDone] = useState(null);
  const [releasing, setReleasing] = useState(false);
  const [gateInfo, setGateInfo] = useState(null);
  const [forceReason, setForceReason] = useState("");
  const [gateSummary, setGateSummary] = useState(null);
  const [reviewState, setReviewState] = useState(project.reviewState || null);
  const inspectorSaveRef = useRef(null);
  const handleSaveReady = useCallback((fn) => {
    inspectorSaveRef.current = fn;
  }, []);
  const [dirty, setDirty] = useState(false);
  const drag = useRef(null);
  const surfaceRef = useRef(null);
  const historyRef = useRef(history);
  historyRef.current = history;
  const persistedVpRef = useRef(canvas.viewport || { x: 0, y: 0, zoom: 0.85 });
  const dirtyRef = useRef(false);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);
  useEffect(() => {
    setNodes(canvas.nodes);
    setEdges(canvas.edges);
    const vp = canvas.viewport || { x: 0, y: 0, zoom: 0.85 };
    setViewport(vp);
    persistedVpRef.current = { x: vp.x, y: vp.y, zoom: vp.zoom };
    setEditingId(null);
  }, [canvas.rev]);
  const apply = useCallback(async (ops, opts = {}) => {
    const r = await api.apply(project.id, ops, { idempotencyKey: newIdemKey("canvas"), ...opts });
    onChanged && onChanged();
    return r;
  }, [project.id, onChanged]);
  const pushHistory = useCallback((entry) => {
    setHistory((st) => ({ undo: [...st.undo, entry].slice(-UNDO_LIMIT), redo: [] }));
  }, []);
  const nodeById = useMemo(() => {
    const m = /* @__PURE__ */ new Map();
    for (const n of nodes) m.set(n.id, n);
    return m;
  }, [nodes]);
  const selectedNode = selected ? nodeById.get(selected) || null : null;
  const runHistory = useCallback(async (direction) => {
    const st = historyRef.current;
    const source = direction === "undo" ? st.undo : st.redo;
    const entry = source[source.length - 1];
    if (!entry || historyBusy) return;
    setHistoryBusy(true);
    try {
      const ops = direction === "undo" ? entry.inverse : entry.forward;
      await api.apply(project.id, ops, { idempotencyKey: newIdemKey(direction) });
      setHistory((cur) => {
        if (direction === "undo") return { undo: cur.undo.slice(0, -1), redo: [...cur.redo, entry].slice(-UNDO_LIMIT) };
        return { undo: [...cur.undo, entry].slice(-UNDO_LIMIT), redo: cur.redo.slice(0, -1) };
      });
      toast({ kind: "success", text: `${direction === "undo" ? "\u5DF2\u64A4\u9500" : "\u5DF2\u91CD\u505A"}\uFF1A${entry.label}` });
      onChanged && onChanged();
    } catch (e) {
      toast({ kind: "error", text: `${direction === "undo" ? "\u64A4\u9500" : "\u91CD\u505A"}\u5931\u8D25\uFF1A${e.message}` });
    } finally {
      setHistoryBusy(false);
    }
  }, [project.id, historyBusy, onChanged, toast]);
  const undo = useCallback(() => runHistory("undo"), [runHistory]);
  const redo = useCallback(() => runHistory("redo"), [runHistory]);
  useEffect(() => {
    const onKey = (e) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      const key = String(e.key || "").toLowerCase();
      if (key !== "z" && key !== "y") return;
      if (isEditableTarget(e.target)) return;
      e.preventDefault();
      if (key === "y" || e.shiftKey) redo();
      else undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);
  useEffect(() => {
    const last = persistedVpRef.current || {};
    const same = Math.abs((viewport.x || 0) - (last.x || 0)) < 0.5 && Math.abs((viewport.y || 0) - (last.y || 0)) < 0.5 && Math.abs((viewport.zoom || 0) - (last.zoom || 0)) < 5e-4;
    if (same) return void 0;
    const timer = window.setTimeout(async () => {
      try {
        await api.apply(project.id, [{ op: "viewport.set", viewport: { x: viewport.x, y: viewport.y, zoom: viewport.zoom } }], { idempotencyKey: newIdemKey("vp") });
        persistedVpRef.current = { x: viewport.x, y: viewport.y, zoom: viewport.zoom };
      } catch {
      }
    }, 800);
    return () => window.clearTimeout(timer);
  }, [viewport.x, viewport.y, viewport.zoom, project.id]);
  const refreshActiveJobs = useCallback(async () => {
    try {
      const rows = await api.listJobs(project.id);
      const list = Array.isArray(rows) ? rows : [];
      setActiveJobs(list.filter((j) => j && (j.status === "running" || j.status === "queued")).length);
      setLatestJob(list[0] || null);
    } catch {
    }
  }, [project.id]);
  useEffect(() => {
    refreshActiveJobs();
    const timer = window.setInterval(refreshActiveJobs, 1e4);
    return () => window.clearInterval(timer);
  }, [refreshActiveJobs]);
  const onWheel = useCallback((e) => {
    e.preventDefault();
    const rect = surfaceRef.current.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    setViewport((vp) => {
      const factor = Math.exp(-e.deltaY * 15e-4);
      const zoom = Math.min(2.5, Math.max(0.2, vp.zoom * factor));
      const k = zoom / vp.zoom;
      return { zoom, x: px - (px - vp.x) * k, y: py - (py - vp.y) * k };
    });
  }, []);
  useEffect(() => {
    const el = surfaceRef.current;
    if (!el) return void 0;
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [onWheel]);
  const onSurfacePointerDown = (e) => {
    if (e.button !== 0) return;
    setSelected(null);
    drag.current = { kind: "pan", startX: e.clientX, startY: e.clientY, vx: viewport.x, vy: viewport.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onNodePointerDown = (node) => (e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    drag.current = { kind: "node", id: node.id, startX: e.clientX, startY: e.clientY, nx: node.x, ny: node.y, moved: false, captured: false };
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.startX) / viewport.zoom;
    const dy = (e.clientY - d.startY) / viewport.zoom;
    if (d.kind === "node" && !d.captured && Math.abs(dx) + Math.abs(dy) > 2) {
      d.captured = true;
      try {
        surfaceRef.current && surfaceRef.current.setPointerCapture(e.pointerId);
      } catch {
      }
    }
    if (d.kind === "pan") {
      setViewport((vp) => ({ ...vp, x: d.vx + (e.clientX - d.startX), y: d.vy + (e.clientY - d.startY) }));
    } else {
      if (Math.abs(dx) + Math.abs(dy) > 2) d.moved = true;
      setNodes((ns) => ns.map((n) => n.id === d.id ? { ...n, x: Math.round(d.nx + dx), y: Math.round(d.ny + dy) } : n));
    }
  };
  const onPointerUp = (e) => {
    const d = drag.current;
    drag.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
    }
    if (d && d.kind === "node" && d.moved) {
      const n = nodes.find((x) => x.id === d.id);
      if (!n) return;
      const forward = [{ op: "node.update", nodeId: n.id, patch: { x: n.x, y: n.y } }];
      apply(forward).then(() => pushHistory({
        label: `\u79FB\u52A8\u300C${n.title}\u300D`,
        forward,
        inverse: [{ op: "node.update", nodeId: n.id, patch: { x: d.nx, y: d.ny } }]
      })).catch((err) => toast({ kind: "error", text: "\u4FDD\u5B58\u4F4D\u7F6E\u5931\u8D25\uFF1A" + err.message }));
    }
  };
  const onCreateNode = async (type) => {
    const rect = surfaceRef.current.getBoundingClientRect();
    const x = Math.round((rect.width / 2 - viewport.x) / viewport.zoom) - 140;
    const y = Math.round((rect.height / 2 - viewport.y) / viewport.zoom) - 75;
    try {
      const r = await apply([{ op: "node.create", node: { type, title: `\u65B0${NODE_TYPES[type].label}`, x, y } }]);
      const nodeId = r && r.results && r.results[0] ? r.results[0].nodeId : null;
      setCreateOpen(false);
      toast({ kind: "success", text: "\u8282\u70B9\u5DF2\u521B\u5EFA" });
      if (nodeId) {
        pushHistory({
          label: `\u521B\u5EFA\u8282\u70B9\u300C${NODE_TYPES[type].label}\u300D`,
          forward: [{ op: "node.create", node: { id: nodeId, type, title: `\u65B0${NODE_TYPES[type].label}`, x, y } }],
          inverse: [{ op: "node.delete", nodeId }]
        });
        setSelected(nodeId);
      }
    } catch (e) {
      toast({ kind: "error", text: "\u521B\u5EFA\u8282\u70B9\u5931\u8D25\uFF1A" + e.message });
    }
  };
  const onTransition = async (node, to) => {
    const from = node.status;
    const forward = [{ op: "node.transition", nodeId: node.id, to, reason: "ui" }];
    try {
      await apply(forward);
      pushHistory({
        label: `\u300C${node.title}\u300D\u72B6\u6001 ${STATUS_META[from] ? STATUS_META[from].label : from}\u2192${STATUS_META[to] ? STATUS_META[to].label : to}`,
        forward,
        inverse: [{ op: "node.transition", nodeId: node.id, to: from, reason: "undo" }]
      });
      toast({ kind: "success", text: `\u72B6\u6001 \u2192 ${STATUS_META[to] ? STATUS_META[to].label : to}` });
    } catch (e) {
      toast({ kind: "error", text: "\u72B6\u6001\u8FC1\u79FB\u5931\u8D25\uFF1A" + e.message });
    }
  };
  const onContentSaved = (before, after) => {
    pushHistory({
      label: "\u4FDD\u5B58\u6B63\u6587",
      forward: [{ op: "node.write", nodeId: selected, text: after }],
      inverse: [{ op: "node.write", nodeId: selected, text: before }]
    });
  };
  const onDeleteNode = async (node) => {
    const ok = await confirm({
      title: "\u5220\u9664\u8282\u70B9",
      message: `\u786E\u8BA4\u5220\u9664\u8282\u70B9\u300C${node.title}\u300D\uFF1F`,
      detail: "\u4F1A\u540C\u65F6\u5220\u9664\u4E0E\u5B83\u76F8\u8FDE\u7684\u8FDE\u7EBF\uFF1B\u5220\u9664\u540E\u53EF\u7528 Cmd+Z \u64A4\u9500\u6062\u590D\uFF08\u6B63\u6587\u4E00\u5E76\u6062\u590D\uFF09\u3002",
      danger: true,
      confirmText: "\u5220\u9664\u8282\u70B9"
    });
    if (!ok) return;
    try {
      const content = await api.getContent(project.id, node.id).catch(() => ({ text: "" }));
      const snapshot = {
        id: node.id,
        type: node.type,
        title: node.title,
        x: node.x,
        y: node.y,
        w: node.w,
        h: node.h,
        ref: node.ref || { episode: null, scene: null },
        meta: node.meta || {}
      };
      await apply([{ op: "node.delete", nodeId: node.id }]);
      pushHistory({
        label: `\u5220\u9664\u8282\u70B9\u300C${node.title}\u300D`,
        forward: [{ op: "node.delete", nodeId: node.id }],
        inverse: [{ op: "node.create", node: snapshot, text: content.text || "" }]
      });
      if (selected === node.id) setSelected(null);
      toast({ kind: "success", text: "\u8282\u70B9\u5DF2\u5220\u9664\uFF08\u53EF\u64A4\u9500\uFF09" });
    } catch (e) {
      toast({ kind: "error", text: "\u5220\u9664\u5931\u8D25\uFF1A" + e.message });
    }
  };
  const startRename = (node) => {
    setEditingId(node.id);
    setEditingText(node.title || "");
  };
  const cancelRename = () => {
    setEditingId(null);
    setEditingText("");
  };
  const commitRename = async () => {
    const id = editingId;
    if (!id) return;
    const node = nodeById.get(id);
    const title = String(editingText || "").trim();
    setEditingId(null);
    if (!node || !title || title === node.title) return;
    setNodes((ns) => ns.map((n) => n.id === id ? { ...n, title } : n));
    try {
      await apply([{ op: "node.update", nodeId: id, patch: { title } }]);
      pushHistory({
        label: `\u91CD\u547D\u540D\u300C${node.title}\u300D\u2192\u300C${title}\u300D`,
        forward: [{ op: "node.update", nodeId: id, patch: { title } }],
        inverse: [{ op: "node.update", nodeId: id, patch: { title: node.title } }]
      });
      toast({ kind: "success", text: "\u5DF2\u91CD\u547D\u540D" });
    } catch (e) {
      setNodes((ns) => ns.map((n) => n.id === id ? { ...n, title: node.title } : n));
      toast({ kind: "error", text: "\u91CD\u547D\u540D\u5931\u8D25\uFF1A" + e.message });
    }
  };
  const selectNode = useCallback(async (id) => {
    if (id === selected) return;
    if (dirtyRef.current) {
      const ok = await confirm({
        title: "\u653E\u5F03\u672A\u4FDD\u5B58\u6B63\u6587\uFF1F",
        message: "\u5F53\u524D\u8282\u70B9\u6709\u672A\u4FDD\u5B58\u7684\u6B63\u6587\u4FEE\u6539\uFF0C\u5207\u6362\u8282\u70B9\u4F1A\u4E22\u5931\u3002",
        danger: true,
        confirmText: "\u653E\u5F03\u4FEE\u6539",
        cancelText: "\u56DE\u53BB\u4FDD\u5B58"
      });
      if (!ok) return;
      dirtyRef.current = false;
      setDirty(false);
    }
    setSelected(id);
  }, [selected, confirm]);
  const closeInspector = async () => {
    if (dirtyRef.current) {
      const ok = await confirm({
        title: "\u653E\u5F03\u672A\u4FDD\u5B58\u6B63\u6587\uFF1F",
        message: "\u5F53\u524D\u8282\u70B9\u6709\u672A\u4FDD\u5B58\u7684\u6B63\u6587\u4FEE\u6539\uFF0C\u5173\u95ED\u4F1A\u4E22\u5931\u3002",
        danger: true,
        confirmText: "\u653E\u5F03\u4FEE\u6539",
        cancelText: "\u56DE\u53BB\u4FDD\u5B58"
      });
      if (!ok) return;
      dirtyRef.current = false;
      setDirty(false);
    }
    setSelected(null);
  };
  const goBack = async () => {
    if (dirtyRef.current) {
      const ok = await confirm({
        title: "\u653E\u5F03\u672A\u4FDD\u5B58\u6B63\u6587\uFF1F",
        message: "\u5F53\u524D\u8282\u70B9\u6709\u672A\u4FDD\u5B58\u7684\u6B63\u6587\u4FEE\u6539\uFF0C\u8FD4\u56DE\u9879\u76EE\u5217\u8868\u4F1A\u4E22\u5931\u3002",
        danger: true,
        confirmText: "\u653E\u5F03\u5E76\u8FD4\u56DE",
        cancelText: "\u56DE\u53BB\u4FDD\u5B58"
      });
      if (!ok) return;
      dirtyRef.current = false;
      setDirty(false);
    }
    onBack();
  };
  const onCheck = async (node) => {
    try {
      const r = await api.runCheck(project.id, node.id);
      toast({ kind: r.summary.verdict === "reject" ? "error" : "success", text: `\u68C0\u67E5\u5B8C\u6210\uFF1A${r.summary.verdict}\uFF08${r.summary.errors} \u9519 / ${r.summary.warnings} \u8B66\uFF09` });
      onChanged && onChanged();
    } catch (e) {
      toast({ kind: "error", text: "\u68C0\u67E5\u5931\u8D25\uFF1A" + e.message });
    }
  };
  const showExportToast = useCallback((r) => {
    setExportDone(r || {});
    const path = r && r.path ? String(r.path) : "";
    const kb = Math.round((r && r.bytes || 0) / 1024);
    toast({ kind: "success", duration: 5e3, text: `\u5DF2\u5BFC\u51FA ${r && r.format ? r.format : "docx"} \xB7 ${kb} KB` });
  }, [toast]);
  const doExport = useCallback(async () => {
    setExporting(true);
    try {
      const r = await api.exportProject(project.id, "docx");
      showExportToast(r);
    } catch (e) {
      toast({ kind: "error", text: "\u5BFC\u51FA\u5931\u8D25\uFF1A" + e.message });
    } finally {
      setExporting(false);
    }
  }, [project.id, showExportToast, toast]);
  const onExport = () => {
    if (dirtyRef.current) {
      setExportConflictOpen(true);
      return;
    }
    doExport();
  };
  const exportSaveAndGo = async () => {
    setExportConflictOpen(false);
    const ok = inspectorSaveRef.current ? await inspectorSaveRef.current() : true;
    if (!ok) {
      toast({ kind: "error", text: "\u4FDD\u5B58\u5931\u8D25\uFF0C\u5DF2\u4E2D\u6B62\u5BFC\u51FA" });
      return;
    }
    await doExport();
  };
  const exportDiskOnly = async () => {
    setExportConflictOpen(false);
    await doExport();
  };
  const onRelease = async () => {
    const ok = await confirm({
      title: "\u4EBA\u5DE5\u653E\u884C\u8FD9\u90E8\u5267\uFF1F",
      message: "\u653E\u884C\u8868\u793A\u4F60\u5DF2\u901A\u8BFB/\u62BD\u67E5\u5267\u672C\uFF0C\u786E\u8BA4\u53EF\u4EE5\u4F5C\u4E3A\u4EA4\u4ED8\u7A3F\u3002\u653E\u884C\u540E\u4F1A\u8BB0\u5F55\u653E\u884C\u4EBA\u4E0E\u65F6\u95F4\u3002",
      detail: '\u751F\u6210\u5B8C\u6210\u53EA\u662F"\u81EA\u52A8\u8D28\u68C0\u901A\u8FC7"\uFF0C\u4E0D\u4EE3\u66FF\u4F60\u7684\u5224\u65AD\u3002\u653E\u884C\u4F1A\u8BB0\u5F55\u5F53\u524D\u7A3F\u4EF6\u7248\u672C\uFF1B\u4E4B\u540E\u82E5\u518D\u6539\u7A3F\uFF0C\u653E\u884C\u81EA\u52A8\u5931\u6548\uFF0C\u9700\u8981\u91CD\u65B0\u653E\u884C\u3002',
      confirmText: "\u786E\u8BA4\u653E\u884C",
      cancelText: "\u518D\u770B\u770B"
    });
    if (!ok) return;
    setReleasing(true);
    try {
      const r = await api.releaseProject(project.id);
      setReviewState("released");
      toast({ kind: "success", text: `\u5DF2\u653E\u884C\uFF1A\u4EA4\u4ED8\u8282\u70B9 ${r.deliveryStatus || "approved"}\uFF0C\u53EF\u4EE5\u5BFC\u51FA\u4E86` });
      onChanged && onChanged();
    } catch (e) {
      if (e.code === "E_RELEASE_GATE") {
        setGateInfo({ message: e.message, details: e.details || {} });
        setForceReason("");
      } else {
        toast({ kind: "error", text: "\u653E\u884C\u5931\u8D25\uFF1A" + e.message });
      }
    } finally {
      setReleasing(false);
    }
  };
  const forceRelease = async () => {
    if (!forceReason.trim()) {
      toast({ kind: "error", text: "\u5F3A\u5236\u653E\u884C\u5FC5\u987B\u586B\u5199\u7406\u7531\uFF08\u4F1A\u8BB0\u5165\u5BA1\u8BA1\uFF09" });
      return;
    }
    setReleasing(true);
    try {
      const r = await api.releaseProject(project.id, { force: true, forceReason: forceReason.trim() });
      setReviewState("released");
      setGateInfo(null);
      toast({ kind: "success", text: `\u5DF2\u5F3A\u5236\u653E\u884C\uFF08\u539F\u56E0\u5DF2\u8BB0\u5F55\uFF09\xB7 \u4EA4\u4ED8\u8282\u70B9 ${r.deliveryStatus || "approved"}` });
      onChanged && onChanged();
    } catch (e) {
      toast({ kind: "error", text: "\u5F3A\u5236\u653E\u884C\u5931\u8D25\uFF1A" + e.message });
    } finally {
      setReleasing(false);
    }
  };
  useEffect(() => {
    if (reviewState !== "generated") {
      setGateSummary(null);
      return;
    }
    let alive = true;
    api.shootability(project.id, "json").then((r) => {
      if (alive) setGateSummary(r.summary);
    }).catch(() => {
    });
    return () => {
      alive = false;
    };
  }, [reviewState, project.id, rev]);
  const zoomBy = (k) => setViewport((vp) => ({ ...vp, zoom: Math.min(2.5, Math.max(0.2, vp.zoom * k)) }));
  const maxX = nodes.reduce((m, n) => Math.max(m, n.x + n.w), 800);
  const maxY = nodes.reduce((m, n) => Math.max(m, n.y + n.h), 600);
  const canUndo = history.undo.length > 0;
  const canRedo = history.redo.length > 0;
  const edgePath = (a, b) => {
    const from = { x: a.x + a.w, y: a.y + a.h / 2 };
    const to = { x: b.x, y: b.y + b.h / 2 };
    const dx = Math.max(40, Math.abs(to.x - from.x) * 0.45);
    return `M ${from.x} ${from.y} C ${from.x + dx} ${from.y}, ${to.x - dx} ${to.y}, ${to.x} ${to.y}`;
  };
  return h(
    "div",
    { className: "moxi-panel", style: { height: "100%", display: "flex", flexDirection: "column", background: TOKENS.bg, color: TOKENS.text } },
    /* 工具栏 */
    h(
      "div",
      { "data-testid": "toolbar", style: { flex: "0 0 auto", minHeight: 44, display: "flex", alignItems: "center", gap: 6, padding: "0 12px", borderBottom: `1px solid ${TOKENS.border}`, overflowX: "auto" } },
      h(Button, { tone: "ghost", onClick: goBack, "data-testid": "btn-back" }, "\u2190 \u9879\u76EE"),
      h("span", { style: { fontSize: 13, fontWeight: 650, whiteSpace: "nowrap" } }, project.title),
      h("span", { style: { fontSize: 11, opacity: 0.55, whiteSpace: "nowrap" } }, `${project.episodeCount ?? "\u96C6\u6570\u672A\u786E\u8BA4"} \u96C6${project.audience ? " \xB7 " + project.audience : ""}`),
      h("span", { style: { width: 1, height: 18, background: TOKENS.border, margin: "0 2px" } }),
      h(Button, { onClick: () => setCreateOpen(true), "data-testid": "btn-add-node" }, "+ \u5DE5\u4F4D"),
      h(Button, { tone: "primary", onClick: () => setGenOpen(true), "data-testid": "btn-generate" }, "\u26A1 \u751F\u6210"),
      h(Button, { onClick: () => setJobsOpen(true), "data-testid": "btn-jobs" }, activeJobs ? `\u521B\u4F5C\u8BB0\u5F55 (${activeJobs})` : "\u521B\u4F5C\u8BB0\u5F55"),
      h(Button, { onClick: () => setImportOpen(true), "data-testid": "btn-import" }, "\u5BFC\u5165"),
      h(Button, { onClick: () => setShootOpen(true), "data-testid": "btn-shootability", title: "\u53EF\u62CD\u6027\u62A5\u544A\uFF1A\u65F6\u957F/\u89D2\u8272/\u94A9\u5B50/\u9010\u96C6\u7B7E\u6536" }, "\u53EF\u62CD\u6027"),
      h(Button, { onClick: undo, disabled: !canUndo || historyBusy, title: canUndo ? `\u64A4\u9500\uFF1A${history.undo[history.undo.length - 1].label}\uFF08Cmd+Z\uFF09` : "\u6CA1\u6709\u53EF\u64A4\u9500\u7684\u64CD\u4F5C", "data-testid": "btn-undo" }, "\u21B6 \u64A4\u9500"),
      h(Button, { onClick: redo, disabled: !canRedo || historyBusy, title: canRedo ? `\u91CD\u505A\uFF1A${history.redo[history.redo.length - 1].label}\uFF08Shift+Cmd+Z\uFF09` : "\u6CA1\u6709\u53EF\u91CD\u505A\u7684\u64CD\u4F5C", "data-testid": "btn-redo" }, "\u21B7 \u91CD\u505A"),
      h(
        Button,
        {
          onClick: onExport,
          disabled: exporting,
          title: latestJob && latestJob.status === "done_with_errors" ? `\u6700\u8FD1\u751F\u6210\u4EFB\u52A1\u6709 ${latestJob.progress && latestJob.progress.failed || 0} \u96C6\u5931\u8D25\uFF0C\u5BFC\u51FA\u524D\u8BF7\u5148\u7EED\u8DD1\u6216\u4FEE\u590D` : "\u5BFC\u51FA docx",
          "data-testid": "btn-export"
        },
        h(
          "span",
          { style: { display: "inline-flex", alignItems: "center", gap: 5 } },
          exporting ? "\u5BFC\u51FA\u4E2D\u2026" : "\u5BFC\u51FA",
          latestJob && latestJob.status === "done_with_errors" ? h("span", { "data-testid": "export-warn-dot", title: "\u6700\u8FD1\u4EFB\u52A1\u6709\u5931\u8D25\u96C6\uFF0C\u5BFC\u51FA\u524D\u8BF7\u5148\u7EED\u8DD1\u6216\u4FEE\u590D", style: { width: 7, height: 7, borderRadius: 999, background: "#ef4444", display: "inline-block" } }) : null
        )
      ),
      h("span", { style: { flex: 1 } }),
      h("span", { style: { fontSize: 11, opacity: 0.5, whiteSpace: "nowrap" } }, `rev ${rev}`),
      h(Button, { onClick: () => zoomBy(1 / 1.2), "data-testid": "btn-zoom-out" }, "\uFF0D"),
      h("span", { style: { fontSize: 11, width: 42, textAlign: "center", opacity: 0.7 } }, `${Math.round(viewport.zoom * 100)}%`),
      h(Button, { onClick: () => zoomBy(1.2), "data-testid": "btn-zoom-in" }, "\uFF0B"),
      h(Button, { onClick: () => setViewport({ x: 0, y: 0, zoom: 0.85 }), "data-testid": "btn-zoom-reset" }, "\u590D\u4F4D"),
      h(Button, { onClick: () => setShowGrid((v) => !v), "data-testid": "btn-grid" }, showGrid ? "\u7F51\u683C\u5F00" : "\u7F51\u683C\u5173")
    ),
    // 评审状态条：生成完成 ≠ 可交付
    reviewState === "generated" || reviewState === "has_errors" ? h(
      "div",
      {
        "data-testid": "review-banner",
        style: {
          flex: "0 0 auto",
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "7px 14px",
          background: reviewState === "generated" ? "rgba(164,71,54,.08)" : "#fef2f2",
          borderBottom: `1px solid ${reviewState === "generated" ? "rgba(164,71,54,.28)" : "#fca5a5"}`,
          fontSize: 12.5
        }
      },
      h("span", { className: "moxi-stamp" }, reviewState === "generated" ? "\u5F85\u653E\u884C" : "\u6709\u5931\u8D25\u96C6"),
      h(
        "span",
        { style: { flex: 1, opacity: 0.85 } },
        reviewState === "generated" ? `\u672C\u5267\u5DF2\u751F\u6210\uFF0C\u81EA\u52A8\u8D28\u68C0\u901A\u8FC7\u3002\u653E\u884C\u9700\u901A\u8FC7\u53EF\u62CD\u6027\u95F8\u95E8${gateSummary ? `\uFF08\u672A\u7B7E\u6536 ${gateSummary.unsigned + (gateSummary.staleSignoffs || 0)} \u96C6 \xB7 \u7F3A\u94A9\u5B50 ${gateSummary.hooksMissing} \u96C6\uFF09` : ""}\uFF1A\u9010\u96C6\u7B7E\u6536 + \u8865\u9F50\u94A9\u5B50\u540E\u624D\u53EF\u653E\u884C\u3002` : "\u6700\u8FD1\u4E00\u6B21\u751F\u6210\u6709\u5931\u8D25\u96C6\uFF0C\u8BF7\u6253\u5F00\u300C\u521B\u4F5C\u8BB0\u5F55\u300D\u7EED\u8DD1\u6216\u4FEE\u590D\u540E\u518D\u653E\u884C\u3002"
      ),
      reviewState === "generated" ? h(Button, { tone: "primary", onClick: onRelease, disabled: releasing, "data-testid": "btn-release" }, releasing ? "\u653E\u884C\u4E2D\u2026" : "\u4EBA\u5DE5\u653E\u884C") : null
    ) : null,
    h(
      "div",
      { style: { flex: 1, display: "flex", minHeight: 0 } },
      h(
        "div",
        {
          ref: surfaceRef,
          onPointerDown: onSurfacePointerDown,
          onPointerMove,
          onPointerUp,
          "data-testid": "canvas-surface",
          style: {
            position: "relative",
            flex: 1,
            overflow: "hidden",
            backgroundColor: TOKENS.bgSoft,
            backgroundImage: showGrid ? `radial-gradient(circle, ${TOKENS.border} 1px, transparent 1px)` : "none",
            backgroundSize: "18px 18px"
          }
        },
        h(
          "div",
          {
            style: {
              position: "absolute",
              left: 0,
              top: 0,
              transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
              transformOrigin: "0 0",
              width: maxX + 400,
              height: maxY + 400
            }
          },
          h(
            "svg",
            { width: maxX + 400, height: maxY + 400, style: { position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" } },
            h("defs", null, h(
              "marker",
              { id: "mx-arrow", viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" },
              h("path", { d: "M 0 0 L 10 5 L 0 10 z", fill: "currentColor", opacity: 0.45 })
            )),
            edges.map((e) => {
              const a = nodeById.get(e.from);
              const b = nodeById.get(e.to);
              if (!a || !b) return null;
              return h("path", {
                key: e.id,
                d: edgePath(a, b),
                fill: "none",
                stroke: "var(--dsw-alias-label-primary, #71717a)",
                strokeWidth: e.kind === "dependency" ? 1.6 : 1.2,
                strokeDasharray: e.kind === "dependency" ? "none" : "4 4",
                opacity: e.kind === "dependency" ? 0.5 : 0.32,
                markerEnd: "url(#mx-arrow)"
              });
            })
          ),
          nodes.map((n) => h(NodeCard, {
            key: n.id,
            node: n,
            selected: selected === n.id,
            findings: n.meta && n.meta.findings,
            editing: editingId === n.id,
            editingText,
            onEditText: setEditingText,
            onStartRename: () => startRename(n),
            onCommitRename: commitRename,
            onCancelRename: cancelRename,
            onPointerDown: onNodePointerDown(n),
            onClick: (e) => {
              e.stopPropagation();
              selectNode(n.id);
            }
          }))
        ),
        h(
          "div",
          {
            style: {
              position: "absolute",
              left: 12,
              bottom: 12,
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              padding: "6px 10px",
              borderRadius: 8,
              fontSize: 10.5,
              background: TOKENS.bg,
              border: `1px solid ${TOKENS.border}`,
              maxWidth: "calc(100% - 24px)"
            }
          },
          Object.entries(NODE_TYPES).map(([k, v]) => h(
            "span",
            { key: k, style: { display: "inline-flex", alignItems: "center", gap: 4, opacity: 0.8 } },
            h("span", { style: { color: v.accent } }, v.glyph),
            v.label
          ))
        )
      ),
      h(Inspector, {
        project,
        node: selectedNode,
        toast,
        onClose: closeInspector,
        onSaved: onContentSaved,
        onTransition,
        onCheck,
        onDelete: onDeleteNode,
        onDirtyChange: setDirty,
        onRename: startRename,
        onSaveReady: handleSaveReady
      })
    ),
    h(
      "div",
      { style: { flex: "0 0 auto", height: 26, display: "flex", alignItems: "center", gap: 14, padding: "0 12px", fontSize: 11, opacity: 0.68, borderTop: `1px solid ${TOKENS.border}` } },
      h("span", null, `\u5DE5\u4F4D ${nodes.length}`),
      h("span", null, `\u8FDE\u7EBF ${edges.length}`),
      h("span", null, `rev ${rev}`),
      dirty ? h("span", { style: { color: "#d97706", opacity: 1 } }, "\u25CF \u6B63\u6587\u672A\u4FDD\u5B58") : null,
      h("span", { style: { flex: 1 } }),
      h("span", null, `\u64A4\u9500 ${history.undo.length} / \u91CD\u505A ${history.redo.length}`),
      h("span", null, "\u62D6\u7A7A\u767D=\u5E73\u79FB \xB7 \u6EDA\u8F6E=\u7F29\u653E \xB7 \u53CC\u51FB\u6807\u9898=\u6539\u540D \xB7 Cmd+Z=\u64A4\u9500")
    ),
    createOpen ? h(
      Modal,
      { title: "\u65B0\u5EFA\u5DE5\u4F4D", onClose: () => setCreateOpen(false), width: 420, testid: "modal-create-node" },
      h(
        "div",
        { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 } },
        Object.entries(NODE_TYPES).map(([k, v]) => h(
          Button,
          { key: k, "data-testid": `btn-create-node-${k}`, onClick: () => onCreateNode(k) },
          h("span", { style: { color: v.accent, marginRight: 5 } }, v.glyph),
          v.label
        ))
      )
    ) : null,
    genOpen ? h(GenerateModal, {
      project,
      onClose: () => setGenOpen(false),
      onStarted: (job) => {
        setGenOpen(false);
        setDrawerJob({ jobId: job.id });
        refreshActiveJobs();
      },
      toast
    }) : null,
    jobsOpen ? h(JobListModal, {
      project,
      onClose: () => {
        setJobsOpen(false);
        refreshActiveJobs();
      },
      onOpenJob: (job) => {
        setJobsOpen(false);
        setDrawerJob({ jobId: job.id });
        refreshActiveJobs();
      },
      toast,
      confirm
    }) : null,
    shootOpen ? h(ShootabilityDrawer, {
      project,
      onClose: () => setShootOpen(false),
      toast,
      confirm
    }) : null,
    importOpen ? h(ImportModal, {
      project,
      canvas,
      onClose: () => setImportOpen(false),
      onImported: () => {
        setImportOpen(false);
        onChanged && onChanged();
      },
      toast
    }) : null,
    gateInfo ? h(
      Modal,
      {
        title: "\u53EF\u62CD\u6027\u95F8\u95E8\u672A\u901A\u8FC7",
        onClose: () => setGateInfo(null),
        width: 640,
        testid: "modal-release-gate",
        footer: [
          h(Button, { key: "s", onClick: () => {
            setGateInfo(null);
            setShootOpen(true);
          }, "data-testid": "btn-gate-goto-signoff" }, "\u53BB\u53EF\u62CD\u6027\u9875\u7B7E\u6536"),
          h(Button, { key: "f", tone: "danger", onClick: forceRelease, disabled: releasing, "data-testid": "btn-gate-force" }, releasing ? "\u5904\u7406\u4E2D\u2026" : "\u5F3A\u5236\u653E\u884C\uFF08\u9700\u7406\u7531\uFF09"),
          h(Button, { key: "c", onClick: () => setGateInfo(null) }, "\u53D6\u6D88")
        ]
      },
      h(
        "div",
        { style: { fontSize: 12.5, lineHeight: 1.8, marginBottom: 10 } },
        gateInfo.message
      ),
      h(
        "div",
        { style: { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 12, fontSize: 11.5 } },
        [
          ["\u672A\u7B7E\u6536", (gateInfo.details.unsigned || []).length],
          ["\u7B7E\u6536\u5931\u6548", (gateInfo.details.stale || []).length],
          ["\u7F3A\u94A9\u5B50", (gateInfo.details.noHook || []).length]
        ].map(
          ([k, v]) => h(
            "div",
            {
              key: k,
              style: { padding: "8px 10px", borderRadius: 8, background: TOKENS.bgSoft, border: `1px solid ${TOKENS.border}` }
            },
            h("div", { style: { opacity: 0.6 } }, k),
            h("div", { className: "moxi-serif", style: { fontSize: 20, fontWeight: 600 } }, v)
          )
        )
      ),
      (gateInfo.details.unsigned || []).length ? h(
        "div",
        { style: { fontSize: 11.5, lineHeight: 1.7, opacity: 0.85, marginBottom: 6 } },
        `\u672A\u7B7E\u6536\u96C6\u6570\uFF1A${(gateInfo.details.unsigned || []).join("\u3001")}${(gateInfo.details.unsigned || []).length > 20 ? " \u7B49" : ""}`
      ) : null,
      (gateInfo.details.noHook || []).length ? h(
        "div",
        { style: { fontSize: 11.5, lineHeight: 1.7, opacity: 0.85, marginBottom: 10 } },
        `\u7F3A\u94A9\u5B50\u96C6\u6570\uFF1A${(gateInfo.details.noHook || []).join("\u3001")}${(gateInfo.details.noHook || []).length > 20 ? " \u7B49" : ""}`
      ) : null,
      h(
        "div",
        { style: { fontSize: 11.5, opacity: 0.7, marginBottom: 6 } },
        "\u82E5\u786E\u9700\u8DF3\u8FC7\uFF08\u4F8B\u5982\u94A9\u5B50\u7531\u4EBA\u5DE5\u786E\u8BA4\u8FC7\uFF09\uFF0C\u53EF\u586B\u5199\u7406\u7531\u5F3A\u5236\u653E\u884C\uFF1B\u7406\u7531\u4F1A\u5199\u5165\u5BA1\u8BA1\u4E8B\u4EF6\u3002"
      ),
      h("textarea", {
        value: forceReason,
        maxLength: 300,
        onChange: (ev) => setForceReason(ev.target.value),
        placeholder: "\u5F3A\u5236\u653E\u884C\u7406\u7531\uFF08\u5FC5\u586B\uFF0C\u2264300 \u5B57\uFF09",
        "data-testid": "input-force-reason",
        style: { width: "100%", minHeight: 64, padding: "8px 10px", borderRadius: 8, border: `1px solid ${TOKENS.border}`, background: TOKENS.bg, color: TOKENS.text, fontSize: 12, resize: "vertical", boxSizing: "border-box" }
      })
    ) : null,
    exportDone ? h(
      Modal,
      {
        title: "\u5BFC\u51FA\u5B8C\u6210",
        onClose: () => setExportDone(null),
        width: 620,
        testid: "modal-export-done",
        footer: [
          h(Button, { key: "r", onClick: async () => {
            try {
              await api.revealFile(exportDone.path);
              toast({ kind: "success", text: "\u5DF2\u5728\u6587\u4EF6\u5939\u4E2D\u5B9A\u4F4D" });
            } catch (e) {
              toast({ kind: "error", text: "\u5B9A\u4F4D\u5931\u8D25\uFF1A" + e.message });
            }
          }, "data-testid": "btn-export-reveal" }, "\u5728\u6587\u4EF6\u5939\u4E2D\u663E\u793A"),
          h(Button, { key: "d", onClick: async () => {
            try {
              const f = await api.readFile(exportDone.path);
              const bin = atob(f.base64);
              const arr = new Uint8Array(bin.length);
              for (let i = 0; i < bin.length; i += 1) arr[i] = bin.charCodeAt(i);
              const blob = new Blob([arr], { type: "application/octet-stream" });
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = exportDone.path.split("/").pop();
              document.body.appendChild(a);
              a.click();
              a.remove();
              setTimeout(() => URL.revokeObjectURL(a.href), 4e3);
              toast({ kind: "success", text: "\u5DF2\u5F00\u59CB\u4E0B\u8F7D\u526F\u672C" });
            } catch (e) {
              toast({ kind: "error", text: "\u4E0B\u8F7D\u5931\u8D25\uFF1A" + e.message });
            }
          }, "data-testid": "btn-export-download" }, "\u4E0B\u8F7D\u526F\u672C"),
          h(Button, { key: "c", onClick: async () => {
            const ok = await copyTextToClipboard(exportDone.path || "");
            toast({ kind: ok ? "success" : "error", text: ok ? "\u8DEF\u5F84\u5DF2\u590D\u5236" : "\u590D\u5236\u5931\u8D25" });
          }, "data-testid": "btn-export-copy" }, "\u590D\u5236\u8DEF\u5F84"),
          h(Button, { key: "x", tone: "primary", onClick: () => setExportDone(null) }, "\u5B8C\u6210")
        ]
      },
      h(
        "div",
        { style: { fontSize: 12.5, lineHeight: 1.8 } },
        h("div", null, `\u683C\u5F0F ${String(exportDone.format || "docx").toUpperCase()} \xB7 ${Math.round((exportDone.bytes || 0) / 1024)} KB \xB7 ${exportDone.sections || 0} \u8282`),
        exportDone.fallback ? h("div", { style: { color: "#b45309" } }, `\u964D\u7EA7\u8BF4\u660E\uFF1A${exportDone.fallback.reason || "docx \u4E0D\u53EF\u7528"}`) : null,
        h("div", { style: { marginTop: 8, fontSize: 11.5, opacity: 0.7, fontFamily: TOKENS.mono, wordBreak: "break-all" } }, exportDone.path || "")
      ),
      h(
        "div",
        { style: { marginTop: 10, fontSize: 11.5, opacity: 0.7 } },
        "\u4F60\u53EF\u4EE5\u628A\u6587\u4EF6\u590D\u5236\u5230\u4EFB\u610F\u4F4D\u7F6E\uFF1A\u70B9\u300C\u5728\u6587\u4EF6\u5939\u4E2D\u663E\u793A\u300D\u5728\u8BBF\u8FBE\u5B9A\u4F4D\uFF0C\u6216\u300C\u4E0B\u8F7D\u526F\u672C\u300D\u53E6\u5B58\u4E00\u4EFD\u3002"
      )
    ) : null,
    exportConflictOpen ? h(
      Modal,
      {
        title: "\u6709\u672A\u4FDD\u5B58\u6B63\u6587",
        onClose: () => setExportConflictOpen(false),
        width: 580,
        testid: "modal-export-conflict",
        footer: [
          h(Button, { key: "c", onClick: () => setExportConflictOpen(false), "data-testid": "btn-export-choice-cancel" }, "\u53D6\u6D88"),
          h(Button, { key: "d", onClick: exportDiskOnly, "data-testid": "btn-export-choice-disk" }, "\u4EC5\u5BFC\u51FA\u5F53\u524D\u78C1\u76D8\u7248"),
          h(Button, { key: "s", tone: "primary", onClick: exportSaveAndGo, "data-testid": "btn-export-choice-save" }, "\u4FDD\u5B58\u5E76\u5BFC\u51FA")
        ]
      },
      h(
        "div",
        { style: { fontSize: 13, lineHeight: 1.7 } },
        "\u5F53\u524D\u8282\u70B9\u7684\u6B63\u6587\u6709\u672A\u4FDD\u5B58\u4FEE\u6539\u3002\u5BFC\u51FA docx \u8BFB\u53D6\u7684\u662F\u78C1\u76D8\u4E0A\u7684\u5185\u5BB9\uFF0C\u8BF7\u5148\u9009\u62E9\u5BFC\u51FA\u65B9\u5F0F\uFF1A"
      ),
      h(
        "div",
        { style: { marginTop: 10, display: "grid", gap: 6, fontSize: 11.5, opacity: 0.82, lineHeight: 1.6 } },
        h("div", null, "\xB7 \u4FDD\u5B58\u5E76\u5BFC\u51FA\uFF1A\u5148\u4FDD\u5B58\u5F53\u524D\u6B63\u6587\uFF08\u5199\u5165\u78C1\u76D8\uFF09\uFF0C\u518D\u5BFC\u51FA"),
        h("div", null, "\xB7 \u4EC5\u5BFC\u51FA\u5F53\u524D\u78C1\u76D8\u7248\uFF1A\u4E0D\u4FDD\u5B58\u672C\u6B21\u4FEE\u6539\uFF0C\u76F4\u63A5\u5BFC\u51FA\u78C1\u76D8\u4E0A\u7684\u65E7\u5185\u5BB9\uFF08\u672C\u5730\u7F16\u8F91\u4ECD\u4FDD\u7559\uFF0C\u53EF\u7A0D\u540E\u518D\u4FDD\u5B58\uFF09"),
        h("div", null, "\xB7 \u53D6\u6D88\uFF1A\u56DE\u5230\u753B\u5E03\u7EE7\u7EED\u7F16\u8F91")
      )
    ) : null,
    drawerJob ? h(JobDrawer, {
      projectId: project.id,
      jobId: drawerJob.jobId,
      onClose: () => {
        setDrawerJob(null);
        refreshActiveJobs();
      },
      onJobChanged: refreshActiveJobs,
      toast,
      confirm
    }) : null
  );
}
function App() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [current, setCurrent] = useState(null);
  const [newOpen, setNewOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [confirmState, setConfirmState] = useState(null);
  const showToast = useCallback((t) => {
    setToast(t);
    window.clearTimeout(showToast._timer);
    const duration = t && Number(t.duration) || 3e3;
    showToast._timer = window.setTimeout(() => setToast(null), duration);
  }, []);
  const confirm = useCallback((opts) => new Promise((resolve) => {
    setConfirmState({ opts: opts || {}, resolve });
  }), []);
  const resolveConfirm = (result) => {
    setConfirmState((st) => {
      if (st && typeof st.resolve === "function") st.resolve(result);
      return null;
    });
  };
  const reloadProjects = useCallback(async () => {
    try {
      const rows = await api.listProjects();
      setProjects(rows);
      setError("");
    } catch (e) {
      setError("\u9879\u76EE\u5217\u8868\u8BFB\u53D6\u5931\u8D25\uFF1A" + e.message + "\uFF08\u5DF2\u4FDD\u7559\u4E0A\u6B21\u7ED3\u679C\uFF09");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    reloadProjects();
  }, [reloadProjects]);
  const restoreLastRef = useRef(false);
  const restoreLastProject = useCallback(async () => {
    let last = null;
    try {
      last = window.localStorage.getItem("moxi:lastProject");
    } catch {
      return;
    }
    if (!last) return;
    try {
      const r = await api.getProject(last);
      setCurrent({ project: r.project, canvas: r.canvas, rev: r.canvas.rev });
    } catch {
      try {
        window.localStorage.removeItem("moxi:lastProject");
      } catch {
      }
      showToast({ kind: "error", text: "\u672A\u627E\u5230\u4E0A\u6B21\u6253\u5F00\u7684\u9879\u76EE\uFF0C\u8BF7\u4ECE\u5217\u8868\u9009\u62E9", duration: 6e3 });
    }
  }, [showToast]);
  useEffect(() => {
    if (current) {
      try {
        window.localStorage.setItem("moxi:lastProject", current.project.id);
      } catch {
      }
      return;
    }
    if (restoreLastRef.current) return;
    restoreLastRef.current = true;
    restoreLastProject();
  }, [current && current.project.id, restoreLastProject]);
  const openProject = useCallback(async (projectId) => {
    try {
      const r = await api.getProject(projectId);
      setCurrent({ project: r.project, canvas: r.canvas, rev: r.canvas.rev });
    } catch (e) {
      showToast({ kind: "error", text: "\u6253\u5F00\u5931\u8D25\uFF1A" + e.message });
    }
  }, [showToast]);
  const refresh = useCallback(async () => {
    if (!current) return;
    try {
      const r = await api.getProject(current.project.id);
      setCurrent({ project: r.project, canvas: r.canvas, rev: r.canvas.rev });
    } catch {
    }
  }, [current && current.project.id]);
  useEffect(() => {
    if (!current) return void 0;
    const t = window.setInterval(async () => {
      try {
        const r = await api.getRev(current.project.id);
        if (r.rev !== current.rev) await refresh();
      } catch {
      }
    }, 2e3);
    return () => window.clearInterval(t);
  }, [current && current.project.id, current && current.rev, refresh]);
  const createProject = async (input) => {
    setBusy(true);
    try {
      const r = await api.createProject(input);
      setNewOpen(false);
      showToast({ kind: "success", text: "\u9879\u76EE\u5DF2\u521B\u5EFA" });
      await reloadProjects();
      await openProject(r.project.id);
    } catch (e) {
      showToast({ kind: "error", text: e.message });
    } finally {
      setBusy(false);
    }
  };
  const deleteProject = async (p) => {
    const ok = await confirm({
      title: "\u5220\u9664\u9879\u76EE",
      message: `\u786E\u8BA4\u5220\u9664\u9879\u76EE\u300C${p.title}\u300D\uFF1F`,
      detail: "\u4F1A\u79FB\u5230\u78C1\u76D8\u56DE\u6536\u7AD9\uFF08.trash\uFF09\uFF0C\u53EF\u5728\u78C1\u76D8\u4E0A\u627E\u56DE\u3002\u6B64\u64CD\u4F5C\u4E0D\u53EF\u7528\u64A4\u9500\u6309\u94AE\u6062\u590D\u3002",
      danger: true,
      confirmText: "\u5220\u9664\u5230\u56DE\u6536\u7AD9"
    });
    if (!ok) return;
    try {
      await api.deleteProject(p.id);
      showToast({ kind: "success", text: "\u5DF2\u79FB\u5230\u56DE\u6536\u7AD9" });
      await reloadProjects();
    } catch (e) {
      showToast({ kind: "error", text: "\u5220\u9664\u5931\u8D25\uFF1A" + e.message });
    }
  };
  return h(
    "div",
    { className: "moxi-app moxi-paper-bg", style: { height: "100%", width: "100%", boxSizing: "border-box", overflow: "hidden", background: TOKENS.bg, color: TOKENS.text } },
    current ? h(CanvasView, {
      project: current.project,
      canvas: current.canvas,
      rev: current.rev,
      onBack: () => {
        try {
          window.localStorage.removeItem("moxi:lastProject");
        } catch {
        }
        setCurrent(null);
        reloadProjects();
      },
      onChanged: refresh,
      toast: showToast,
      confirm
    }) : h(ProjectsView, {
      projects,
      loading,
      error,
      onCreate: () => setNewOpen(true),
      onOpen: openProject,
      onDelete: deleteProject,
      onRefresh: reloadProjects
    }),
    newOpen ? h(NewProjectModal, { onClose: () => setNewOpen(false), onSubmit: createProject, busy }) : null,
    confirmState ? h(ConfirmModal, {
      ...confirmState.opts,
      onConfirm: () => resolveConfirm(true),
      onCancel: () => resolveConfirm(false)
    }) : null,
    h(Toast, { toast })
  );
}

// dsh/bundles/moxi-canvas/src/skin.js
var import_react3 = __toESM(require("react"), 1);
var h2 = import_react3.default.createElement;
var SKIN_KEY = "moxi:skin";
var INK = {
  paper: "#F4F0E7",
  paperDeep: "#EAE3D6",
  card: "#FBF8F1",
  ink: "#252A2B",
  inkSoft: "#5B6163",
  inkFaint: "#8C9194",
  accent: "#A44736",
  accentSoft: "#C4705C",
  border: "#D8CEC0",
  borderSoft: "#E7DFD2",
  gold: "#B08A4A"
};
var INK_DARK = {
  paper: "#191A1B",
  paperDeep: "#202224",
  card: "#232628",
  ink: "#EDE6DA",
  inkSoft: "#A9A29A",
  inkFaint: "#7C7873",
  accent: "#D2765F",
  accentSoft: "#B9634E",
  border: "#3A3630",
  borderSoft: "#2C2A26",
  gold: "#C9A46A"
};
function tokensOf(c) {
  return {
    "--dsw-alias-bg-base": c.paper,
    "--dsw-alias-bg-layer-1": c.card,
    "--dsw-alias-bg-layer-2": c.paperDeep,
    "--dsw-alias-bg-overlay": c.card,
    "--dsw-alias-border-l1": c.borderSoft,
    "--dsw-alias-border-l2": c.border,
    "--dsw-alias-brand-primary": c.accent,
    "--dsw-alias-label-primary": c.ink,
    "--dsw-alias-label-secondary": c.inkSoft,
    "--dsw-alias-state-error-primary": "#B23A32",
    "--dsw-alias-state-idle-primary": c.inkFaint,
    "--dsw-alias-state-success-primary": "#4E7A4B",
    "--dsw-alias-state-warn-primary": c.gold,
    "--dsw-specific-sidebar-fill": c.paperDeep
  };
}
function inkCss(c) {
  return `
  :root {
    --moxi-paper: ${c.paper};
    --moxi-card: ${c.card};
    --moxi-ink: ${c.ink};
    --moxi-ink-soft: ${c.inkSoft};
    --moxi-accent: ${c.accent};
    --moxi-border: ${c.border};
    --moxi-serif: "Songti SC", "STSong", "Noto Serif SC", "Source Han Serif SC", serif;
    --moxi-sans: "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", system-ui, sans-serif;
  }
  body.moxi-skin { font-family: var(--moxi-sans); }
  body.moxi-skin .moxi-app,
  body.moxi-skin .moxi-panel { font-family: var(--moxi-sans); color: var(--moxi-ink); }
  body.moxi-skin .moxi-serif { font-family: var(--moxi-serif); letter-spacing: .02em; }
  body.moxi-skin .moxi-title { font-family: var(--moxi-serif); font-weight: 600; letter-spacing: .04em; }
  body.moxi-skin .moxi-paper-bg {
    background-color: var(--moxi-paper);
    background-image:
      radial-gradient(1200px 600px at 15% -10%, rgba(164,71,54,.05), transparent 60%),
      radial-gradient(900px 500px at 110% 10%, rgba(176,138,74,.06), transparent 60%),
      url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='160' height='160' filter='url(%23n)' opacity='0.035'/></svg>");
  }
  body.moxi-skin .moxi-card {
    background: var(--moxi-card);
    border: 1px solid var(--moxi-border);
    box-shadow: 0 1px 0 rgba(37,42,43,.04), 0 8px 24px -18px rgba(37,42,43,.35);
  }
  body.moxi-skin .moxi-stamp {
    font-family: var(--moxi-serif); color: var(--moxi-accent);
    border: 1px solid var(--moxi-accent); border-radius: 4px;
    padding: 1px 6px; font-size: 10px; letter-spacing: .12em; opacity: .9;
  }
  body.moxi-skin .moxi-hairline { background: linear-gradient(90deg, transparent, var(--moxi-border), transparent); height: 1px; }
  body.moxi-skin ::-webkit-scrollbar { width: 9px; height: 9px; }
  body.moxi-skin ::-webkit-scrollbar-thumb { background: ${c.border}; border-radius: 9px; border: 2px solid ${c.paper}; }
  body.moxi-skin ::-webkit-scrollbar-track { background: transparent; }
  @media (prefers-reduced-motion: reduce) { body.moxi-skin * { transition-duration: .01ms !important; animation-duration: .01ms !important; } }
  `;
}
function ensureStyle(id, css) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement("style");
    el.id = id;
    document.head.appendChild(el);
  }
  el.textContent = css;
  return el;
}
function installSkin(ctx) {
  const disposeTheme = ctx.theme.register({
    id: "moxi-ink",
    colorScheme: "light",
    tokens: tokensOf(INK)
  });
  const disposeThemeDark = ctx.theme.register({
    id: "moxi-ink-dark",
    colorScheme: "dark",
    tokens: tokensOf(INK_DARK)
  });
  let scheme = "light";
  let hostPreference = null;
  const apply = (skin) => {
    try {
      window.localStorage.setItem(SKIN_KEY, skin);
    } catch {
    }
    const dark = scheme === "dark";
    if (skin === "ink") {
      document.body.classList.add("moxi-skin");
      ensureStyle("moxi-ink-style", inkCss(dark ? INK_DARK : INK));
      if (hostPreference == null) {
        try {
          const snap = ctx.theme.getTheme();
          hostPreference = snap && snap.preference || "system";
        } catch {
          hostPreference = "system";
        }
      }
      ctx.theme.setTheme(dark ? "moxi-ink-dark" : "moxi-ink");
    } else {
      document.body.classList.remove("moxi-skin");
      const el = document.getElementById("moxi-ink-style");
      if (el) el.remove();
      if (hostPreference != null) {
        ctx.theme.setTheme(hostPreference);
        hostPreference = null;
      }
    }
  };
  const readSkin = () => {
    try {
      return window.localStorage.getItem(SKIN_KEY) || "ink";
    } catch {
      return "ink";
    }
  };
  const syncScheme = () => {
    try {
      const snap = ctx.theme.getTheme();
      scheme = snap && snap.active ? snap.active.colorScheme : "light";
    } catch {
      scheme = "light";
    }
  };
  syncScheme();
  apply(readSkin());
  const onTheme = () => {
    syncScheme();
    if (readSkin() === "ink") apply("ink");
  };
  ctx.effect(() => ctx.on("theme/change", onTheme));
  ctx.effect(() => {
    if (typeof window.matchMedia !== "function") return () => {
    };
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      scheme = mq.matches ? "dark" : "light";
      if (readSkin() === "ink") apply("ink");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  });
  const api2 = {
    getSkin: readSkin,
    setSkin: (s) => apply(s === "host" ? "host" : "ink")
  };
  try {
    window.__moxiSkin = api2;
  } catch {
  }
  return api2;
}
function BrandMark(props) {
  const size = props && props.size || 26;
  const mark = INK.accent;
  return h2(
    "svg",
    {
      viewBox: "0 0 32 32",
      width: size,
      height: size,
      "aria-hidden": true,
      style: { display: "block" }
    },
    // 墨滴
    h2("path", {
      d: "M9 6.2c2.6 2.4 4.2 4.4 4.2 6.4a4.2 4.2 0 1 1-8.4 0c0-2 1.6-4 4.2-6.4z",
      fill: mark,
      opacity: 0.92
    }),
    // 场记板
    h2(
      "g",
      { transform: "translate(15.5 12)" },
      h2("rect", { x: 0, y: 0, width: 14, height: 11, rx: 2, fill: "none", stroke: mark, strokeWidth: 1.6 }),
      h2("path", { d: "M0 3.6h14", stroke: mark, strokeWidth: 1.4 }),
      h2("path", { d: "M2.6 0.8l2.2 2.6M7.4 0.8l2.2 2.6M12 0.8l1.6 2.4", stroke: mark, strokeWidth: 1.1, opacity: 0.75 })
    ),
    // 底部墨线
    h2("path", { d: "M6 28.5c5.5-1.6 14.5-1.6 20 0", stroke: mark, strokeWidth: 1.3, opacity: 0.35, fill: "none" })
  );
}
function registerBrandMark(ctx) {
  if (!ctx.slots) return;
  const visible = () => {
    try {
      return (window.localStorage.getItem(SKIN_KEY) || "ink") === "ink";
    } catch {
      return true;
    }
  };
  ctx.slots.inject("sidebar.brand.mark", () => ctx.slots.inject("sidebar.brand.name", function* () {
    yield ctx.slots.register({ name: "sidebar.brand.mark" }, (props) => {
      if (!visible()) return null;
      return h2(BrandMark, { size: props && props.size || 26 });
    });
    yield ctx.slots.register({ name: "sidebar.brand.name" }, () => {
      if (!visible()) return null;
      return h2(
        "div",
        {
          className: "moxi-serif",
          style: { display: "flex", alignItems: "baseline", gap: 7, whiteSpace: "nowrap" }
        },
        h2("span", { style: { fontSize: 15, letterSpacing: ".16em", color: "var(--moxi-ink, #252A2B)" } }, "\u58A8\u620F\u751F\u82B1"),
        h2("span", { style: { fontSize: 9.5, letterSpacing: ".22em", opacity: 0.55, color: "var(--moxi-ink, #252A2B)" } }, "MOXI")
      );
    });
  }));
}

// dsh/bundles/moxi-canvas/src/client.jsx
function SidebarIcon(props) {
  const size = props && props.size || 20;
  const active = !!(props && props.active);
  return import_react4.default.createElement(
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
    import_react4.default.createElement("rect", { x: 3, y: 3, width: 7, height: 7, rx: 1.5 }),
    import_react4.default.createElement("rect", { x: 14, y: 3, width: 7, height: 7, rx: 1.5 }),
    import_react4.default.createElement("rect", { x: 3, y: 14, width: 7, height: 7, rx: 1.5 }),
    import_react4.default.createElement("path", { d: "M14 17.5h7M17.5 14v7" })
  );
}
var client_default = {
  inject: ["slots", "theme"],
  apply(ctx) {
    try {
      installSkin(ctx);
    } catch (err) {
      console.warn("[moxi] skin failed:", err);
    }
    try {
      registerBrandMark(ctx);
    } catch (err) {
      try {
        window.__moxiBrandErr = String(err && err.message || err);
      } catch {
      }
    }
    ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({
      name: "sidebar.panellist",
      id: "moxi-canvas",
      order: 30,
      label: "\u58A8\u620F\u753B\u5E03"
    }, SidebarIcon));
    ctx.slots.inject("main", () => ctx.slots.register({
      name: "main",
      key: "moxi-canvas"
    }, App));
  }
};

    var plugin = module.exports;
    if (plugin && plugin.default) plugin = plugin.default;
    return plugin;
  },
});
