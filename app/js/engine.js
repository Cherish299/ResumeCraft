/* engine.js — 简历体检规则引擎（纯函数，无 DOM 依赖，可在 Node 中单测）
 * 暴露全局 ResumeEngine。
 *
 * 评分结构：总分 100 = 硬伤 30 + 量化与结果 20 + 表达与结构 15 + 关键词匹配 20 + 完整度 15
 */
(function (global) {
  "use strict";

  var T = (typeof global.RESUME_TEMPLATES !== "undefined") ? global.RESUME_TEMPLATES : {};
  var VERBS = (typeof global.RESUME_ACTION_VERBS !== "undefined") ? global.RESUME_ACTION_VERBS : [];
  var EMPTY_PHRASES = (typeof global.RESUME_EMPTY_PHRASES !== "undefined") ? global.RESUME_EMPTY_PHRASES : [];

  /* ---------- 工具 ---------- */

  function hasText(v) {
    return typeof v === "string" && v.trim().length > 0;
  }

  /* 板块是否被用户隐藏（opts.hidden[key]） */
  function isHidden(hidden, key) {
    return !!(hidden && hidden[key]);
  }

  function hasDigit(s) {
    return /\d/.test(s);
  }

  function norm(v) {
    return (v || "").replace(/\s+/g, " ").trim();
  }

  /* 把经历内容拆成"要点"列表：按换行拆，超长段落再按中文句读拆 */
  function splitBullets(text) {
    if (!hasText(text)) return [];
    var out = [];
    var lines = text.split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      if (line.length > 120) {
        var parts = line.split(/[。；]/).map(function (p) { return p.trim(); }).filter(Boolean);
        if (parts.length > 1) { out = out.concat(parts); continue; }
      }
      out.push(line);
    }
    return out;
  }

  /* 时间范围开头的行（如 "2024.06-2024.09"）视为标题行，不参与要点检查 */
  var TIME_PREFIX = /^(\d{4}[.\-/年]\d{0,4}[.\-/月]?\s*[-—~至]\s*\d{0,4}[.\-/年]?\d{0,4}[.\-/月]?)/;

  function isHeaderLine(line) {
    return TIME_PREFIX.test(line) || /^(职责|工作内容|项目描述|主要工作|主要职责)[:：]/.test(line);
  }

  function startsWithVerb(line) {
    for (var i = 0; i < VERBS.length; i++) {
      if (line.indexOf(VERBS[i]) === 0) return true;
    }
    return false;
  }

  function containsEmptyPhrase(line) {
    for (var i = 0; i < EMPTY_PHRASES.length; i++) {
      if (line.indexOf(EMPTY_PHRASES[i]) >= 0) return true;
    }
    return false;
  }

  function isValidPhone(p) {
    return /^1[3-9]\d{9}$/.test(p.replace(/[\s-]/g, ""));
  }

  function isValidEmail(e) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  }

  /* 收集所有"经历内容"条目（实习/项目/校园），返回 [{key, label, content}]；隐藏板块不参与 */
  function collectContentEntries(resume, hidden) {
    var entries = [];
    var lists = [
      ["internships", "实习经历"],
      ["projects", "项目经历"],
      ["campus", "校园经历"]
    ];
    for (var l = 0; l < lists.length; l++) {
      var key = lists[l][0], label = lists[l][1];
      if (isHidden(hidden, key)) continue;
      var arr = (resume && resume[key]) || [];
      for (var i = 0; i < arr.length; i++) {
        var it = arr[i] || {};
        var title = it.company || it.name || it.org || ("第" + (i + 1) + "条");
        entries.push({ key: key, index: i, label: label + " · " + title, content: it.content || "" });
      }
    }
    return entries;
  }

  /* 全文（含各字段）拼成纯文本，用于关键词匹配；隐藏板块不参与 */
  function fullText(resume, hidden) {
    var parts = [];
    function push(v) { if (hasText(v)) parts.push(norm(v)); }
    if (!resume) return "";
    push(resume.basic && resume.basic.name);
    push(resume.basic && resume.basic.phone);
    push(resume.basic && resume.basic.email);
    push(resume.basic && resume.basic.city);
    push(resume.basic && resume.basic.website);
    push(resume.basic && resume.basic.github);
    if (!isHidden(hidden, "target")) {
      push(resume.target && resume.target.position);
      push(resume.target && resume.target.industry);
    }
    if (!isHidden(hidden, "education")) (resume.education || []).forEach(function (e) { push(e.school); push(e.major); push(e.degree); push(e.courses); push(e.honors); });
    if (!isHidden(hidden, "internships")) (resume.internships || []).forEach(function (e) { push(e.company); push(e.title); push(e.content); });
    if (!isHidden(hidden, "projects")) (resume.projects || []).forEach(function (e) { push(e.name); push(e.role); push(e.tech); push(e.content); });
    if (!isHidden(hidden, "campus")) (resume.campus || []).forEach(function (e) { push(e.org); push(e.role); push(e.content); });
    if (!isHidden(hidden, "research")) (resume.research || []).forEach(function (e) { push(e.kind); push(e.title); push(e.role); push(e.venue); push(e.note); });
    if (!isHidden(hidden, "awards")) (resume.awards || []).forEach(function (e) { push(e.name); push(e.level); });
    if (!isHidden(hidden, "skills")) (resume.skills || []).forEach(function (e) { push(e.category); push(e.items); });
    if (!isHidden(hidden, "evaluation")) push(resume.evaluation);
    if (!isHidden(hidden, "extra")) push(resume.extra);
    return parts.join(" ");
  }

  /* ---------- 各分类检查 ---------- */

  function auditHard(resume, items, hidden) {
    var score = 30;
    var errors = 0, warns = 0;
    var b = (resume && resume.basic) || {};
    var t = (resume && resume.target) || {};
    var edu = (resume && resume.education) || [];

    function err(msg, detail) { errors++; items.push({ severity: "error", code: "hard", title: msg, detail: detail || "", section: "基本信息" }); }
    function warn(msg, detail) { warns++; items.push({ severity: "warn", code: "hard", title: msg, detail: detail || "", section: "基本信息" }); }

    if (!hasText(b.name)) err("未填写姓名", "简历最上方应写明姓名，方便 HR 快速识别。");
    if (!hasText(b.phone)) err("未填写手机号", "HR 联系你的第一渠道，务必填写。");
    else if (!isValidPhone(b.phone)) warn("手机号格式可能不正确", "建议使用 11 位大陆手机号（1[3-9] 开头），当前：" + b.phone);
    if (!hasText(b.email)) err("未填写邮箱", "建议使用常用邮箱，避免错过笔试/面试通知。");
    else if (!isValidEmail(b.email)) warn("邮箱格式可能不正确", "当前：" + b.email + "，请检查是否漏写 @ 或域名。");
    if (!isHidden(hidden, "education")) {
      if (edu.length === 0) err("未添加教育背景", "应届生简历必须包含教育背景（学校、专业、学历、起止时间）。");
      else {
        for (var i = 0; i < edu.length; i++) {
          var e = edu[i] || {};
          var missing = [];
          if (!hasText(e.school)) missing.push("学校");
          if (!hasText(e.major)) missing.push("专业");
          if (!hasText(e.degree)) missing.push("学历");
          if (!hasText(e.start) || !hasText(e.end)) missing.push("起止时间");
          if (missing.length) warn("教育经历第 " + (i + 1) + " 条缺少：" + missing.join("、"), "HR 需要确认你的毕业时间与学制。");
        }
      }
    }
    if (!isHidden(hidden, "target") && !hasText(t.position)) err("未填写求职意向（目标岗位）", "校招简历必须写明目标岗位，否则 HR 无法判断匹配度。（若你确实不需要该板块，可在「板块管理」中隐藏它）");
    if (!hasText(b.city)) warn("未填写所在城市/意向城市", "便于 HR 判断你是否在当地或能否到场面试。");

    return Math.max(0, score - errors * 6 - warns * 3);
  }

  function auditQuantified(resume, items, hidden) {
    var entries = collectContentEntries(resume, hidden);
    var withContent = entries.filter(function (e) { return hasText(e.content); });
    var max = 20;
    if (withContent.length === 0) {
      if (entries.length === 0) {
        items.push({ severity: "info", code: "quantified", title: "暂无实习/项目/校园经历内容", detail: "应届生可先用课程项目、竞赛、社团活动补充经历板块；写完内容后记得给每条加量化数据。", section: "经历" });
      } else {
        items.push({ severity: "warn", code: "quantified", title: "经历条目均为空", detail: "已添加 " + entries.length + " 条经历但内容为空，请补全每一条的描述。", section: "经历" });
      }
      return 0;
    }
    var quantified = withContent.filter(function (e) { return hasDigit(e.content); });
    var ratio = quantified.length / withContent.length;
    for (var i = 0; i < withContent.length; i++) {
      if (!hasDigit(withContent[i].content)) {
        items.push({
          severity: "warn", code: "quantified",
          title: "「" + withContent[i].label + "」没有量化数据",
          detail: "建议补充数字：规模（用户数/人数/金额）、效率（耗时/百分比/次数）、结果（增长 X%、降低 Y%）。例如「负责XX」→「负责XX，覆盖 5000+ 用户，转化率提升 18%」。",
          section: withContent[i].label
        });
      }
    }
    items.push({
      severity: ratio >= 0.6 ? "info" : "warn", code: "quantified",
      title: "量化比例：" + Math.round(ratio * 100) + "%（" + quantified.length + "/" + withContent.length + " 条含数字）",
      detail: "目标：80% 以上的经历要点包含具体数字。量化是校招简历拉开差距的关键。",
      section: "经历"
    });
    return Math.round(max * Math.min(1, ratio / 0.8));
  }

  function auditExpression(resume, items, hidden) {
    var entries = collectContentEntries(resume, hidden);
    var max = 15;
    var total = 0, verbMiss = 0, emptyMiss = 0, longMiss = 0, shortMiss = 0;
    var evaluated = false;
    for (var i = 0; i < entries.length; i++) {
      var bullets = splitBullets(entries[i].content);
      for (var j = 0; j < bullets.length; j++) {
        var line = bullets[j];
        if (isHeaderLine(line)) continue;
        total++;
        evaluated = true;
        if (!startsWithVerb(line)) {
          verbMiss++;
          if (verbMiss <= 5) items.push({
            severity: "warn", code: "expression",
            title: "「" + entries[i].label + "」的要点未以动词开头：" + line.slice(0, 24) + (line.length > 24 ? "…" : ""),
            detail: "建议以动作动词开头（负责/主导/搭建/优化/推动/独立完成…），体现你的主动性与贡献。",
            section: entries[i].label
          });
        }
        if (containsEmptyPhrase(line)) {
          emptyMiss++;
          items.push({
            severity: "warn", code: "expression",
            title: "「" + entries[i].label + "」出现空话表达：" + line.slice(0, 24) + (line.length > 24 ? "…" : ""),
            detail: "「学习能力强/认真负责/性格开朗」等空话没有信息量，请换成具体事实或删掉。",
            section: entries[i].label
          });
        }
        if (line.length > 70) { longMiss++; if (longMiss <= 3) items.push({ severity: "info", code: "expression", title: "要点过长（" + line.length + " 字）：" + line.slice(0, 20) + "…", detail: "建议拆成 2 条，每条聚焦一个动作+一个结果，方便 HR 快速扫读。", section: entries[i].label }); }
        if (line.length > 0 && line.length < 6) { shortMiss++; if (shortMiss <= 3) items.push({ severity: "info", code: "expression", title: "要点过短：" + line, detail: "太短的要点没有信息量，请补充具体动作与结果。", section: entries[i].label }); }
      }
    }
    if (!evaluated) {
      items.push({ severity: "info", code: "expression", title: "暂无经历内容可评估表达结构", detail: "写完经历后，本项会检查：动词开头、STAR 结构、空话与长度。", section: "经历" });
      return 0;
    }
    var miss = verbMiss + emptyMiss;
    var ratio = Math.max(0, 1 - miss / total);
    var pct = Math.round((1 - miss / total) * 100);
    items.push({
      severity: ratio >= 0.8 ? "info" : "warn", code: "expression",
      title: "表达质量：" + pct + "% 的要点以动作动词开头且无空话（" + (total - miss) + "/" + total + "）",
      detail: "参考 STAR 结构：背景（Situation）→ 任务（Task）→ 行动（Action，动词开头）→ 结果（Result，量化）。",
      section: "经历"
    });
    return Math.round(max * Math.min(1, ratio / 0.85));
  }

  function auditKeywords(resume, template, items, hidden) {
    var max = 20;
    var text = fullText(resume, hidden);
    var tpl = template || T.tech || { keywords: [] };
    var kws = tpl.keywords || [];
    if (kws.length === 0) return max;
    /* 纯拉丁/数字关键词用词边界匹配（避免 github 误命中 Git、https 误命中 HTTP、MySQL 误命中 SQL）；含中文/符号的关键词按子串匹配 */
    function keywordTest(kw) {
      var esc = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (/^[A-Za-z0-9_]+$/.test(kw)) return new RegExp("\\b" + esc + "\\b", "i").test(text);
      return text.toLowerCase().indexOf(kw.toLowerCase()) >= 0;
    }
    var matched = [], missing = [];
    for (var i = 0; i < kws.length; i++) {
      var kw = kws[i];
      if (keywordTest(kw)) matched.push(kw);
      else missing.push(kw);
    }
    var ratio = Math.min(1, matched.length / 8);
    var score = Math.round(max * ratio);
    if (matched.length < 8) {
      items.push({
        severity: matched.length >= 4 ? "warn" : "error", code: "keywords",
        title: "目标岗位「" + (tpl.name || "技术开发") + "」关键词命中 " + matched.length + " 个，建议补充：" + missing.slice(0, 6).join("、"),
        detail: "很多公司用系统初筛简历（JD 关键词匹配）。把岗位 JD 里的技术栈/能力词自然地写进项目与技能里，但不要编造不属实的内容。",
        section: "关键词"
      });
    } else {
      items.push({ severity: "info", code: "keywords", title: "关键词命中 " + matched.length + " 个，覆盖良好", detail: "继续保持，注意关键词必须真实对应你的经历。", section: "关键词" });
    }
    return score;
  }

  function auditCompleteness(resume, items, hidden) {
    var max = 15;
    var missing = [];
    var b = (resume && resume.basic) || {};
    var t = (resume && resume.target) || {};
    var edu = (resume && resume.education) || [];
    function chk(ok, label) { if (!ok) missing.push(label); }
    chk(hasText(b.name), "姓名");
    chk(hasText(b.phone), "手机号");
    chk(hasText(b.email), "邮箱");
    chk(hasText(b.city), "城市");
    chk(hasText(b.birth), "出生年月");
    chk(hasText(b.gender), "性别");
    chk(hasText(b.website) || hasText(b.github), "个人主页/GitHub");
    if (!isHidden(hidden, "target")) {
      chk(hasText(t.position), "目标岗位");
      chk(hasText(t.salary), "期望薪资");
      chk(hasText(t.availability), "可到岗时间");
    }
    if (!isHidden(hidden, "education")) {
      for (var i = 0; i < edu.length; i++) {
        var e = edu[i] || {};
        chk(hasText(e.school) && hasText(e.major) && hasText(e.degree), "教育背景完整信息（第" + (i + 1) + "条）");
        chk(hasText(e.gpa) || hasText(e.rank), "GPA或排名（第" + (i + 1) + "条）");
      }
    }
    var hasSkill = ((resume && resume.skills) || []).some(function (s) { return hasText(s.category) && hasText(s.items); });
    if (!isHidden(hidden, "skills")) chk(hasSkill, "技能分类与内容");
    if (!isHidden(hidden, "evaluation")) chk(hasText(resume && resume.evaluation), "自我评价");
    var ratio = Math.max(0, 1 - missing.length / 16);
    if (missing.length) {
      items.push({
        severity: missing.length > 5 ? "warn" : "info", code: "completeness",
        title: "可补充的字段（" + missing.length + " 项）：" + missing.slice(0, 8).join("、"),
        detail: "校招简历建议信息完整：出生年月、期望薪资、可到岗时间（毕业时间）、GPA/排名等都是常见考察点。",
        section: "完整度"
      });
    }
    return Math.round(max * ratio);
  }

  /* ---------- 主入口 ---------- */

  /**
   * @param resume 简历数据对象（与编辑器 state 同构）
   * @param templateId 岗位模板 id（如 'tech'），缺省自动选第一个
   * @param opts 可选 { hidden: {板块key: true} } —— 用户隐藏的板块不参与检查
   * @returns { total, passLevel, categories, items, summary }
   */
  function audit(resume, templateId, opts) {
    var items = [];
    var hidden = opts && opts.hidden;
    var template = (templateId && T[templateId]) || T.tech || { name: "技术开发", keywords: [] };

    var hard = auditHard(resume, items, hidden);
    var quantified = auditQuantified(resume, items, hidden);
    var expression = auditExpression(resume, items, hidden);
    var keywords = auditKeywords(resume, template, items, hidden);
    var completeness = auditCompleteness(resume, items, hidden);
    var total = hard + quantified + expression + keywords + completeness;

    var passLevel = total >= 85 ? "优秀" : total >= 70 ? "良好" : total >= 55 ? "待改进" : "需大改";

    /* 自动总结：取最严重的 3 条 */
    var order = { error: 0, warn: 1, info: 2 };
    var top = items.slice().sort(function (a, b) { return order[a.severity] - order[b.severity]; }).slice(0, 3);
    var summary;
    if (items.length === 0) summary = "简历质量很好，继续完善细节即可。";
    else summary = "当前总分 " + total + " 分（" + passLevel + "）。优先处理：" + top.map(function (it) { return it.title; }).join("；") + "。";

    return {
      total: total,
      passLevel: passLevel,
      categories: [
        { key: "hard", name: "硬伤检查", score: hard, max: 30, tip: "姓名/联系方式/教育背景/求职意向等必备项" },
        { key: "quantified", name: "量化与结果", score: quantified, max: 20, tip: "经历要点中数字的占比（目标 80%+）" },
        { key: "expression", name: "表达与结构", score: expression, max: 15, tip: "动词开头、STAR 结构、无空话、长度适中" },
        { key: "keywords", name: "关键词匹配", score: keywords, max: 20, tip: "目标岗位关键词命中情况（系统初筛用）" },
        { key: "completeness", name: "完整度", score: completeness, max: 15, tip: "常用字段是否齐全" }
      ],
      items: items,
      summary: summary
    };
  }

  global.ResumeEngine = {
    audit: audit,
    splitBullets: splitBullets,
    isValidPhone: isValidPhone,
    isValidEmail: isValidEmail,
    startsWithVerb: startsWithVerb,
    containsEmptyPhrase: containsEmptyPhrase,
    fullText: fullText
  };
})(typeof window !== "undefined" ? window : globalThis);
