/* app.js — 简历工作台主逻辑（校招版）
 * 依赖：templates.js / engine.js / export.js / ai.js / builtin-single-file.js（可选）
 */
(function () {
  "use strict";

  var T = window.RESUME_TEMPLATES || {};
  var Engine = window.ResumeEngine;
  var Ex = window.ResumeExport;
  var AI = window.ResumeAI;

  /* 当前渲染是否为英文简历模式（由 renderResumeHTML 设置） */
  var isEnglish = false;

  var STORE_KEY = "resumeKit:state:v1";
  var THEME_KEY = "resumeKit:theme";

  /* ---------- 小工具 ---------- */

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  var uidCounter = 0;
  function uid() { return "id" + (++uidCounter) + "_" + Date.now().toString(36); }

  function hasText(v) { return typeof v === "string" && v.trim().length > 0; }
  function j(v) { return (v == null ? "" : String(v)).trim(); }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function debounce(fn, ms) {
    var t = null;
    return function () {
      var args = arguments, self = this;
      if (t) clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  }

  /* ---------- 存储适配（file:// 下 localStorage 可能受限，降级内存） ---------- */
  var memStore = {};
  var storageOK = true;
  try {
    var probe = "__resume_kit_probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
  } catch (e) { storageOK = false; }

  function storeGet(key) {
    if (storageOK) { try { return window.localStorage.getItem(key); } catch (e) { /* fallthrough */ } }
    return memStore[key] || null;
  }
  function storeSet(key, val) {
    memStore[key] = val;
    if (storageOK) { try { window.localStorage.setItem(key, val); } catch (e) { /* ignore */ } }
  }

  /* ---------- 数据模型 ---------- */

  function emptyResume() {
    return {
      basic: { name: "", gender: "", birth: "", phone: "", email: "", city: "", website: "", github: "", photo: "" },
      target: { position: "", industry: "", city: "", salary: "", availability: "", jobType: "校招" },
      education: [],
      internships: [],
      projects: [],
      campus: [],
      research: [],
      awards: [],
      skills: [],
      evaluation: "",
      extra: ""
    };
  }

  function defaultState() {
    return {
      resume: emptyResume(),
      templateId: "tech",
      style: "blue",
      compactMode: false,
      variant: "targeted",
      jdText: "",
      followups: {},
      sections: { order: templateOrder(T.tech), hidden: {} },
      tracker: [],
      checklist: JSON.parse(JSON.stringify(window.RESUME_CHECKLIST_DEFAULT || [])),
      english: { enabled: false, resume: null, updatedAt: 0 },
      updatedAt: 0
    };
  }

  /* ---------- 板块管理（顺序 + 隐藏） ---------- */

  /* 模板 sectionOrder 使用单数 key（internship/project/award/skill），统一映射到数据 key */
  var KEY_MAP = { internship: "internships", project: "projects", award: "awards", skill: "skills" };
  /* 可管理的板块（基本信息固定置顶，不可隐藏/移动） */
  var CANONICAL_ORDER = ["target", "education", "internships", "projects", "campus", "research", "awards", "skills", "evaluation", "extra"];

  /* 由模板顺序导出规范板块顺序（保证覆盖全部板块） */
  function templateOrder(tpl) {
    var src = (tpl && tpl.sectionOrder) || [];
    var order = src.map(function (k) { return KEY_MAP[k] || k; })
      .filter(function (k) { return CANONICAL_ORDER.indexOf(k) >= 0; });
    CANONICAL_ORDER.forEach(function (k) { if (order.indexOf(k) < 0) order.push(k); });
    return order;
  }

  function sectionOrder() {
    return (state.sections && state.sections.order) || CANONICAL_ORDER.slice();
  }
  function isSectionHidden(key) {
    return !!(state.sections && state.sections.hidden && state.sections.hidden[key]);
  }
  /* 保证 resume 数据结构完整（兼容旧存档：补缺的数组/对象字段） */
  function ensureResumeShape() {
    var r = state.resume;
    ["education", "internships", "projects", "campus", "research", "awards", "skills"].forEach(function (k) {
      if (!Array.isArray(r[k])) r[k] = [];
    });
    if (!r.basic || typeof r.basic !== "object") r.basic = {};
    if (!r.target || typeof r.target !== "object") r.target = {};
    if (typeof r.evaluation !== "string") r.evaluation = "";
    if (typeof r.extra !== "string") r.extra = "";
    if (!state.followups || typeof state.followups !== "object") state.followups = {};
  }
  /* 保证 sections 结构完整（兼容旧存档） */
  function normalizeSections() {
    var order = sectionOrder().filter(function (k) { return CANONICAL_ORDER.indexOf(k) >= 0; });
    CANONICAL_ORDER.forEach(function (k) { if (order.indexOf(k) < 0) order.push(k); });
    state.sections = { order: order, hidden: (state.sections && state.sections.hidden) || {} };
  }
  /* 剔除隐藏板块后的简历副本（用于 AI 请求等） */
  function visibleResume() {
    return deriveResumeVariant(state.variant);
  }

  function cloneJSON(v) {
    return JSON.parse(JSON.stringify(v));
  }

  function variantMeta() {
    return {
      detailed: { id: "detailed", name: "完整版", desc: "保留更多细节，适合底稿与深度沟通" },
      targeted: { id: "targeted", name: "通用投递版", desc: "默认一页优先，保留高价值信息" },
      internet: { id: "internet", name: "互联网 JD 裁剪版", desc: "结合 JD 关键词裁剪，优先命中互联网岗位" }
    };
  }

  function normalizeJDText(text) {
    return String(text || "").replace(/\r/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  function keywordRegExp(kw) {
    var escKw = String(kw || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (/^[A-Za-z0-9_+.\/#-]+$/.test(kw)) return new RegExp("\\b" + escKw + "\\b", "i");
    return new RegExp(escKw, "i");
  }

  function jdKeywords(text) {
    var norm = normalizeJDText(text);
    if (!norm) return [];
    var matches = norm.match(/[A-Za-z][A-Za-z0-9.+#/-]{1,}|[\u4e00-\u9fa5]{2,12}/g) || [];
    var stop = {
      负责: 1, 熟悉: 1, 具备: 1, 优先: 1, 相关: 1, 能力: 1, 工作: 1, 岗位: 1, 要求: 1,
      以上: 1, 以及: 1, 参与: 1, 经验: 1, 互联网: 1, 公司: 1, 业务: 1, 团队: 1
    };
    var seen = Object.create(null);
    var out = [];
    matches.forEach(function (kw) {
      var item = String(kw || "").trim();
      if (!item) return;
      var lower = item.toLowerCase();
      if (seen[lower] || stop[item]) return;
      if (/^[A-Za-z]$/.test(item)) return;
      seen[lower] = true;
      out.push(item);
    });
    return out.slice(0, 24);
  }

  function textWeight(text, keywords) {
    var v = String(text || "");
    var score = 0;
    if (/\d/.test(v)) score += 2;
    if (/%|万|千|百|次|人|ms|s|qps|ctr|roi|gmv|留存|转化/i.test(v)) score += 2;
    (keywords || []).forEach(function (kw) {
      if (!kw) return;
      var hit = /^[A-Za-z0-9_+.\/#-]+$/.test(kw)
        ? new RegExp("\\b" + kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i").test(v)
        : v.indexOf(kw) >= 0;
      if (hit) score += 3;
    });
    return score;
  }

  function trimBulletLines(text, options) {
    var lines = String(text || "").split(/\r?\n/).map(function (line) { return line.trim(); }).filter(Boolean);
    if (!lines.length) return "";
    var keywords = (options && options.keywords) || [];
    var maxLines = options && options.maxLines;
    var maxChars = options && options.maxChars;
    lines = lines.map(function (line, index) {
      return { line: line, index: index, score: textWeight(line, keywords) + (index === 0 ? 1 : 0) };
    }).sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return a.index - b.index;
    });
    if (maxLines && lines.length > maxLines) lines = lines.slice(0, maxLines);
    lines.sort(function (a, b) { return a.index - b.index; });
    var out = lines.map(function (it) { return it.line; });
    if (maxChars) {
      out = out.map(function (line) {
        if (line.length <= maxChars) return line;
        return line.slice(0, Math.max(18, maxChars)).replace(/[，,；;：:\s]+$/, "");
      });
    }
    return out.join("\n");
  }

  function deriveResumeVariant(variantId, options) {
    var variant = variantId || state.variant || "targeted";
    var opts = options || {};
    var shortenCore = !!opts.shortenCore;
    var r = cloneJSON(state.resume);
    CANONICAL_ORDER.forEach(function (k) { if (isSectionHidden(k)) delete r[k]; });
    if (variant === "detailed") return r;
    var tpl = T[state.templateId] || T.tech;
    var keywords = (tpl.keywords || []).slice(0, 12).concat(jdKeywords(state.jdText));
    ["internships", "projects", "campus", "research"].forEach(function (key) {
      (r[key] || []).forEach(function (item) {
        if (!item) return;
        if (!shortenCore && (key === "internships" || key === "projects")) return;
        if (key === "research") item.note = trimBulletLines(item.note, { keywords: keywords, maxLines: variant === "internet" ? 2 : 3, maxChars: variant === "internet" ? 52 : 72 });
        else item.content = trimBulletLines(item.content, { keywords: keywords, maxLines: variant === "internet" ? 2 : 3, maxChars: variant === "internet" ? 52 : 72 });
      });
    });
    if (variant === "internet" && shortenCore) {
      (r.education || []).forEach(function (item) {
        if (!item) return;
        if (hasText(item.courses)) item.courses = trimBulletLines(item.courses.replace(/[、；;，]/g, "\n"), { keywords: keywords, maxLines: 2, maxChars: 36 }).replace(/\n/g, "、");
        if (hasText(item.honors)) item.honors = trimBulletLines(item.honors.replace(/[、；;，]/g, "\n"), { keywords: keywords, maxLines: 2, maxChars: 32 }).replace(/\n/g, "、");
      });
      if (hasText(r.evaluation)) r.evaluation = trimBulletLines(r.evaluation.replace(/[。；;]+/g, "\n"), { keywords: keywords, maxLines: 2, maxChars: 40 });
      if (hasText(r.extra)) r.extra = trimBulletLines(r.extra.replace(/[。；;]+/g, "\n"), { keywords: keywords, maxLines: 2, maxChars: 40 });
    }
    return r;
  }

  function loadState() {
    try {
      var raw = storeGet(STORE_KEY);
      if (raw) {
        var d = JSON.parse(raw);
        if (d && d.resume) return Object.assign(defaultState(), d);
      }
    } catch (e) { /* ignore */ }
    var boot = window.__RESUME_KIT_BOOT_DATA__;
    if (boot && boot.resume) {
      var s = defaultState();
      s.resume = Object.assign(emptyResume(), boot.resume);
      return s;
    }
    return defaultState();
  }

  var state = loadState();
  var saveTimer = null;
  var lastSavedAt = 0;
  var lastCompressionSnapshot = null;
  var printFitRequested = false;
  var BUILD_ID = "2025-08-19-compress-fix";

  function saveState(force) {
    if (saveTimer && !force) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    state.updatedAt = Date.now();
    try {
      storeSet(STORE_KEY, JSON.stringify(state));
      lastSavedAt = Date.now();
      showSaveStatus("已自动保存 " + timeHM());
    } catch (e) {
      showSaveStatus("保存失败（存储不可用）");
    }
  }
  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { saveState(true); }, 400);
  }
  function timeHM() {
    var d = new Date();
    function p(n) { return (n < 10 ? "0" : "") + n; }
    return p(d.getHours()) + ":" + p(d.getMinutes());
  }
  function showSaveStatus(text) {
    var el = $("#saveStatus");
    if (el) { el.textContent = text; el.classList.add("saved"); }
  }

  /* ---------- 表单 Schema ---------- */

  var BASIC_FIELDS = [
    { k: "name", label: "姓名", type: "text", ph: "张三" },
    { k: "gender", label: "性别", type: "select", options: ["", "男", "女"] },
    { k: "birth", label: "出生年月", type: "text", ph: "2002.06" },
    { k: "phone", label: "手机号", type: "tel", ph: "138****8888" },
    { k: "email", label: "邮箱", type: "email", ph: "name@example.com" },
    { k: "city", label: "所在城市", type: "text", ph: "北京" },
    { k: "website", label: "个人主页", type: "text", ph: "https://" },
    { k: "github", label: "GitHub", type: "text", ph: "github.com/yourname" }
  ];

  var TARGET_FIELDS = [
    { k: "position", label: "目标岗位", type: "text", ph: "后端开发工程师（校招）", req: true },
    { k: "industry", label: "意向行业", type: "text", ph: "互联网 / 国企 / 银行" },
    { k: "city", label: "意向城市", type: "text", ph: "北京 / 上海 / 深圳" },
    { k: "salary", label: "期望薪资", type: "text", ph: "15-20K" },
    { k: "availability", label: "可到岗时间", type: "text", ph: "2025.07 毕业后" },
    { k: "jobType", label: "求职类型", type: "select", options: ["校招", "实习转正", "实习"] }
  ];

  /* 全部可管理板块的定义（key 与数据字段一致） */
  var SECTION_DEFS = {
    target: { key: "target", title: "求职意向", tip: "校招建议填写目标岗位，HR 据此判断匹配度；不需要可隐藏", kind: "object", fields: TARGET_FIELDS },
    education: { key: "education", title: "教育背景", tip: "从最高学历写起", kind: "list", fields: [
      { k: "school", label: "学校", type: "text", ph: "XX大学", req: true },
      { k: "major", label: "专业", type: "text", ph: "计算机科学与技术", req: true },
      { k: "degree", label: "学历", type: "select", options: ["", "本科", "硕士", "博士", "大专"] },
      { k: "start", label: "入学时间", type: "month" },
      { k: "end", label: "毕业时间", type: "month" },
      { k: "gpa", label: "GPA", type: "text", ph: "3.7/4.0" },
      { k: "rank", label: "排名", type: "text", ph: "前 10%" },
      { k: "courses", label: "主修课程", type: "text", ph: "数据结构、操作系统、计算机网络", full: true },
      { k: "honors", label: "在校荣誉", type: "text", ph: "校级优秀学生、一等奖学金", full: true }
    ]},
    internships: { key: "internships", title: "实习经历", tip: "按「动作 + 规模 + 结果」写，尽量量化", kind: "list", fields: [
      { k: "company", label: "公司", type: "text", ph: "XX科技有限公司", req: true },
      { k: "title", label: "职位", type: "text", ph: "后端开发实习生", req: true },
      { k: "start", label: "开始时间", type: "month" },
      { k: "end", label: "结束时间", type: "month", now: true },
      { k: "content", label: "工作内容（每行一个要点，可用 **加粗** 强调关键词）", type: "textarea", full: true, ph: "负责 **XX模块** 的开发，使用XX技术解决了XX问题，使 **XX提升XX%**。" }
    ]},
    projects: { key: "projects", title: "项目经历", tip: "校招重点板块：背景 → 你的职责 → 难点 → 量化结果", kind: "list", fields: [
      { k: "name", label: "项目名称", type: "text", ph: "校园二手交易平台", req: true },
      { k: "role", label: "你的角色", type: "text", ph: "后端开发（负责人）" },
      { k: "tech", label: "技术栈", type: "text", ph: "Spring Boot + MySQL + Redis" },
      { k: "start", label: "开始时间", type: "month" },
      { k: "end", label: "结束时间", type: "month", now: true },
      { k: "content", label: "项目描述（每行一个要点，可用 **加粗** 强调关键词）", type: "textarea", full: true, ph: "项目背景…\n我负责 **核心模块设计** …\n结果：**QPS/耗时/用户量** …" }
    ]},
    campus: { key: "campus", title: "校园经历", tip: "社团/学生会/志愿活动，同样要量化", kind: "list", fields: [
      { k: "org", label: "组织/活动", type: "text", ph: "校学生会", req: true },
      { k: "role", label: "职务", type: "text", ph: "外联部部长" },
      { k: "start", label: "开始时间", type: "month" },
      { k: "end", label: "结束时间", type: "month", now: true },
      { k: "content", label: "内容（每行一个要点）", type: "textarea", full: true, ph: "组织XX活动，覆盖XX人…" }
    ]},
    research: { key: "research", title: "科研成果", tip: "论文/专利/软著/竞赛：写清类型、名称、你的位置与发表信息", kind: "list", fields: [
      { k: "kind", label: "类型", type: "select", options: ["", "论文", "专利", "软件著作权", "竞赛获奖", "其他"] },
      { k: "title", label: "名称", type: "text", ph: "论文标题 / 专利名称（如：一种基于XX的XX方法）", req: true },
      { k: "role", label: "你的位置", type: "text", ph: "第一作者 / 共同一作 / 第三作者 / 发明人（排序2）" },
      { k: "venue", label: "发表/授权信息", type: "text", ph: "期刊/会议名 + 分区或影响因子，如：IEEE TIP（SCI 一区）" },
      { k: "date", label: "时间", type: "month" },
      { k: "note", label: "补充说明", type: "textarea", full: true, ph: "如：影响因子 8.3、他引 12 次、已授权/实审中、获奖级别" }
    ]},
    awards: { key: "awards", title: "荣誉奖项", tip: "注明级别（校级/省级/国家级）更有分量", kind: "list", fields: [
      { k: "name", label: "奖项名称", type: "text", ph: "全国大学生数学建模竞赛", req: true },
      { k: "level", label: "级别", type: "select", options: ["", "国家级", "省级", "市级", "校级", "其他"] },
      { k: "date", label: "获奖时间", type: "month" }
    ]},
    skills: { key: "skills", title: "技能", tip: "按分类填写，如：语言/框架/工具/证书", kind: "list", fields: [
      { k: "category", label: "分类", type: "text", ph: "编程语言", req: true },
      { k: "items", label: "内容", type: "text", ph: "Java（熟练）、Python（掌握）、SQL（熟练）", req: true, full: true }
    ]},
    evaluation: { key: "evaluation", title: "自我评价", tip: "2-3 条与岗位相关的硬事实，别写空话", kind: "single", rows: 4, ph: "如：独立完成 3 个上线项目；LeetCode 300+；开源社区 contributor…" },
    extra: { key: "extra", title: "其他（可选）", tip: "作品集链接、补充说明等", kind: "single", rows: 3, ph: "补充说明" }
  };

  /* ---------- 表单渲染 ---------- */

  function fieldHTML(path, f, val) {
    var v = val == null ? "" : val;
    var req = f.req ? ' <span style="color:var(--danger)">*</span>' : "";
    var cls = f.full ? ' class="form-field full"' : ' class="form-field"';
    var label = '<label>' + esc(f.label) + req + '</label>';
    var inner = "";
    if (f.type === "select") {
      var opts = (f.options || []).map(function (o) {
        return '<option value="' + esc(o) + '"' + (String(v) === o ? " selected" : "") + ">" + esc(o || "（请选择）") + "</option>";
      }).join("");
      inner = '<select data-path="' + path + '">' + opts + "</select>";
    } else if (f.type === "textarea") {
      inner = '<textarea data-path="' + path + '" rows="4" placeholder="' + esc(f.ph || "") + '">' + esc(v) + "</textarea>";
    } else if (f.type === "month") {
      if (f.now && String(v) === "至今") {
        inner = '<span style="display:inline-flex;align-items:center;height:34px;padding:0 12px;border:1px solid var(--border);border-radius:8px;color:var(--text);background:var(--bg);font-size:13px">至今</span>' +
          '<button type="button" class="btn small ghost" data-now-off="' + path + '" style="margin-left:6px" title="改为选择具体日期">选日期</button>';
      } else {
        inner = '<input data-path="' + path + '" type="month" value="' + esc(v) + '">' +
          (f.now ? '<button type="button" class="btn small ghost" data-now-on="' + path + '" style="margin-left:6px" title="结束时间填至今">至今</button>' : "");
      }
    } else {
      inner = '<input data-path="' + path + '" type="' + (f.type || "text") + '" value="' + esc(v) + '" placeholder="' + esc(f.ph || "") + '">';
    }
    return '<div' + cls + ">" + label + inner + "</div>";
  }

  function listSectionHTML(section) {
    var list = state.resume[section.key] || [];
    var cards = list.map(function (item, i) {
      var fields = section.fields.map(function (f) {
        return fieldHTML(section.key + "." + i + "." + f.k, f, item[f.k]);
      });
      var title = "";
      var titleKeys = { education: "school", internships: "company", projects: "name", campus: "org", awards: "name", skills: "category" };
      var tk = titleKeys[section.key];
      if (tk && hasText(item[tk])) title = " — " + item[tk];
      return '<div class="entry-card">' +
        '<div class="entry-card-head"><span class="idx">' + section.title + " 第" + (i + 1) + "条" + esc(title) + '</span>' +
        '<button class="entry-remove" data-remove="' + section.key + '" data-index="' + i + '">✕ 删除</button></div>' +
        '<div class="form-grid">' + fields.join("") + "</div></div>";
    });
    return '<div class="form-section" data-section="' + section.key + '">' +
      '<div class="form-section-head"><h2>' + esc(section.title) + "</h2>" +
      '<span class="tip">' + esc(section.tip || "") + "</span>" +
      '<span class="chevron">▼</span></div>' +
      '<div class="form-section-body">' + cards.join("") +
      '<button class="add-btn" data-add="' + section.key + '">+ 添加' + esc(section.title) + "</button></div></div>";
  }

  function singleSectionHTML(section) {
    var v = state.resume[section.key] || "";
    var rows = section.rows || 3;
    return '<div class="form-section" data-section="' + section.key + '">' +
      '<div class="form-section-head"><h2>' + esc(section.title) + "</h2>" +
      '<span class="tip">' + esc(section.tip || "") + "</span>" +
      '<span class="chevron">▼</span></div>' +
      '<div class="form-section-body"><div class="form-grid">' +
      '<div class="form-field full"><textarea data-path="' + section.key + '" rows="' + rows + '" placeholder="' + esc(section.ph || "") + '">' + esc(v) + "</textarea></div>" +
      "</div></div></div>";
  }

  /* 板块管理卡片（顺序调整 + 显示/隐藏 + 恢复默认） */
  function managerHTML() {
    var rows = sectionOrder().map(function (key, i) {
      var def = SECTION_DEFS[key];
      if (!def) return "";
      var hidden = isSectionHidden(key);
      return '<div class="sec-mgr-row' + (hidden ? " hidden" : "") + '">' +
        '<span class="sec-mgr-idx">' + (i + 1) + "</span>" +
        '<span class="sec-mgr-name">' + esc(def.title) + "</span>" +
        (hidden ? '<span class="sec-mgr-badge">已隐藏</span>' : "") +
        '<span class="sec-mgr-actions">' +
        '<button type="button" class="btn small ghost" data-sec-up="' + key + '" title="上移">↑</button>' +
        '<button type="button" class="btn small ghost" data-sec-down="' + key + '" title="下移">↓</button>' +
        '<button type="button" class="btn small ghost" data-sec-toggle="' + key + '" title="' + (hidden ? "点击显示该板块" : "点击隐藏该板块（数据保留）") + '">' + (hidden ? "👁 显示" : "🙈 隐藏") + "</button>" +
        "</span></div>";
    }).join("");
    return '<div class="form-section sec-manager"><div class="form-section-head"><h2>板块管理</h2>' +
      '<span class="tip">调整顺序与显示（如求职意向可隐藏）</span><span class="chevron">▼</span></div>' +
      '<div class="form-section-body"><div class="sec-mgr-list">' + rows + "</div>" +
      '<button type="button" class="btn small ghost" data-sec-reset="1" style="margin-top:8px">↺ 恢复模板默认顺序与显示</button>' +
      '<div class="hint" style="font-size:11px;color:var(--text-2);margin-top:6px">隐藏板块仅不在简历中显示，数据不会丢失；基本信息固定置顶。</div>' +
      "</div></div>";
  }

  function renderSection(def) {
    if (def.kind === "object") return objectSectionHTML(def);
    if (def.kind === "single") return singleSectionHTML(def);
    return listSectionHTML(def);
  }

  function objectSectionHTML(def) {
    return '<div class="form-section" data-section="' + def.key + '"><div class="form-section-head"><h2>' + esc(def.title) + "</h2>" +
      '<span class="tip">' + esc(def.tip || "") + '</span><span class="chevron">▼</span></div>' +
      '<div class="form-section-body"><div class="form-grid">' +
      def.fields.map(function (f) { return fieldHTML(def.key + "." + f.k, f, state.resume[def.key][f.k]); }).join("") +
      "</div></div></div>";
  }

  function renderForm() {
    var pane = $("#formPane");
    var tpl = T[state.templateId] || T.tech;
    var variants = variantMeta();
    var tplSelect = '<div class="form-section"><div class="form-section-head"><h2>目标岗位</h2>' +
      '<span class="tip">先选投递方向，再写更有针对性的内容</span><span class="chevron">▼</span></div>' +
      '<div class="form-section-body"><div class="form-grid">' +
      '<div class="form-field"><select id="formTemplateSelect">' +
      Object.keys(T).map(function (k) {
        return '<option value="' + k + '"' + (state.templateId === k ? " selected" : "") + ">" + esc(T[k].name + " · " + T[k].desc) + "</option>";
      }).join("") +
      "</select>" +
      '<span class="hint">' + esc("当前目标岗位「" + tpl.name + "」：会影响示例内容、关键词体检和 AI 改写方向，但不会覆盖你自定义的板块顺序。") + "</span>" +
      "</div>" +
      '<div class="form-field full"><textarea id="jdTextInput" rows="4" placeholder="粘贴目标岗位 JD（可选）。用于关键词体检、AI 改写和投递建议更贴近岗位要求。">' + esc(state.jdText || "") + '</textarea>' +
      '<span class="hint">不填也能用；填写后体检和 AI 建议会更贴近目标岗位。</span></div>' +
      "</div></div></div></div>";

    var basic = '<div class="form-section" data-section="basic"><div class="form-section-head"><h2>基本信息</h2>' +
      '<span class="tip">*为必填，固定置顶</span><span class="chevron">▼</span></div><div class="form-section-body">' +
      '<div class="form-grid">' +
      BASIC_FIELDS.map(function (f) { return fieldHTML("basic." + f.k, f, state.resume.basic[f.k]); }).join("") +
      '</div><div class="photo-wrap" style="margin-top:10px">' +
      (hasText(state.resume.basic.photo)
        ? '<img id="photoPreview" src="' + esc(state.resume.basic.photo) + '" alt="照片">'
        : '<img id="photoPreview" src="" alt="" style="display:none">') +
      '<div><button id="btnPhoto" class="btn small">📷 上传照片</button> ' +
      '<button id="btnPhotoRemove" class="btn small ghost">移除</button>' +
      '<div class="hint" style="font-size:11px;color:var(--text-2)">选填；自动压缩，仅存本地</div>' +
      '<input id="photoInput" type="file" accept="image/*" style="display:none"></div></div></div></div>';

    var parts = [tplSelect, basic, managerHTML()];
    sectionOrder().forEach(function (key) {
      if (isSectionHidden(key)) return;
      var def = SECTION_DEFS[key];
      if (!def) return;
      parts.push(renderSection(def));
    });
    pane.innerHTML = parts.join("");
  }

  /* 按 data-path 写入状态 */
  function setByPath(path, value) {
    var seg = path.split(".");
    var obj = state.resume;
    for (var i = 0; i < seg.length - 1; i++) obj = obj[seg[i]];
    obj[seg[seg.length - 1]] = value;
  }

  function moveSection(key, dir) {
    var order = sectionOrder().slice();
    var i = order.indexOf(key);
    var j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    order.splice(i, 1);
    order.splice(j, 0, key);
    state.sections.order = order;
    renderForm(); schedulePreview(); saveState(true);
  }

  function toggleSection(key) {
    var hidden = (state.sections.hidden = state.sections.hidden || {});
    var def = SECTION_DEFS[key];
    if (hidden[key]) {
      delete hidden[key];
      toast("已显示「" + def.title + "」", "ok");
    } else {
      hidden[key] = true;
      toast("已隐藏「" + def.title + "」（数据保留，可在板块管理中恢复）", "ok");
    }
    renderForm(); schedulePreview(); saveState(true);
  }

  function resetSections() {
    var tpl = T[state.templateId] || T.tech;
    state.sections = { order: templateOrder(tpl), hidden: {} };
    renderForm(); schedulePreview(); saveState(true);
    toast("已恢复「" + tpl.name + "」模板的默认板块顺序与显示", "ok");
  }

  /* ---------- 预览渲染 ---------- */

  function roleClass(templateId) {
    var id = String(templateId || "tech");
    if (["tech", "backend", "frontend", "ai", "data"].indexOf(id) >= 0) return "role-tech";
    if (id === "product") return "role-product";
    if (id === "internet") return "role-internet";
    if (id === "operation") return "role-operation";
    if (id === "market") return "role-market";
    if (id === "design") return "role-design";
    if (id === "function") return "role-function";
    return "role-tech";
  }

  function renderResumeHTML() {
    isEnglish = !!(state.english && state.english.enabled);
    var r;
    if (isEnglish) {
      r = cloneJSON(state.english.resume || state.resume);
      CANONICAL_ORDER.forEach(function (k) { if (isSectionHidden(k)) delete r[k]; });
    } else {
      r = deriveResumeVariant(state.variant);
    }
    var tpl = T[state.templateId] || T.tech;
    var order = sectionOrder();
    var hidden = (state.sections && state.sections.hidden) || {};
    var map = {
      target: secTarget, education: secEducation,
      internships: secInternship, projects: secProject, campus: secCampus,
      research: secResearch,
      awards: secAward, skills: secSkill, evaluation: secEvaluation, extra: secExtra
    };
    var body = order.map(function (k) {
      if (hidden[k] || !map[k]) return "";
      return map[k](r, tpl);
    }).filter(Boolean).join("");
    var photo = hasText(r.basic.photo) ? '<img class="p-photo" src="' + esc(r.basic.photo) + '" alt="">' : "";
    return '<div class="page ' + esc(state.style) + ' ' + esc(roleClass(state.templateId)) + (state.compactMode ? ' compact-page' : '') + '">' +
      '<header class="p-header"><div><div class="p-name">' + esc(r.basic.name || "（姓名）") + "</div>" +
      '<div class="p-contact">' + contactParts(r).map(esc).join('<span>·</span>') + "</div></div>" + photo + "</header>" +
      body + "</div>";
  }

  function contactParts(r) {
    var parts = [];
    if (hasText(r.basic.phone)) parts.push(r.basic.phone);
    if (hasText(r.basic.email)) parts.push(r.basic.email);
    if (hasText(r.basic.city)) parts.push(r.basic.city);
    if (hasText(r.basic.birth)) parts.push(r.basic.birth);
    if (hasText(r.basic.gender)) parts.push(r.basic.gender);
    if (hasText(r.basic.website)) parts.push(r.basic.website);
    if (hasText(r.basic.github)) parts.push(r.basic.github);
    return parts;
  }

  function secBasic(r) {
    /* 头部（姓名/联系方式/照片）已由页面骨架渲染，这里不再输出板块 */
    return "";
  }

  /* 英文模式下的小标签与板块标题 */
  var EN_SECTIONS = {
    "教育背景": "EDUCATION", "实习经历": "INTERNSHIP", "项目经历": "PROJECT",
    "校园经历": "CAMPUS", "科研成果": "RESEARCH", "荣誉奖项": "HONORS",
    "技能": "SKILLS", "自我评价": "SUMMARY", "其他": "OTHERS"
  };
  function t(zh, en) { return isEnglish ? en : zh; }

  function secTarget(r, tpl) {
    var t = r.target;
    if (!hasText(t.position) && !hasText(t.city) && !hasText(t.salary) && !hasText(t.availability)) return "";
    var bits = [];
    if (hasText(t.position)) bits.push('<b>' + esc(t.position) + "</b>");
    if (hasText(t.industry)) bits.push(t("行业：", "Industry: ") + esc(t.industry));
    if (hasText(t.city)) bits.push(esc(t.city));
    if (hasText(t.salary)) bits.push(esc(t.salary));
    if (hasText(t.availability)) bits.push(t("到岗：", "Available: ") + esc(t.availability));
    return '<div class="p-target">' + bits.join(isEnglish ? " | " : " ｜ ") + "</div>";
  }

  function secEducation(r) {
    var list = r.education || [];
    if (!list.length) return "";
    var items = list.map(function (e) {
      var head = [esc(e.school), esc(e.major), esc(e.degree)].filter(Boolean).join(" · ");
      var range = [j(e.start), j(e.end)].filter(Boolean).join(" - ");
      var meta = [];
      if (hasText(e.gpa)) meta.push("GPA " + esc(e.gpa));
      if (hasText(e.rank)) meta.push(t("排名 ", "Rank ") + esc(e.rank));
      var lines = [];
      if (meta.length) lines.push('<div class="p-edu-line">' + meta.join(" ｜ ") + "</div>");
      if (hasText(e.courses)) lines.push('<div class="p-edu-line">' + t("主修课程：", "Relevant Courses: ") + esc(e.courses) + "</div>");
      if (hasText(e.honors)) lines.push('<div class="p-edu-line">' + t("在校荣誉：", "Honors: ") + esc(e.honors) + "</div>");
      return '<div class="p-item"><div class="p-edu-row"><span class="p-edu-main">' + head + "</span>" +
        '<span class="p-edu-meta">' + (range ? range : "") + "</span></div>" + lines.join("") + "</div>";
    });
    return secWrap("教育背景", "EDUCATION", items.join(""));
  }

  function richTextHTML(text) {
    var safe = esc(text || "");
    /* Support lightweight **bold** emphasis without allowing arbitrary HTML. */
    return safe.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  }

  function bulletsHTML(content) {
    var lines = String(content || "").split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
    if (!lines.length) return "";
    return '<ul class="p-bullets">' + lines.map(function (l) { return "<li>" + richTextHTML(l) + "</li>"; }).join("") + "</ul>";
  }

  function secInternship(r) {
    var list = r.internships || [];
    if (!list.length) return "";
    var items = list.map(function (it) {
      var range = [j(it.start), j(it.end)].filter(Boolean).join(" - ");
      return '<div class="p-item"><div class="p-item-head">' +
        '<span class="p-item-title">' + esc(it.company || t("（公司）", "(Company)")) + (hasText(it.title) ? " · " + esc(it.title) : "") + "</span>" +
        '<span class="p-item-range">' + esc(range) + "</span></div>" + bulletsHTML(it.content) + "</div>";
    });
    return secWrap("实习经历", "INTERNSHIP", items.join(""));
  }

  function secProject(r) {
    var list = r.projects || [];
    if (!list.length) return "";
    var items = list.map(function (it) {
      var range = [j(it.start), j(it.end)].filter(Boolean).join(" - ");
      var sub = [];
      if (hasText(it.role)) sub.push(it.role);
      if (hasText(it.tech)) sub.push(it.tech);
      return '<div class="p-item"><div class="p-item-head">' +
        '<span class="p-item-title">' + esc(it.name || t("（项目）", "(Project)")) + "</span>" +
        '<span class="p-item-range">' + esc(range) + "</span></div>" +
        (sub.length ? '<div class="p-item-sub">' + esc(sub.join(" ｜ ")) + "</div>" : "") +
        bulletsHTML(it.content) + "</div>";
    });
    return secWrap("项目经历", "PROJECT", items.join(""));
  }

  function secCampus(r) {
    var list = r.campus || [];
    if (!list.length) return "";
    var items = list.map(function (it) {
      var range = [j(it.start), j(it.end)].filter(Boolean).join(" - ");
      return '<div class="p-item"><div class="p-item-head">' +
        '<span class="p-item-title">' + esc(it.org || t("（组织）", "(Organization)")) + (hasText(it.role) ? " · " + esc(it.role) : "") + "</span>" +
        '<span class="p-item-range">' + esc(range) + "</span></div>" + bulletsHTML(it.content) + "</div>";
    });
    return secWrap("校园经历", "CAMPUS", items.join(""));
  }

  function secResearch(r) {
    var list = r.research || [];
    if (!list.length) return "";
    var items = list.map(function (it) {
      var head = [];
      if (hasText(it.kind)) head.push(esc(it.kind));
      head.push(esc(it.title || t("（名称）", "(Title)")));
      var meta = [];
      if (hasText(it.role)) meta.push(esc(it.role));
      if (hasText(it.venue)) meta.push(esc(it.venue));
      if (hasText(it.date)) meta.push(esc(it.date));
      var note = hasText(it.note) ? bulletsHTML(it.note) : "";
      return '<div class="p-item"><div class="p-item-head"><span class="p-item-title">' + head.join(" · ") + "</span></div>" +
        (meta.length ? '<div class="p-item-sub">' + meta.join(" ｜ ") + "</div>" : "") +
        note + "</div>";
    });
    return secWrap("科研成果", "RESEARCH", items.join(""));
  }

  function secAward(r) {
    var list = r.awards || [];
    if (!list.length) return "";
    var items = list.map(function (a) {
      return '<div class="p-award-line"><span>' + esc(a.name || "（奖项）") + "</span>" +
        (hasText(a.level) ? '<span class="lvl">' + esc(a.level) + "</span>" : "") +
        (hasText(a.date) ? '<span class="date">' + esc(a.date) + "</span>" : "") + "</div>";
    });
    return secWrap("荣誉奖项", "HONORS", items.join(""));
  }

  function secSkill(r) {
    var list = r.skills || [];
    var rows = list.filter(function (s) { return hasText(s.items); }).map(function (s) {
      return '<div class="p-skill-line"><span class="p-skill-cat">' + esc(s.category || t("技能", "Skills")) + "</span><span>" + esc(s.items) + "</span></div>";
    });
    if (!rows.length) return "";
    return secWrap("技能", "SKILLS", rows.join(""));
  }

  function secEvaluation(r) {
    if (!hasText(r.evaluation)) return "";
    return secWrap("自我评价", "SELF-EVALUATION", '<div class="p-eval">' + esc(r.evaluation) + "</div>");
  }

  function secExtra(r) {
    if (!hasText(r.extra)) return "";
    return secWrap("其他", "OTHERS", '<div class="p-eval">' + esc(r.extra) + "</div>");
  }

  function secWrap(title, en, inner) {
    if (isEnglish) {
      return '<section class="p-sec"><h3 class="p-sec-h">' + esc(EN_SECTIONS[title] || en) + "</h3>" + inner + "</section>";
    }
    return '<section class="p-sec"><h3 class="p-sec-h">' + esc(title) + ' <span class="en">' + esc(en) + "</span></h3>" + inner + "</section>";
  }

  /* 缩放适配容器 */
  function fitScale(container) {
    var wrap = $(".scale-wrap", container);
    if (!wrap) return;
    var page = $(".page", container);
    if (!page) return;
    var avail = container.clientWidth - 32;
    var scale = Math.min(1, Math.max(0.1, avail / 794));
    wrap.style.transform = "scale(" + scale + ")";
    wrap.style.width = "794px";
    wrap.style.height = (page.offsetHeight * scale) + "px";
  }

  function previewPageHeight() {
    var page = $("#printArea .page");
    return page ? page.scrollHeight : 0;
  }

  function printablePageHeight() {
    /* A4 297mm，打印边距 12mm + 12mm，按 96dpi 换算成可用像素高度 */
    return Math.floor((297 - 24) * 96 / 25.4);
  }

  function checkResumeOnePage() {
    state.compactMode = false;
    renderAllPreviews();
    var currentHeight = previewPageHeight();
    var targetHeight = printablePageHeight();
    var diff = currentHeight - targetHeight;
    var suggestions = [];

    function addSuggestion(text) {
      if (suggestions.indexOf(text) === -1) suggestions.push(text);
    }

    if (hasText(state.resume.extra)) addSuggestion("优先精简或删除「其他」板块里的补充说明");
    if (hasText(state.resume.evaluation)) addSuggestion("优先把「自我评价」压缩成 2-3 句，不要写空话");
    (state.resume.education || []).forEach(function (item) {
      if (hasText(item.courses)) addSuggestion("教育背景里的「主修课程」建议只保留最相关的 3-5 门");
      if (hasText(item.honors)) addSuggestion("教育背景里的「在校荣誉」建议只保留最重要的 1-2 条");
    });
    if ((state.resume.campus || []).length) addSuggestion("校园经历建议只保留与岗位最相关的一段或最有结果的一条");
    if ((state.resume.research || []).length) addSuggestion("科研成果建议只保留和目标岗位最相关的内容");
    addSuggestion("实习经历和项目经历属于核心内容，不建议优先删减");
    addSuggestion("如果仍然超页，优先删减辅助板块，再考虑改写过长句子");

    if (currentHeight <= targetHeight) {
      state.compactMode = true;
      renderAllPreviews();
      openModal("一页检查", '<div style="font-size:13px;color:var(--text-2);margin-bottom:8px">当前内容接近一页，打印前建议开启紧凑版式并关闭浏览器页眉页脚。</div><ul style="margin:0;padding-left:18px;line-height:1.8"><li>当前不会自动修改你的简历内容</li><li>实习经历和项目经历会保持原文</li><li>如需更稳妥的一页效果，可再手动精简辅助板块</li></ul>');
      toast("当前内容接近一页，可直接打印测试", "ok");
      return true;
    }

    openModal("一页检查", '<div style="font-size:13px;color:var(--text-2);margin-bottom:8px">当前内容预计会超过一页，建议优先手动精简这些位置：</div><ul style="margin:0;padding-left:18px;line-height:1.8">' + suggestions.slice(0, 6).map(function (item) { return '<li>' + esc(item) + '</li>'; }).join('') + '</ul><div style="margin-top:10px;font-size:12px;color:var(--text-2)">当前比一页正文高度大约多出 ' + esc(String(Math.max(0, diff))) + ' px。为了保护核心经历，系统不会自动删改你的实习和项目内容。</div>');
    toast("当前内容预计超过一页，已给出手动精简建议", "err");
    return false;
  }

  function compressResumeToOnePage() {
    var original = cloneJSON(state.resume);
    printFitRequested = true;
    var variantBefore = state.variant;
    var compactBefore = !!state.compactMode;
    var candidates = [];
    var changes = [];

    function itemLabel(key, index) {
      var item = state.resume[key] && state.resume[key][index];
      if (!item) return "该条内容";
      var title = item.company || item.name || item.org || item.title || ("第" + (index + 1) + "条");
      if (key === "internships") return "实习经历 · " + title;
      if (key === "projects") return "项目经历 · " + title;
      if (key === "campus") return "校园经历 · " + title;
      if (key === "research") return "科研成果 · " + title;
      if (key === "education") return "教育背景 · " + title;
      return title;
    }

    function pushIfText(key, mode, extra) {
      var value = extra && extra.field ? (state.resume[key] && state.resume[key][extra.index] && state.resume[key][extra.index][extra.field]) : state.resume[key];
      if (hasText(value)) candidates.push(Object.assign({ key: key, mode: mode }, extra || {}));
    }

    pushIfText("extra", "remove-single");
    pushIfText("evaluation", "remove-single");
    (state.resume.education || []).forEach(function (item, index) {
      if (hasText(item.honors)) candidates.push({ key: "education", index: index, field: "honors", mode: "clear-field" });
      if (hasText(item.courses)) candidates.push({ key: "education", index: index, field: "courses", mode: "clear-field" });
    });

    /* 核心实习和项目内容不得自动删改，只处理低优先级校园/科研经历。 */
    ["campus", "research"].forEach(function (key) {
      var field = key === "research" ? "note" : "content";
      (state.resume[key] || []).forEach(function (item, index) {
        var text = String(item[field] || "");
        var lines = text.split(/\r?\n/).map(function (line) { return line.trim(); }).filter(Boolean);
        if (key === "campus" && lines.length) candidates.push({ key: key, index: index, field: field, mode: "drop-last" });
        if (lines.length > 3) candidates.push({ key: key, index: index, field: field, mode: "drop-last" });
        if (lines.length > 2) candidates.push({ key: key, index: index, field: field, mode: "limit-two" });
        if (lines.some(function (line) { return line.length > 56; })) candidates.push({ key: key, index: index, field: field, mode: "truncate" });
      });
    });

    state.variant = state.variant === "detailed" ? "targeted" : state.variant;
    state.compactMode = false;
    renderAllPreviews();
    var targetHeight = printablePageHeight();
    var heightBefore = previewPageHeight();
    if (heightBefore <= targetHeight) {
      state.compactMode = true;
      renderAllPreviews();
      saveState(true);
      openModal("压缩结果", '<div style="font-size:13px;color:var(--text-2)">当前内容按正文高度已经接近一页，已启用紧凑版式后再打印。</div>');
      toast("已启用紧凑版式，请再导出 PDF", "ok");
      return true;
    }

    for (var i = 0; i < candidates.length && previewPageHeight() > targetHeight; i++) {
      var c = candidates[i];
      if (c.mode === "remove-single") {
        state.resume[c.key] = "";
        changes.push(c.key === "extra" ? "删除了「其他」板块" : "删除了「自我评价」板块");
      } else if (c.mode === "clear-field") {
        state.resume[c.key][c.index][c.field] = "";
        changes.push(itemLabel(c.key, c.index) + "：清理了「" + (c.field === "honors" ? "在校荣誉" : "主修课程") + "」");
      } else {
        var text = String(state.resume[c.key][c.index][c.field] || "");
        var lines2 = text.split(/\r?\n/).map(function (line) { return line.trim(); }).filter(Boolean);
        if (c.mode === "drop-last" && lines2.length > 1) {
          lines2.pop();
          state.resume[c.key][c.index][c.field] = lines2.join("\n");
          changes.push(itemLabel(c.key, c.index) + "：删减了 1 条要点");
        } else if (c.mode === "limit-two") {
          state.resume[c.key][c.index][c.field] = trimBulletLines(text, { maxLines: 2, maxChars: 52 });
          changes.push(itemLabel(c.key, c.index) + "：压缩为 2 条要点");
        } else if (c.mode === "truncate") {
          state.resume[c.key][c.index][c.field] = trimBulletLines(text, { maxLines: 2, maxChars: 42 });
          changes.push(itemLabel(c.key, c.index) + "：缩短了较长描述");
        }
      }
      renderAllPreviews();
    }

    if (previewPageHeight() > targetHeight) {
      state.compactMode = true;
      changes.push("启用了紧凑版式（更小字号与更紧间距）");
      renderAllPreviews();
    }

    if (previewPageHeight() > targetHeight && state.variant !== "internet") {
      state.variant = "internet";
      changes.push("切换到更激进的互联网精简版策略");
      renderAllPreviews();
    }

    if (previewPageHeight() > targetHeight) {
      var failedSummary = Array.from(new Set(changes)).slice(0, 5);
      state.resume = original;
      state.variant = variantBefore;
      state.compactMode = compactBefore;
      renderAllPreviews();
      toast("当前内容较多，自动压缩与紧凑版式后仍未完全压到一页；建议再手动删减低优先级内容", "err");
      openModal("压缩结果", '<div style="font-size:13px;color:var(--text-2);margin-bottom:8px">这次尝试了自动压缩，但仍未完全压到一页。你可以先看系统已经尝试过的调整：</div><ul style="margin:0;padding-left:18px;line-height:1.8">' + (failedSummary.length ? failedSummary.map(function (item) { return '<li>' + esc(item) + '</li>'; }).join('') : '<li>本次没有找到可继续自动删减的安全内容</li>') + '</ul><div style="margin-top:10px;font-size:12px;color:var(--text-2)">由于压缩没有成功应用，所以当前内容已经自动恢复到压缩前状态。</div>');
      return false;
    }
    if (!state.compactMode) {
      state.compactMode = true;
      changes.push("启用了紧凑版式（更小字号与更紧间距）");
      renderAllPreviews();
    }
    lastCompressionSnapshot = { resume: cloneJSON(original), variant: variantBefore, compactMode: compactBefore };
    saveState(true);
    renderForm();
    var summary = Array.from(new Set(changes)).slice(0, 4);
    toast(state.compactMode ? "已通过内容删减 + 紧凑版式压缩到一页" : "已按一页优先自动压缩当前简历", "ok");
    if (summary.length) {
      var m = openModal("压缩结果", '<div style="font-size:13px;color:var(--text-2);margin-bottom:8px">本次自动压缩做了这些调整：</div><ul style="margin:0;padding-left:18px;line-height:1.8">' + summary.map(function (item) { return '<li>' + esc(item) + '</li>'; }).join('') + '</ul>', '<button class="btn ghost restore-compress">恢复压缩前版本</button><button class="btn primary keep-compress">保留当前结果</button>');
      $(".restore-compress", m.el).onclick = function () { m.close(); restoreCompressedResume(); };
      $(".keep-compress", m.el).onclick = m.close;
    }
    return true;
  }

  function schedulePreview() {
    if (window.__previewTimer) clearTimeout(window.__previewTimer);
    window.__previewTimer = setTimeout(function () { renderAllPreviews(); }, 120);
  }

  function buildVersionDiff() {
    var detailed = deriveResumeVariant("detailed");
    var targeted = deriveResumeVariant(state.variant === "detailed" ? "internet" : state.variant, { shortenCore: true });
    var sections = [
      ["internships", "实习经历", "content"],
      ["projects", "项目经历", "content"],
      ["campus", "校园经历", "content"],
      ["research", "科研成果", "note"],
      ["education", "教育背景", "courses"],
      ["evaluation", "自我评价", null],
      ["extra", "其他", null]
    ];
    var out = [];
    sections.forEach(function (spec) {
      var key = spec[0], label = spec[1], field = spec[2];
      if (Array.isArray(detailed[key])) {
        (detailed[key] || []).forEach(function (item, index) {
          var next = (targeted[key] || [])[index] || {};
          var before = field ? String(item[field] || "") : String(item || "");
          var after = field ? String(next[field] || "") : String(targeted[key] || "");
          if (!before && !after) return;
          var status = before === after ? "preserved" : (after && after.length < before.length ? "shortened" : "changed");
          var title = item.company || item.name || item.org || item.title || label;
          out.push({ section: label, title: title, before: before, after: after, status: status, key: key, index: index });
        });
      } else {
        var beforeSingle = String(detailed[key] || "");
        var afterSingle = String(targeted[key] || "");
        if (!beforeSingle && !afterSingle) return;
        out.push({ section: label, title: label, before: beforeSingle, after: afterSingle, status: beforeSingle === afterSingle ? "preserved" : (afterSingle && afterSingle.length < beforeSingle.length ? "shortened" : "changed"), key: key, index: 0 });
      }
    });
    return out.filter(function (item) { return item.before || item.after; });
  }

  function renderVersionCompare() {
    var wrap = $("#previewCompare");
    if (!wrap) return;
    var diff = buildVersionDiff();
    if (!diff.length) {
      wrap.innerHTML = "";
      return;
    }
    wrap.innerHTML = '<div class="compare-card"><div class="compare-head"><h3>完整版 vs JD版</h3><span>帮助你理解哪些内容被保留、压缩或改写</span></div>' +
      diff.map(function (item) {
        return '<div class="compare-item ' + item.status + '"><div class="compare-item-head"><span class="compare-title">' + esc(item.section + ' · ' + item.title) + '</span><span class="compare-status ' + item.status + '">' + (item.status === 'preserved' ? '保留' : item.status === 'shortened' ? '压缩' : '调整') + '</span></div>' +
          '<div class="compare-cols"><div><div class="compare-col-title">完整版</div><div class="compare-text">' + esc(item.before || '（无）') + '</div></div>' +
          '<div><div class="compare-col-title">当前版本</div><div class="compare-text">' + esc(item.after || '（无）') + '</div></div></div></div>';
      }).join('') + '</div>';
  }

  function renderAllPreviews() {
    var html = renderResumeHTML();
    var mini = $("#miniPreviewBody");
    var big = $("#previewBody");
    var printArea = $("#printArea");
    if (mini) { mini.innerHTML = html; fitScale(mini); }
    if (big) { big.innerHTML = html; fitScale(big); }
    if (printArea) printArea.innerHTML = html;
    renderVersionCompare();
  }

  /* ---------- 英文简历 ---------- */

  function parseEnglishJSON(text) {
    var o = AI && AI.extractJSON ? AI.extractJSON(text) : null;
    if (o && o.basic && typeof o.basic === "object") return o;
    return null;
  }

  function generateEnglishResume(regen) {
    var cfg = AI && AI.loadConfig ? AI.loadConfig() : null;
    if (!cfg) {
      var m = openModal("英文简历", "<p style='margin:0;font-size:13px;color:var(--text-2)'>生成英文简历需要调用 AI 翻译。请先在「<b>✨ AI 优化</b>」面板填写 DeepSeek API Key（仅保存在本机浏览器，不会上传到第三方服务器）。</p>",
        '<button class="btn primary english-go-ai">去配置 API Key</button>');
      $(".english-go-ai", m.el).onclick = function () { m.close(); switchTab("ai"); };
      return;
    }
    if (!AI || typeof AI.aiTranslate !== "function") {
      toast("当前环境未加载 AI 翻译模块", "err");
      return;
    }
    var btn = $("#btnEnglish");
    if (btn) { btn.disabled = true; btn.textContent = "翻译生成中…"; }
    AI.aiTranslate(state.resume, cfg, null).then(function (text) {
      var en = parseEnglishJSON(text);
      if (!en) throw new Error("翻译结果解析失败，请重试");
      state.english = { enabled: true, resume: en, updatedAt: Date.now() };
      saveState(true);
      renderAllPreviews();
      updateEnglishButtons();
      toast(regen ? "英文简历已重新翻译" : "英文简历已生成", "ok");
    }).catch(function (err) {
      toast((err && err.message ? err.message : "生成英文简历失败，请重试"), "err");
      updateEnglishButtons();
    });
  }

  function toggleEnglish() {
    if (!state.english || !state.english.resume) { generateEnglishResume(false); return; }
    state.english.enabled = !state.english.enabled;
    saveState(true);
    renderAllPreviews();
    updateEnglishButtons();
    toast(state.english.enabled ? "已切换到英文简历" : "已切换回中文简历", "ok");
  }

  function updateEnglishButtons() {
    var btn = $("#btnEnglish");
    var regen = $("#btnRetranslate");
    if (!btn) return;
    var has = !!(state.english && state.english.resume);
    var on = !!(state.english && state.english.enabled);
    btn.disabled = false;
    btn.textContent = on ? "🌐 返回中文版" : (has ? "🌐 查看英文版" : "🌐 生成英文简历");
    btn.title = has ? "点击切换中英文简历" : "通过 AI 翻译生成英文简历";
    if (regen) regen.style.display = on && has ? "" : "none";
  }

  function switchTab(id) {
    $$(".tab").forEach(function (t) { t.classList.toggle("active", t.dataset.tab === id); });
    $$(".tab-panel").forEach(function (p) { p.classList.toggle("active", p.id === "tab-" + id); });
    if (id === "preview") setTimeout(function () { renderAllPreviews(); fitScale($("#previewBody")); }, 30);
  }

  /* 兼容旧代码里的 showTab 调用 */
  function showTab(id) { switchTab(id); }

  /* ---------- 体检 ---------- */

  var lastReport = null;

  function runAudit() {
    var result = Engine.audit(state.resume, state.templateId, { hidden: state.sections && state.sections.hidden });
    lastReport = result;
    var levelCls = result.total >= 85 ? "good" : result.total >= 70 ? "mid" : "bad";
    var c = 2 * Math.PI * 40;
    var off = c * (1 - result.total / 100);

    var cats = result.categories.map(function (cat) {
      var pct = cat.max ? Math.round(cat.score / cat.max * 100) : 0;
      var barCls = pct >= 80 ? "ok" : pct >= 50 ? "mid" : "bad";
      return '<div class="cat-card"><div class="cat-name"><span>' + esc(cat.name) + '</span><span>' + cat.score + "/" + cat.max + "</span></div>" +
        '<div class="cat-bar"><i class="' + barCls + '" style="width:' + pct + '%"></i></div>' +
        '<div class="cat-tip">' + esc(cat.tip) + "</div></div>";
    }).join("");

    var evidence = buildJDEvidenceMap();
    var evidenceHTML = "";
    var targetHeight = printablePageHeight();
    state.compactMode = false;
    renderAllPreviews();
    var pageHeight = previewPageHeight();
    var lengthAdvice = [];
    if (pageHeight > targetHeight) {
      if (hasText(state.resume.extra)) lengthAdvice.push("先精简或删除「其他」板块");
      if (hasText(state.resume.evaluation)) lengthAdvice.push("把「自我评价」压缩成 2-3 句");
      if ((state.resume.education || []).some(function (item) { return hasText(item.courses); })) lengthAdvice.push("主修课程只保留最相关的 3-5 门");
      if ((state.resume.education || []).some(function (item) { return hasText(item.honors); })) lengthAdvice.push("在校荣誉只保留最重要的 1-2 条");
      if ((state.resume.campus || []).length) lengthAdvice.push("校园经历只保留最相关的一段");
      if ((state.resume.research || []).length) lengthAdvice.push("科研成果只保留最贴近岗位的一条");
      lengthAdvice.push("尽量保留实习经历和项目经历，不要优先删减核心内容");
    }
    if (evidence) {
      function renderEvidenceGroup(title, cls, items, note) {
        if (!items.length) return '';
        return '<div class="jd-group ' + cls + '"><div class="jd-group-title">' + esc(title) + '</div>' +
          (note ? '<div class="jd-group-note">' + esc(note) + '</div>' : '') +
          '<div class="jd-evidence-grid">' +
          items.map(function (item) {
            return '<div class="jd-chip ' + cls + '"><div class="jd-chip-key">' + esc(item.keyword) + '</div>' +
              '<div class="jd-chip-body">' + item.hits.map(function (hit) {
                return '<div class="jd-hit"><button type="button" class="link-btn" data-jump-entry="' + esc(hit.key + ':' + hit.index) + '">' + esc(hit.label) + '</button><div class="jd-hit-snippet">' + esc(String(hit.snippet).slice(0, 90)) + '</div></div>';
              }).join('') +
              (item.suggested && item.suggested.length ? '<div class="jd-suggest-box"><div class="jd-suggest-title">补证据建议</div>' + item.suggested.map(function (sg) {
                return '<div class="jd-suggest-item"><button type="button" class="link-btn" data-jump-entry="' + esc(sg.key + ':' + sg.index) + '">' + esc(sg.label) + '</button><div class="jd-hit-snippet">' + esc(sg.hint) + '</div></div>';
              }).join('') + '</div>' : '') +
              '</div></div>';
          }).join('') + '</div></div>';
      }
      evidenceHTML = '<div class="jd-evidence-card"><div class="jd-evidence-head"><h3>JD 关键词证据映射</h3><span>' + evidence.covered + '/' + evidence.total + ' 已覆盖</span></div>' +
        renderEvidenceGroup('强证据命中', 'strong', evidence.strong, '关键词不仅出现了，而且在项目/实习/科研等经历里有真实支撑。') +
        renderEvidenceGroup('弱证据命中', 'weak', evidence.weak, '目前多停留在技能罗列里，建议补到项目或实习结果中。') +
        (evidence.missing.length ? '<div class="jd-missing"><b>待补关键词：</b>' + evidence.missing.slice(0, 10).map(function (kw) { return '<span class="jd-miss-tag">' + esc(kw) + '</span>'; }).join('') + '</div>' : '<div class="jd-missing ok">JD 关键词覆盖较好，可以重点打磨表达与量化结果。</div>') +
        '</div>';
    }

    var sevOrder = { error: 0, warn: 1, info: 2 };
    var sevName = { error: "严重问题", warn: "建议改进", info: "提示" };
    var groups = ["error", "warn", "info"].map(function (sev) {
      var items = result.items.filter(function (it) { return it.severity === sev; });
      if (!items.length) return "";
      return '<h4 style="margin:14px 0 8px">' + sevName[sev] + "（" + items.length + "）</h4>" +
        '<ul class="issue-list">' + items.map(function (it) {
          return '<li class="issue ' + sev + '"><div class="issue-title"><span class="sev-tag ' + sev + '">' + sevName[sev] + "</span>" +
            '<span>' + esc(it.title) + "</span><span class=\"issue-section\">" + esc(it.section) + "</span></div>" +
            (hasText(it.detail) ? '<div class="issue-detail">' + esc(it.detail) + "</div>" : "") + "</li>";
        }).join("") + "</ul>";
    }).join("");

    var lengthHTML = lengthAdvice.length
      ? '<div class="jd-evidence-card"><div class="jd-evidence-head"><h3>版面与长度建议</h3><span>预计超过一页</span></div><div class="jd-group-note">为了保护核心经历，建议先手动精简辅助板块，再重新导出 PDF。</div><ul class="issue-list">' + lengthAdvice.map(function (item, index) {
        return '<li class="issue warn"><div class="issue-title"><span class="sev-tag warn">建议 ' + (index + 1) + '</span><span>' + esc(item) + '</span><span class="issue-section">篇幅</span></div></li>';
      }).join('') + '</ul></div>'
      : '<div class="jd-evidence-card"><div class="jd-evidence-head"><h3>版面与长度建议</h3><span>接近一页</span></div><div class="jd-group-note">当前版面长度基本可控，优先继续打磨表达质量和关键词证据即可。</div></div>';
    $("#auditSummary").textContent = result.summary;
    $("#auditBody").innerHTML =
      '<div class="score-card">' +
      '<div class="score-ring"><svg width="96" height="96"><circle cx="48" cy="48" r="40" fill="none" stroke="var(--border)" stroke-width="8"></circle>' +
      '<circle cx="48" cy="48" r="40" fill="none" stroke-width="8" stroke-linecap="round" stroke-dasharray="' + c + '" stroke-dashoffset="' + off + '" style="stroke:' + (result.total >= 85 ? "var(--ok)" : result.total >= 70 ? "var(--warn)" : "var(--danger)") + '"></circle></svg>' +
      '<div class="num">' + result.total + '<small> /100</small></div></div>' +
      '<div class="score-meta"><div class="score-level ' + levelCls + '">' + esc(result.passLevel) + "</div>" +
      '<div style="font-size:12.5px;color:var(--text-2)">' + esc(result.summary) + "</div>" +
      '<div class="cat-grid">' + cats + "</div></div></div>" + lengthHTML + evidenceHTML + groups;
  }

  function copyReport() {
    if (!lastReport) { toast("请先点击「开始体检」", "err"); return; }
    var lines = ["简历体检报告（总分 " + lastReport.total + "/100 · " + lastReport.passLevel + "）", ""];
    lastReport.categories.forEach(function (cat) {
      lines.push("【" + cat.name + "】" + cat.score + "/" + cat.max);
    });
    lines.push("");
    lastReport.items.forEach(function (it) {
      lines.push("[" + it.severity + "] " + it.title + (hasText(it.detail) ? "：" + it.detail : ""));
    });
    var text = lines.join("\n");
    copyText(text).then(function () { toast("体检报告已复制", "ok"); }, function () { toast("复制失败，请手动选择", "err"); });
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      try {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        resolve();
      } catch (e) { reject(e); }
    });
  }

  /* ---------- 求职台 ---------- */

  var APP_STATUSES = ["待投递", "已投递", "笔试", "面试中", "Offer", "已拒绝", "放弃"];

  function renderTimeline() {
    var el = $("#timeline");
    if (!el) return;
    el.innerHTML = (window.RESUME_TIMELINE || []).map(function (item) {
      return '<div class="tl-item"><div class="tl-dot"></div><div class="tl-body">' +
        '<div class="tl-head"><span class="tl-stage">' + esc(item.stage) + '</span><span class="tl-time">' + esc(item.time) + "</span></div>" +
        '<div class="tl-note">' + esc(item.note) + "</div></div></div>";
    }).join("");
  }

  function renderTracker() {
    var wrap = $("#appTableWrap");
    if (!wrap) return;
    var list = state.tracker || [];
    if (!list.length) {
      wrap.innerHTML = '<div style="color:var(--text-2);font-size:13px;padding:14px 4px">还没有投递记录。点击「+ 添加」开始记录每一份投递，秋招/春招都能用。</div>';
      return;
    }
    var stats = {};
    list.forEach(function (a) { stats[a.status] = (stats[a.status] || 0) + 1; });
    var rows = list.map(function (a, i) {
      var opts = APP_STATUSES.map(function (s) {
        return '<option value="' + s + '"' + (a.status === s ? " selected" : "") + ">" + s + "</option>";
      }).join("");
      return '<tr>' +
        '<td style="white-space:nowrap;color:var(--text-2)">' + (i + 1) + "</td>" +
        '<td><input data-app="' + a.id + '" data-k="company" value="' + esc(a.company) + '" placeholder="公司"></td>' +
        '<td><input data-app="' + a.id + '" data-k="position" value="' + esc(a.position) + '" placeholder="岗位"></td>' +
        '<td><input data-app="' + a.id + '" data-k="channel" value="' + esc(a.channel) + '" placeholder="渠道"></td>' +
        '<td><input data-app="' + a.id + '" data-k="date" value="' + esc(a.date) + '" placeholder="2025-09-01"></td>' +
        '<td><select data-app="' + a.id + '" data-k="status">' + opts + "</select></td>" +
        '<td style="white-space:nowrap">' +
        (a.status === "Offer" ? '<span class="status-pill st-Offer">Offer</span> ' : "") +
        '<button class="btn small ghost" data-appdel="' + a.id + '">✕</button></td>' +
        "</tr>";
    }).join("");
    wrap.innerHTML =
      '<div style="font-size:12.5px;color:var(--text-2);margin-bottom:8px">共 ' + list.length + " 条 ｜ " +
      APP_STATUSES.filter(function (s) { return stats[s]; }).map(function (s) {
        return '<span class="status-pill st-' + s + '">' + s + " " + stats[s] + "</span>";
      }).join(" ") + "</div>" +
      '<table class="app-table"><thead><tr><th>#</th><th>公司</th><th>岗位</th><th>渠道</th><th>投递日期</th><th>状态</th><th></th></tr></thead><tbody>' + rows + "</tbody></table>";
  }

  function addApp() {
    (state.tracker = state.tracker || []).push({ id: uid(), company: "", position: "", channel: "", date: "", status: "待投递" });
    renderTracker(); saveState(true);
  }

  function exportAppsCSV() {
    var list = state.tracker || [];
    var head = ["公司", "岗位", "渠道", "投递日期", "状态"];
    var lines = [head.join(",")];
    list.forEach(function (a) {
      lines.push([a.company, a.position, a.channel, a.date, a.status].map(function (v) {
        return '"' + String(v || "").replace(/"/g, '""') + '"';
      }).join(","));
    });
    Ex.download("投递记录-" + timeHM().replace(":", "") + ".csv", "\uFEFF" + lines.join("\n"), "text/csv");
    toast("CSV 已导出", "ok");
  }

  function renderChecklist() {
    var el = $("#checklist");
    if (!el) return;
    var groups = state.checklist || [];
    var total = 0, done = 0;
    groups.forEach(function (g) {
      (g.items || []).forEach(function (it) { total++; if (it.done) done++; });
    });
    $("#checkProgress").textContent = done + "/" + total;
    var html = groups.map(function (g, gi) {
      return '<div class="cl-group"><div class="cl-group-title">' + esc(g.group) + "</div>" +
        (g.items || []).map(function (it, ii) {
          return '<label class="cl-item' + (it.done ? " done" : "") + '">' +
            '<input type="checkbox" data-check="' + gi + "." + ii + '"' + (it.done ? " checked" : "") + ">" +
            "<span>" + esc(it.text) + "</span></label>";
        }).join("") + "</div>";
    }).join("") +
      '<button id="btnAddCheck" class="btn small ghost" style="margin-top:6px">+ 添加自定义项</button>';
    el.innerHTML = html;
  }

  function addCheckItem() {
    var text = prompt("自定义准备项：", "");
    if (!text || !text.trim()) return;
    var groups = state.checklist || [];
    var last = groups[groups.length - 1];
    if (!last) { last = { group: "自定义", items: [] }; groups.push(last); }
    last.items.push({ text: text.trim(), done: false });
    renderChecklist(); saveState(true);
  }

  /* ---------- AI ---------- */

  function renderAIBody() {
    var cfg = AI.loadConfig();
    var body = $("#aiBody");
    var entries = collectEntries();
    var entryOpts = entries.length
      ? entries.map(function (e) { return '<option value="' + e.key + ":" + e.index + '">' + esc(e.label) + "</option>"; }).join("")
      : '<option value="">（先添加实习/项目/校园经历）</option>';
    body.innerHTML =
      '<div class="ai-card"><h3>🔑 AI 配置（可选）</h3>' +
      '<div class="ai-config">' +
      '<div class="row"><label style="font-size:12px;color:var(--text-2);flex:none">DeepSeek API Key</label>' +
      '<input id="aiKey" type="password" placeholder="sk-..." value="' + esc(cfg ? cfg.key : "") + '">' +
      '<button id="btnSaveAI" class="btn small">保存</button></div>' +
      '<div class="row"><label style="font-size:12px;color:var(--text-2)">模型</label>' +
      '<select id="aiModel" style="font-family:inherit;font-size:13px;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:6px 10px">' +
      '<option value="deepseek-chat"' + (!cfg || cfg.model === "deepseek-chat" ? " selected" : "") + ">deepseek-chat（推荐）</option>" +
      '<option value="deepseek-reasoner"' + (cfg && cfg.model === "deepseek-reasoner" ? " selected" : "") + ">deepseek-reasoner（深度思考）</option></select>" +
      '<button id="btnClearAI" class="btn small ghost">清除 Key</button></div>' +
      '<div class="ai-note">Key 仅保存在本机浏览器（localStorage），请求直连 DeepSeek 官方 API，不经任何中转。不使用 AI 也完全不影响其他功能。</div>' +
      "</div></div>" +
      '<div class="ai-card"><h3>✨ AI 帮你优化</h3>' +
      '<div class="ai-guide"><div class="ai-guide-title">第一次用可以按这个顺序：</div><div class="ai-guide-steps"><span>1. 看看哪里要改</span><span>2. 改成投递版</span><span>3. 再改单段经历</span></div></div>' +
      '<div class="ai-note" style="margin:0 0 10px">如果你只是第一次写简历，优先用前两个按钮就够了。</div>' +
      '<div class="ai-actions">' +
      '<button id="btnAIDiagnose" class="btn primary">1. 帮我看看哪里要改</button>' +
      '<button id="btnAIRewrite" class="btn">2. 帮我改成投递版</button>' +
      '<select id="aiEntrySelect" class="ai-polish-select">' + entryOpts + "</select>" +
      '<button id="btnAIPolish" class="btn"' + (entries.length ? "" : " disabled") + ">3. 把这段写得更像简历</button>" +
      '<button id="btnAISuggest" class="btn ghost">更多修改建议</button>' +
      "</div>" +
      '<div id="aiResult" class="ai-result">你可以先点「1. 帮我看看哪里要改」。AI 会先告诉你最该先改的 3 件事，不会一上来就给你一大段看不懂的内容。</div>' +
      '<div id="aiToolbar" class="ai-toolbar"></div></div>';
  }

  function collectEntries() {
    var out = [];
    var lists = [["internships", "实习"], ["projects", "项目"], ["campus", "校园"], ["research", "科研"]];
    lists.forEach(function (pair) {
      var key = pair[0], label = pair[1];
      (state.resume[key] || []).forEach(function (it, i) {
        var title = it.company || it.name || it.org || it.title || "";
        var content = key === "research" ? (it.note || "") : (it.content || "");
        var meta = [it.role, it.tech, it.kind, it.venue].filter(Boolean).join(" ");
        out.push({ key: key, index: i, label: label + "经历 · " + (title || "第" + (i + 1) + "条"), title: title, content: content, meta: meta });
      });
    });
    (state.resume.skills || []).forEach(function (it, i) {
      out.push({ key: "skills", index: i, label: "技能 · " + (it.category || ("第" + (i + 1) + "条")), title: it.category || "技能", content: [it.category, it.items].filter(Boolean).join("："), meta: "" });
    });
    return out;
  }

  function buildJDEvidenceMap() {
    var jd = normalizeJDText(state.jdText);
    if (!jd) return null;
    var tpl = T[state.templateId] || T.tech || { keywords: [] };
    var templateKeywords = (tpl.keywords || []).slice(0, 16);
    var jdList = jdKeywords(jd);
    var keywords = Array.from(new Set(jdList.concat(templateKeywords))).slice(0, 18);
    var entries = collectEntries();
    var mainEntries = entries.filter(function (entry) { return ["internships", "projects", "campus", "research"].indexOf(entry.key) >= 0; });
    var strong = [];
    var weak = [];
    var missing = [];
    keywords.forEach(function (kw) {
      var re = keywordRegExp(kw);
      var hits = entries.filter(function (entry) {
        return re.test((entry.content || "") + " " + (entry.meta || "") + " " + (entry.title || ""));
      }).map(function (entry) {
        return {
          label: entry.label,
          key: entry.key,
          index: entry.index,
          snippet: String(entry.content || "").split(/\r?\n/).find(function (line) { return re.test(line); }) || entry.content || entry.meta || entry.title || ""
        };
      });
      if (!hits.length) {
        missing.push(kw);
        return;
      }
      var strongHits = hits.filter(function (hit) { return ["internships", "projects", "campus", "research"].indexOf(hit.key) >= 0; });
      var weakHits = hits.filter(function (hit) { return hit.key === "skills"; });
      if (strongHits.length) strong.push({ keyword: kw, hits: strongHits.slice(0, 3), quality: "strong" });
      else {
        var suggested = mainEntries.slice().sort(function (a, b) {
          return String(b.content || "").length - String(a.content || "").length;
        }).slice(0, 2).map(function (entry) {
          return {
            label: entry.label,
            key: entry.key,
            index: entry.index,
            hint: "建议把「" + kw + "」写进这段经历的技术动作、职责边界或量化结果里，而不是只停留在技能列表。"
          };
        });
        weak.push({ keyword: kw, hits: weakHits.slice(0, 3), quality: "weak", suggested: suggested });
      }
    });
    return { strong: strong, weak: weak, missing: missing, total: keywords.length, covered: strong.length + weak.length };
  }

  var aiAbort = null;

  function collectMissingFacts() {
    var facts = [];
    collectEntries().forEach(function (entry) {
      var text = String(entry.content || "");
      var baseId = entry.key + ":" + entry.index;
      if (!/\d/.test(text)) facts.push({ id: baseId + ":metric", entryKey: entry.key, entryIndex: entry.index, label: entry.label, type: "metric", question: "这段经历最终影响了多少用户/客户/团队/请求量？有没有至少一个可量化结果？", placeholder: "例如：覆盖 5000+ 用户；时长下降 38%；转化率提升 12%" });
      if (!/(负责|主导|独立|推动|设计|开发|优化|搭建|完成|组织)/.test(text)) facts.push({ id: baseId + ":ownership", entryKey: entry.key, entryIndex: entry.index, label: entry.label, type: "ownership", question: "这段经历里你个人具体负责哪一部分？是主导、独立完成，还是协作支持？", placeholder: "例如：独立负责推荐服务缓存层设计与上线联调" });
      if (!/(提升|降低|增长|缩短|减少|优化|支撑|落地|上线)/.test(text)) facts.push({ id: baseId + ":result", entryKey: entry.key, entryIndex: entry.index, label: entry.label, type: "result", question: "这段经历最后带来了什么结果？效率、转化、时长、成本、质量或稳定性有什么变化？", placeholder: "例如：接口 P95 从 320ms 降至 110ms，稳定性提升到 99.95%" });
      if (text.length < 18) facts.push({ id: baseId + ":context", entryKey: entry.key, entryIndex: entry.index, label: entry.label, type: "context", question: "这段经历的业务背景是什么？为什么要做这件事？", placeholder: "例如：为了解决新用户转化低、客服重复处理量高的问题" });
    });
    return facts.slice(0, 8);
  }

  function followupValue(id) {
    return (state.followups && state.followups[id]) || "";
  }

  function setFollowupValue(id, value) {
    state.followups = state.followups || {};
    state.followups[id] = value;
  }

  function buildFollowupSummary(entryKey, entryIndex) {
    var facts = collectMissingFacts().filter(function (item) { return item.entryKey === entryKey && item.entryIndex === entryIndex; });
    var lines = facts.map(function (item) {
      var answer = followupValue(item.id);
      if (!hasText(answer)) return "";
      return "补充" + item.type + "：" + answer.trim();
    }).filter(Boolean);
    return lines.join("\n");
  }

  function applyFollowupsToEntry(entryKey, entryIndex) {
    var entry = state.resume[entryKey] && state.resume[entryKey][entryIndex];
    if (!entry) return false;
    var summary = buildFollowupSummary(entryKey, entryIndex);
    if (!hasText(summary)) return false;
    var original = String(entry.content || "").trim();
    var lines = original ? original.split(/\r?\n/).map(function (line) { return line.trim(); }).filter(Boolean) : [];
    summary.split(/\r?\n/).forEach(function (line) {
      var normalized = line.replace(/^补充[^：]+：/, "").trim();
      if (!normalized) return;
      lines.push(normalized);
    });
    entry.content = Array.from(new Set(lines)).join("\n");
    return true;
  }

  function renderFactQuestions(extraText) {
    var toolbar = $("#aiToolbar");
    if (!toolbar) return;
    var facts = collectMissingFacts();
    if (!facts.length && !extraText) {
      toolbar.innerHTML = '<div class="ai-note">当前经历里的事实信息相对完整，可以直接继续做定向改写。</div>';
      return;
    }
    var html = '<div class="ai-card fact-card" style="margin:10px 0 0;padding:12px 14px"><h3 style="margin:0 0 8px;font-size:14px">补事实工作台</h3>' +
      '<div class="ai-note" style="margin:0 0 10px">先把关键事实补齐，再做改写，AI 才更像是在优化简历，而不是替你猜简历。</div>' +
      facts.map(function (item) {
        return '<div class="fact-item">' +
          '<div class="fact-label">' + esc(item.label) + '</div>' +
          '<div class="fact-question">' + esc(item.question) + '</div>' +
          '<textarea class="fact-answer" data-followup-id="' + esc(item.id) + '" data-entry-key="' + esc(item.entryKey) + '" data-entry-index="' + item.entryIndex + '" placeholder="' + esc(item.placeholder || "补充这条事实") + '">' + esc(followupValue(item.id)) + '</textarea>' +
          '<div class="fact-actions">' +
          '<button type="button" class="btn small ghost" data-followup-apply="' + esc(item.id) + '">回填到对应经历</button>' +
          '<button type="button" class="btn small ghost" data-followup-jump="' + esc(item.entryKey + ":" + item.entryIndex) + '">定位经历</button>' +
          '<button type="button" class="btn small" data-followup-ai="' + esc(item.entryKey + ":" + item.entryIndex) + '">用补充事实重写这段</button>' +
          '</div>' +
          '</div>';
      }).join("") +
      (extraText ? '<div class="ai-result" style="margin-top:10px">' + esc(extraText) + '</div>' : '') +
      '</div>';
    toolbar.innerHTML = html;
  }

  function runFollowupRewrite(entryKey, entryIndex) {
    var cfg = AI.loadConfig();
    if (!cfg || !cfg.key) { toast("请先在上方配置 API Key", "err"); return; }
    var entry = collectEntries().filter(function (e) { return e.key === entryKey && e.index === entryIndex; })[0];
    if (!entry) { toast("未找到该经历", "err"); return; }
    var factsText = buildFollowupSummary(entryKey, entryIndex);
    if (!hasText(factsText)) { toast("请先填写至少一条补充事实", "err"); return; }
    var tpl = T[state.templateId] || T.tech;
    var resultEl = $("#aiResult");
    var toolbar = $("#aiToolbar");
    resultEl.className = "ai-result loading";
    resultEl.textContent = "AI 正在根据补充事实重写这段经历…";
    toolbar.innerHTML = "";
    if (aiAbort) aiAbort.abort();
    aiAbort = new AbortController();
    var timer = setTimeout(function () { aiAbort && aiAbort.abort(); }, 120000);
    var ctxText = tpl.name + (tpl.desc ? " · " + tpl.desc : "");
    AI.aiPolishWithFacts(entry.label, entry.content, factsText, ctxText, cfg, aiAbort.signal, state.jdText).then(function (text) {
      clearTimeout(timer);
      aiAbort = null;
      resultEl.className = "ai-result";
      resultEl.textContent = text;
      renderAIToolbar("polish", text);
      var sel = $("#aiEntrySelect");
      if (sel) sel.value = entryKey + ":" + entryIndex;
    }).catch(function (err) {
      clearTimeout(timer);
      aiAbort = null;
      resultEl.className = "ai-result";
      resultEl.innerHTML = '<span class="err">' + esc(err && err.message ? err.message : String(err)) + '</span>';
    });
  }

  function runAITask(kind) {
    var cfg = AI.loadConfig();
    if (!cfg || !cfg.key) { toast("请先在上方配置 API Key", "err"); return; }
    var tpl = T[state.templateId] || T.tech;
    var resultEl = $("#aiResult");
    var toolbar = $("#aiToolbar");
    resultEl.className = "ai-result loading";
    resultEl.textContent = "AI 正在思考，请稍候（约 10-60 秒）…";
    toolbar.innerHTML = "";
    if (aiAbort) aiAbort.abort();
    aiAbort = new AbortController();
    var timer = setTimeout(function () { aiAbort && aiAbort.abort(); }, 120000);

    var task = null;
    var resumeForAI = visibleResume();
    if (kind === "diagnose") task = AI.aiDiagnose(resumeForAI, tpl, cfg, aiAbort.signal, state.jdText);
    else if (kind === "suggest") task = AI.aiSuggest(resumeForAI, tpl, cfg, aiAbort.signal, state.jdText);
    else if (kind === "rewrite") task = AI.aiRewrite(resumeForAI, tpl, cfg, aiAbort.signal, state.jdText);
    else {
      var sel = $("#aiEntrySelect");
      var val = sel && sel.value ? sel.value.split(":") : null;
      if (!val || !val[0]) { toast("请先选择要润色的经历", "err"); return; }
      var entries = collectEntries();
      var entry = entries.filter(function (e) { return e.key === val[0] && String(e.index) === val[1]; })[0];
      if (!entry) { toast("未找到该经历", "err"); return; }
      var ctxText = tpl.name + (tpl.desc ? " · " + tpl.desc : "");
      task = AI.aiPolish(entry.label, entry.content, ctxText, cfg, aiAbort.signal);
    }

    task.then(function (text) {
      clearTimeout(timer);
      aiAbort = null;
      resultEl.className = "ai-result";
      resultEl.textContent = text;
      if (kind === "diagnose") renderFactQuestions(text);
      else renderAIToolbar(kind, text);
    }).catch(function (err) {
      clearTimeout(timer);
      aiAbort = null;
      resultEl.className = "ai-result";
      resultEl.innerHTML = '<span class="err">' + esc(err && err.message ? err.message : String(err)) + "</span>";
    });
  }

  function renderAIToolbar(kind, text) {
    var toolbar = $("#aiToolbar");
    if (!toolbar) return;
    var btns = [];
    btns.push('<button id="aiCopy" class="btn small">复制结果</button>');
    if (kind === "polish") {
      btns.push('<button id="aiApply" class="btn small primary">替换原经历内容</button>');
    }
    toolbar.innerHTML = btns.join("");
    $("#aiCopy").onclick = function () {
      copyText(text).then(function () { toast("已复制", "ok"); }, function () { toast("复制失败", "err"); });
    };
    if (kind === "polish") {
      $("#aiApply").onclick = function () {
        var cleaned = AI.cleanOutput(text);
        var lines = cleaned.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
        if (!lines.length) { toast("AI 返回内容无法识别为要点列表，请改用「复制结果」手动粘贴", "err"); return; }
        var sel = $("#aiEntrySelect");
        var val = sel && sel.value ? sel.value.split(":") : null;
        if (!val || !val[0]) return;
        var entry = collectEntries().filter(function (e) { return e.key === val[0] && String(e.index) === val[1]; })[0];
        if (!entry) return;
        confirmModal("确认替换", "将用 AI 改写后的内容替换「" + entry.label + "」的原文。建议先对比再应用。", function () {
          state.resume[entry.key][entry.index].content = lines.join("\n");
          renderForm(); renderTracker(); schedulePreview(); saveState(true);
          toast("已替换，可在「简历编辑」中继续微调", "ok");
        });
      };
    }
  }

  /* ---------- 弹窗 / Toast ---------- */

  function openModal(title, bodyHTML, footHTML) {
    var root = $("#modalRoot");
    var mask = document.createElement("div");
    mask.className = "modal-mask";
    mask.innerHTML = '<div class="modal"><div class="modal-head"><span>' + esc(title) + '</span>' +
      '<button class="modal-close">✕</button></div><div class="modal-body">' + bodyHTML + "</div>" +
      (footHTML ? '<div class="modal-foot">' + footHTML + "</div>" : "") + "</div>";
    root.appendChild(mask);
    function close() { mask.remove(); }
    $(".modal-close", mask).onclick = close;
    mask.addEventListener("mousedown", function (e) { if (e.target === mask) close(); });
    return { el: mask, close: close };
  }

  function confirmModal(title, message, onOk) {
    var m = openModal(title, "<p style='margin:0'>" + esc(message) + "</p>",
      '<button class="btn cancel-ok">取消</button><button class="btn primary ok-go">确定</button>');
    $(".cancel-ok", m.el).onclick = m.close;
    $(".ok-go", m.el).onclick = function () { m.close(); onOk(); };
  }

  function toast(text, kind) {
    var root = $("#toastRoot");
    var el = document.createElement("div");
    el.className = "toast" + (kind === "ok" ? " ok" : kind === "err" ? " err" : "");
    el.textContent = text;
    root.appendChild(el);
    setTimeout(function () { el.remove(); }, 3200);
  }

  /* ---------- 导入 / 备份 ---------- */

  function adoptResume(data, msg) {
    var resume = data && data.resume ? data.resume : data;
    if (!resume || !resume.basic) throw new Error("文件格式不正确");
    state.resume = Object.assign(emptyResume(), resume);
    if (data && Array.isArray(data.tracker)) state.tracker = data.tracker;
    if (data && Array.isArray(data.checklist)) state.checklist = data.checklist;
    if (data && data.english && data.english.resume) {
      state.english = { enabled: !!data.english.enabled, resume: data.english.resume, updatedAt: data.english.updatedAt || Date.now() };
    }
    renderForm(); renderTracker(); renderChecklist(); schedulePreview(); saveState(true);
    toast(msg || "已导入", "ok");
  }

  function showPrintTips() {
    confirmModal("打印前小提示", "如果打印预览顶部出现时间、标题或网址，那是浏览器默认的页眉页脚，不是简历内容。请在打印设置里关闭“页眉和页脚”后再导出 PDF。", function () {
      printFitRequested = printFitRequested || !!state.compactMode;
      var printPage = $("#printArea .page");
      if (printFitRequested && printPage) {
        var fit = Math.min(0.96, printablePageHeight() / Math.max(printPage.scrollHeight, 1));
        document.documentElement.style.setProperty("--print-fit-scale", Math.max(0.82, fit).toFixed(3));
      }
      document.body.classList.toggle("print-fit-requested", printFitRequested);
      window.print();
      setTimeout(function () {
        printFitRequested = false;
        document.body.classList.remove("print-fit-requested");
      }, 1200);
    });
  }

  function openBackupModal() {
    var m = openModal("备份与导出",
      '<p style="margin:0 0 6px;color:var(--text-2);font-size:12.5px">选择一种导出方式：</p>' +
      '<div style="display:flex;flex-direction:column;gap:8px">' +
      '<button class="btn bk-html">📄 单文件 HTML 备份（含当前数据，可双击打开继续编辑）</button>' +
      '<button class="btn bk-json">💾 纯 JSON 数据（用于导入/迁移）</button>' +
      '<button class="btn bk-md">📝 Markdown 简历（方便粘贴到在线工具/投递系统）</button>' +
      "</div>");
    $(".bk-html", m.el).onclick = function () {
      if (!window.__RESUME_KIT_SINGLE_FILE__) { toast("当前环境缺少单文件模板，请使用「导出 JSON」", "err"); return; }
      var html = Ex.buildPortableHTML(window.__RESUME_KIT_SINGLE_FILE__, state.resume);
      var d = new Date();
      Ex.download("简历工作台-备份-" + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + ".html", html, "text/html");
      toast("单文件备份已下载", "ok");
      m.close();
    };
    $(".bk-json", m.el).onclick = function () {
      Ex.download("简历数据.json", Ex.toJSON({ resume: state.resume, tracker: state.tracker, checklist: state.checklist, english: state.english || null }), "application/json");
      toast("JSON 已导出", "ok");
      m.close();
    };
    $(".bk-md", m.el).onclick = function () {
      Ex.download("简历-" + (state.resume.basic.name || "未命名") + ".md", Ex.toMarkdown(state.resume, state.templateId), "text/markdown");
      toast("Markdown 已导出", "ok");
      m.close();
    };
  }

  function pad2(n) { return (n < 10 ? "0" : "") + n; }

  /* ---------- 照片 ---------- */

  function handlePhoto(file) {
    if (!file || !file.type || file.type.indexOf("image/") !== 0) { toast("请选择图片文件", "err"); return; }
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        var MAX = 360;
        var scale = Math.min(1, MAX / Math.max(img.width, img.height));
        var canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        var dataURL = canvas.toDataURL("image/jpeg", 0.85);
        state.resume.basic.photo = dataURL;
        renderForm(); schedulePreview(); saveState(true);
        toast("照片已更新", "ok");
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  /* ---------- 示例填充 ---------- */

  function fillSample() {
    var tpl = T[state.templateId] || T.tech;
    var hasData = state.resume.education.length || state.resume.internships.length || state.resume.projects.length;
    var doFill = function () {
      state.resume.education = [{
        id: uid(), school: "XX大学（示例，请替换）", major: "计算机科学与技术", degree: "本科",
        start: "2021-09", end: "2025-06", gpa: "3.7/4.0", rank: "前 10%",
        courses: "数据结构、操作系统、计算机网络、数据库原理", honors: "校级一等奖学金、优秀学生"
      }];
      if (tpl.sampleInternship) {
        state.resume.internships = [Object.assign({ id: uid() }, tpl.sampleInternship)];
      }
      if (tpl.sampleProject) {
        state.resume.projects = [Object.assign({ id: uid() }, tpl.sampleProject)];
      }
      renderForm(); schedulePreview(); saveState(true);
      toast("已填入「" + tpl.name + "」岗位示例，请逐条替换为真实内容", "ok");
    };
    if (hasData) confirmModal("覆盖现有内容？", "当前已有教育/实习/项目内容，填入示例将覆盖它们。", doFill);
    else doFill();
  }

  /* ---------- 主题 ---------- */

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme || "light");
    state.theme = theme || "light";
  }
  function toggleTheme() {
    var next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    applyTheme(next);
    storeSet(THEME_KEY, next);
  }

  /* ---------- 事件绑定 ---------- */

  function renderBuildBadge() {
    var el = $("#buildBadge");
    if (!el) return;
    el.textContent = BUILD_ID;
    el.title = "如果你没看到这个 Build 编号，说明当前页面不是最新版本。";
  }

  function bindEvents() {
    /* 选项卡 */
    $("#tabs").addEventListener("click", function (e) {
      var btn = e.target.closest(".tab");
      if (!btn) return;
      $$(".tab").forEach(function (t) { t.classList.toggle("active", t === btn); });
      $$(".tab-panel").forEach(function (p) { p.classList.toggle("active", p.id === "tab-" + btn.dataset.tab); });
      if (btn.dataset.tab === "preview") setTimeout(function () { renderAllPreviews(); fitScale($("#previewBody")); }, 30);
    });

    /* 表单：事件委托 */
    $("#formPane").addEventListener("input", function (e) {
      var el = e.target;
      var path = el.dataset && el.dataset.path;
      if (path) {
        setByPath(path, el.value);
        schedulePreview();
        scheduleSave();
      }
    });
    $("#formPane").addEventListener("change", function (e) {
      var el = e.target;
      if (el.id === "formTemplateSelect") {
        state.templateId = el.value;
        renderForm();
        schedulePreview(); saveState(true);
        toast("已切换岗位模板：" + (T[state.templateId] || {}).name, "ok");
      }
      if (el.id === "formVariantSelect") {
        state.variant = el.value || "targeted";
        schedulePreview(); saveState(true);
        toast("已切换简历版本策略：" + (variantMeta()[state.variant] || {}).name, "ok");
      }
      var path = el.dataset && el.dataset.path;
      if (path) {
        setByPath(path, el.value);
        schedulePreview(); scheduleSave();
      }
      if (el.id === "jdTextInput") {
        state.jdText = normalizeJDText(el.value);
        schedulePreview(); scheduleSave();
      }
    });
    $("#formPane").addEventListener("click", function (e) {
      var head = e.target.closest(".form-section-head");
      if (head) {
        var sec = head.parentElement;
        sec.classList.toggle("collapsed");
        return;
      }
      var add = e.target.closest("[data-add]");
      if (add) {
        var key = add.dataset.add;
        var def = SECTION_DEFS[key];
        var item = {};
        def.fields.forEach(function (f) { item[f.k] = ""; });
        item.id = uid();
        state.resume[key].push(item);
        renderForm(); schedulePreview(); saveState(true);
        var card = $('.form-section[data-section="' + key + '"] .entry-card:last-child');
        if (card) card.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      var rm = e.target.closest("[data-remove]");
      if (rm) {
        state.resume[rm.dataset.remove].splice(Number(rm.dataset.index), 1);
        renderForm(); schedulePreview(); saveState(true);
        return;
      }
      /* 结束时间：至今 切换 */
      var nowOn = e.target.closest("[data-now-on]");
      if (nowOn) {
        setByPath(nowOn.dataset.nowOn, "至今");
        renderForm(); schedulePreview(); saveState(true);
        return;
      }
      var nowOff = e.target.closest("[data-now-off]");
      if (nowOff) {
        setByPath(nowOff.dataset.nowOff, "");
        renderForm(); schedulePreview(); saveState(true);
        return;
      }
      if (e.target.id === "btnPhoto") { $("#photoInput").click(); }
      if (e.target.id === "btnPhotoRemove") {
        state.resume.basic.photo = "";
        renderForm(); schedulePreview(); saveState(true);
      }
      /* 板块管理：上移 / 下移 / 显示隐藏 / 恢复默认 */
      var secUp = e.target.closest("[data-sec-up]");
      if (secUp) { moveSection(secUp.dataset.secUp, -1); return; }
      var secDown = e.target.closest("[data-sec-down]");
      if (secDown) { moveSection(secDown.dataset.secDown, 1); return; }
      var secToggle = e.target.closest("[data-sec-toggle]");
      if (secToggle) { toggleSection(secToggle.dataset.secToggle); return; }
      var secReset = e.target.closest("[data-sec-reset]");
      if (secReset) { resetSections(); return; }
    });
    $("#photoInput").addEventListener("change", function () {
      if (this.files && this.files[0]) handlePhoto(this.files[0]);
      this.value = "";
    });

    /* 顶栏 */
    $("#btnTheme").onclick = toggleTheme;
    $("#btnPrint").onclick = showPrintTips;
    $("#btnPrint2").onclick = showPrintTips;
    $("#btnBackup").onclick = openBackupModal;
    $("#btnImport").onclick = function () {
      var input = document.createElement("input");
      input.type = "file";
      input.accept = "application/json,.json";
      input.onchange = function () {
        var f = input.files && input.files[0];
        if (!f) return;
        var reader = new FileReader();
        reader.onload = function () {
          try {
            var data = JSON.parse(reader.result);
            if (!data || !data.resume) throw new Error("文件格式不正确");
            confirmModal("导入简历数据", "将用文件内容替换当前简历（含投递记录与清单）。当前数据请先备份。", function () {
              adoptResume(data, "导入成功");
            });
          } catch (err) {
            toast("导入失败：" + (err && err.message ? err.message : "文件格式错误"), "err");
          }
        };
        reader.readAsText(f);
      };
      input.click();
    };

    /* 预览页 */
    $("#styleSelect").addEventListener("change", function () {
      state.style = this.value;
      renderAllPreviews(); saveState(true);
    });
    $("#btnFillSample").onclick = fillSample;
    $("#btnCompareVersions").onclick = function () {
      var box = $("#previewCompare");
      if (box) box.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    $("#btnEnglish").onclick = toggleEnglish;
    $("#btnRetranslate").onclick = function () { generateEnglishResume(true); };
    $("#btnGoPreview").onclick = function () {
      $$(".tab").forEach(function (t) { t.classList.toggle("active", t.dataset.tab === "preview"); });
      $$(".tab-panel").forEach(function (p) { p.classList.toggle("active", p.id === "tab-preview"); });
      setTimeout(function () { renderAllPreviews(); fitScale($("#previewBody")); }, 30);
    };

    /* 体检 */
    $("#btnAudit").onclick = runAudit;
    $("#btnCopyReport").onclick = copyReport;
    $("#auditBody").addEventListener("click", function (e) {
      var jump = e.target.closest("[data-jump-entry]");
      if (!jump) return;
      var pair = String(jump.dataset.jumpEntry || "").split(":");
      var target = $('[data-path="' + pair[0] + '.' + pair[1] + '.content"]') || $('[data-path="' + pair[0] + '.' + pair[1] + '.note"]') || $('[data-path="' + pair[0] + '.' + pair[1] + '.items"]');
      if (target) {
        showTab("edit");
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        target.focus();
      }
    });

    /* 求职台 */
    $("#btnAddApp").onclick = addApp;
    $("#btnExportApps").onclick = exportAppsCSV;
    $("#appTableWrap").addEventListener("input", function (e) {
      var el = e.target;
      if (!el.dataset.app) return;
      var app = state.tracker.filter(function (a) { return a.id === el.dataset.app; })[0];
      if (app) { app[el.dataset.k] = el.value; scheduleSave(); }
    });
    $("#appTableWrap").addEventListener("change", function (e) {
      var el = e.target;
      if (!el.dataset.app) return;
      var app = state.tracker.filter(function (a) { return a.id === el.dataset.app; })[0];
      if (app) { app[el.dataset.k] = el.value; renderTracker(); scheduleSave(); }
    });
    $("#appTableWrap").addEventListener("click", function (e) {
      var del = e.target.closest("[data-appdel]");
      if (del) {
        state.tracker = state.tracker.filter(function (a) { return a.id !== del.dataset.appdel; });
        renderTracker(); saveState(true);
      }
    });
    $("#checklist").addEventListener("change", function (e) {
      var el = e.target;
      if (!el.dataset.check) return;
      var seg = el.dataset.check.split(".").map(Number);
      state.checklist[seg[0]].items[seg[1]].done = el.checked;
      renderChecklist(); saveState(true);
    });
    $("#checklist").addEventListener("click", function (e) {
      if (e.target.id === "btnAddCheck") addCheckItem();
    });

    /* AI */
    $("#aiBody").addEventListener("input", function (e) {
      if (e.target.classList && e.target.classList.contains("fact-answer")) {
        setFollowupValue(e.target.dataset.followupId, e.target.value);
        scheduleSave();
      }
    });
    $("#aiBody").addEventListener("click", function (e) {
      if (e.target.id === "btnSaveAI") {
        var key = $("#aiKey").value.trim();
        if (!key) { toast("请输入 API Key", "err"); return; }
        var cfg = AI.loadConfig() || {};
        cfg.key = key;
        cfg.model = $("#aiModel").value;
        AI.saveConfig(cfg);
        toast("API Key 已保存到本机", "ok");
      }
      if (e.target.id === "btnClearAI") {
        AI.saveConfig(null);
        $("#aiKey").value = "";
        toast("已清除 API Key", "ok");
      }
      if (e.target.id === "btnAIDiagnose") runAITask("diagnose");
      if (e.target.id === "btnAISuggest") runAITask("suggest");
      if (e.target.id === "btnAIRewrite") runAITask("rewrite");
      if (e.target.id === "btnAIPolish") runAITask("polish");
      var applyBtn = e.target.closest("[data-followup-apply]");
      if (applyBtn) {
        var id = applyBtn.dataset.followupApply;
        var bits = String(id || "").split(":");
        if (bits.length >= 2 && applyFollowupsToEntry(bits[0], Number(bits[1]))) {
          renderForm();
          schedulePreview();
          saveState(true);
          toast("补充事实已回填到经历中", "ok");
        } else {
          toast("当前没有可回填的事实内容", "err");
        }
      }
      var jumpBtn = e.target.closest("[data-followup-jump]");
      if (jumpBtn) {
        var pair = String(jumpBtn.dataset.followupJump || "").split(":");
        var target = $('[data-path="' + pair[0] + '.' + pair[1] + '.content"]');
        if (target) {
          showTab("edit");
          target.scrollIntoView({ behavior: "smooth", block: "center" });
          target.focus();
        }
      }
      var aiBtn = e.target.closest("[data-followup-ai]");
      if (aiBtn) {
        var pair2 = String(aiBtn.dataset.followupAi || "").split(":");
        runFollowupRewrite(pair2[0], Number(pair2[1]));
      }
    });
  }

  /* ---------- 初始化 ---------- */

  function init() {
    ensureResumeShape();
    normalizeSections();
    var savedTheme = storeGet(THEME_KEY);
    applyTheme(savedTheme || (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));

    var stySel = $("#styleSelect");
    var STYLES = [["blue", "简约蓝"], ["business", "商务灰"], ["fresh", "清新绿"], ["modern", "现代紫"], ["minimal", "极简黑"], ["warm", "暖橙版"], ["slate", "蓝灰版"]];
    stySel.innerHTML = STYLES.map(function (s) {
      return '<option value="' + s[0] + '"' + (state.style === s[0] ? " selected" : "") + ">" + s[1] + "</option>";
    }).join("");

    renderBuildBadge();
    renderForm();
    renderTimeline();
    renderTracker();
    renderChecklist();
    renderAIBody();
    renderAllPreviews();
    updateEnglishButtons();
    bindEvents();

    var boot = window.__RESUME_KIT_BOOT_DATA__;
    if (boot && boot.resume) {
      toast("已加载便携版内嵌数据，编辑后将自动保存", "ok");
    } else {
      setTimeout(function () { showSaveStatus("已就绪 · 自动保存开启"); }, 600);
    }

    /* 容器尺寸变化时重新缩放预览 */
    ["miniPreviewBody", "previewBody"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el && window.ResizeObserver) {
        new ResizeObserver(function () { fitScale(el); }).observe(el);
      }
    });
    window.addEventListener("resize", function () {
      renderAllPreviews();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
