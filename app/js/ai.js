/* ai.js — 可选 DeepSeek AI 优化模块（本地规则之外的增强功能）
 * API Key 仅保存在浏览器 localStorage，不经过任何第三方服务器。
 * 暴露全局 ResumeAI。
 */
(function (global) {
  "use strict";

  var STORAGE_KEY = "resumeKit:ai";
  var DEFAULT_BASE = "https://api.deepseek.com";
  var DEFAULT_MODEL = "deepseek-chat";

  /* ---------- 配置存取 ---------- */

  function loadConfig() {
    try {
      var raw = global.localStorage && global.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var c = JSON.parse(raw);
        if (c && c.key) return { key: c.key, base: c.base || DEFAULT_BASE, model: c.model || DEFAULT_MODEL };
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  function saveConfig(cfg) {
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
    } catch (e) { /* ignore */ }
  }

  /* ---------- 调用 DeepSeek ---------- */

  /**
   * @param messages [{role, content}]
   * @param cfg {key, base, model}
   * @returns 模型返回文本
   */
  async function chat(messages, cfg, signal) {
    var base = (cfg && cfg.base) || DEFAULT_BASE;
    var model = (cfg && cfg.model) || DEFAULT_MODEL;
    var key = cfg && cfg.key;
    if (!key) throw new Error("未配置 API Key，请先在「AI 优化」面板中填写。");

    var resp = await fetch(base.replace(/\/+$/, "") + "/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + key
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        temperature: 0.6,
        stream: false
      }),
      signal: signal
    });
    if (!resp.ok) {
      var detail = "";
      try { detail = (await resp.json()).error && (await resp.json()).error.message; } catch (e) { /* ignore */ }
      throw new Error("API 请求失败（HTTP " + resp.status + "）" + (detail ? "：" + detail : ""));
    }
    var data = await resp.json();
    var text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!text) throw new Error("API 返回内容为空，请重试。");
    return text.trim();
  }

  /* ---------- 提示词与业务方法 ---------- */

  var SYSTEM_HR = "你是一位深耕校招 10 年的资深 HR 兼简历顾问，熟悉国内互联网大厂、国企、银行的校招简历筛选标准。你的任务不是把话写漂亮，而是帮助候选人把真实经历写清楚、写具体、写得更像能过筛选的简历。必须遵守：1）不编造任何事实、数字、头衔、职责；2）如果材料不足，要明确指出需要补充什么；3）优先强调动作、交付物、结果、影响范围；4）如果给了 JD，就按 JD 调整重点；5）回答全部用中文，直接、可执行、不空泛。";

  function compactResume(resume) {
    // 传给模型的简历压缩文本（去掉 photo 等无关字段）
    var fields = ["basic", "target", "education", "internships", "projects", "campus", "awards", "skills", "evaluation", "extra"];
    var out = {};
    fields.forEach(function (k) { if (resume && resume[k] !== undefined) out[k] = resume[k]; });
    if (out.basic) delete out.basic.photo;
    var s = JSON.stringify(out);
    return s.length > 6000 ? s.slice(0, 6000) + "…（内容过长已截断）" : s;
  }

  /**
   * 整体优化建议：针对简历与目标岗位给出 5-8 条具体改进意见。
   */
  function aiSuggest(resume, template, cfg, signal, jdText) {
    var tplName = template && template.name ? template.name : "未指定岗位";
    return chat([
      { role: "system", content: SYSTEM_HR },
      { role: "user", content:
        "以下是某应届生的简历数据（JSON）与目标岗位：\n目标岗位：" + tplName + "\n简历：\n" + compactResume(resume) +
        (jdText ? "\n\n目标 JD：\n" + String(jdText).slice(0, 2500) : "") +
        "\n\n请先判断这份简历最影响投递的 3-4 个问题，再给修改建议。重点看：①经历是否写清楚做了什么 ②有没有结果和量化 ③有没有空话或堆职责 ④和目标岗位/JD 是否匹配。输出要尽量短，方便直接照着改。格式固定为：1. 问题：...｜修改：...｜示例：...。每条控制在 3 行内，不要写长解释，不要客套话。" }
    ], cfg, signal);
  }

  /**
   * 岗位定向改写：按目标岗位的关键词与写法要求，输出各经历板块的改写示例。
   */
  function aiRewrite(resume, template, cfg, signal, jdText) {
    var tplName = template && template.name ? template.name : "未指定岗位";
    var kws = template && template.keywords ? template.keywords.slice(0, 12).join("、") : "（未提供关键词）";
    return chat([
      { role: "system", content: SYSTEM_HR },
      { role: "user", content:
        "以下是某应届生的简历数据（JSON）：\n" + compactResume(resume) +
        "\n\n目标岗位：" + tplName + "，该岗位高频关键词：" + kws +
        (jdText ? "\n目标 JD：\n" + String(jdText).slice(0, 2500) : "") +
        "\n\n请把这份简历改成更适合投递的版本。规则：1）保留真实事实，不编造；2）优先改写实习和项目；3）每条经历都尽量写成“动作 + 结果”；4）如果没有数字，不要硬编，可以保留“建议补充数据”；5）如果给了 JD，优先保留与 JD 强相关的内容，弱相关内容可删减。输出必须简洁：每条经历以「【实习1】【实习2】【项目1】…」开头，下面只保留 2-4 条要点，每条一行，不要解释。" }
    ], cfg, signal);
  }

  /**
   * 润色单条经历：返回改写后的要点文本。
   */
  function aiPolish(entryTitle, content, contextText, cfg, signal) {
    return chat([
      { role: "system", content: SYSTEM_HR },
      { role: "user", content:
        "请把下面这段经历改得更像一条能投递的简历内容。要求：动词开头、每条一行、少空话、尽量体现动作和结果。只能改写表达，不得编造事实与数字；如果原文缺少结果或数字，可以用“（建议补充结果/数据）”提醒，但不要乱写。\n经历名称：" + entryTitle +
        (contextText ? "\n相关背景（目标岗位/技术栈）：" + contextText : "") +
        "\n原文：\n" + content +
        "\n\n直接输出 2-4 条改写后的要点，每条一行，不要解释，不要标题，不要 markdown 代码块。" }
    ], cfg, signal);
  }

  function aiDiagnose(resume, template, cfg, signal, jdText) {
    var tplName = template && template.name ? template.name : "未指定岗位";
    return chat([
      { role: "system", content: SYSTEM_HR },
      { role: "user", content:
        "请你先作为简历诊断顾问，而不是改写器。下面是一份应届生简历 JSON：\n" + compactResume(resume) +
        "\n\n目标岗位：" + tplName +
        (jdText ? "\n目标 JD：\n" + String(jdText).slice(0, 2500) : "") +
        "\n\n请输出简短、可直接执行的结果，共 3 个部分：\n" +
        "1. 【最先改的3点】列出最影响投递的 3 条问题；\n" +
        "2. 【还缺什么】列出 3-5 个最值得补充的事实；\n" +
        "3. 【下一步怎么做】用 2-3 句话说明先补哪段经历、再怎么改。\n\n" +
        "要求：不要长篇分析；不要直接生成整份新简历；不要编造；如果材料不足，要直接说“这段先补事实再改写”。" }
    ], cfg, signal);
  }

  function aiPolishWithFacts(entryTitle, content, factsText, contextText, cfg, signal, jdText) {
    return chat([
      { role: "system", content: SYSTEM_HR },
      { role: "user", content:
        "请把下面这段经历优化成更适合投递的简历要点。要求：动词开头、每条一行、突出你的贡献、结果优先、尽量量化；绝对不要编造事实。\n" +
        "经历名称：" + entryTitle +
        (contextText ? "\n目标岗位背景：" + contextText : "") +
        (jdText ? "\n目标 JD：\n" + String(jdText).slice(0, 1800) : "") +
        "\n原始经历：\n" + content +
        (factsText ? "\n\n用户补充事实：\n" + factsText : "") +
        "\n\n请直接输出最终可放进简历的 2-4 条要点，每条一行，不要解释，不要标题，不要 markdown 代码块。优先把用户补充的事实融进结果和职责表达里。" }
    ], cfg, signal);
  }

  /* 清理模型输出：去代码块围栏与前后缀 */
  function cleanOutput(text) {
    var t = (text || "").trim();
    t = t.replace(/^```[a-zA-Z]*\s*/m, "").replace(/\s*```\s*$/, "");
    t = t.replace(/^【[^】]*】\s*/gm, "").trim();
    t = t.replace(/^[-*•]\s*/gm, "");
    t = t.replace(/^\d+[\.、]\s*/gm, "");
    t = t.replace(/^(问题|修改|示例|还缺什么|最先改的3点|下一步怎么做)[:：]\s*/gm, "");
    return t.trim();
  }

  /* ---------- 简历中译英 ---------- */

  var SYSTEM_TRANSLATE = "你是一名专业的简历中译英翻译。任务：把用户提供的中文简历 JSON 完整翻译成英文简历 JSON。硬性要求：1）保持 JSON 的键名、结构、数组顺序完全不变；2）姓名按中文拼音音译（例如「张三」→「Zhang San」）；3）学校、公司、奖项、比赛等专有名词优先使用官方英文名，没有官方英文名时采用通用音译；4）职位、技能、课程、荣誉等使用校招简历中通行的标准英文表达；5）所有按行分隔的文本（如 content、note、evaluation、extra、courses、honors 等字段中的换行列表）逐行翻译，行数不得减少；6）保留原文中的 **加粗** 标记；7）只输出合法 JSON，不要输出任何解释、注释或 markdown 代码块。";

  /** 整份简历中译英：返回英文简历 JSON 文本（供 app 层解析）。 */
  function aiTranslate(resume, cfg, signal) {
    return chat([
      { role: "system", content: SYSTEM_TRANSLATE },
      { role: "user", content: "请把下面这份中文简历 JSON 翻译为英文简历 JSON：\n" + compactResumeForTranslate(resume) }
    ], cfg, signal);
  }

  function compactResumeForTranslate(resume) {
    var out = {};
    ["basic", "target", "education", "internships", "projects", "campus", "research", "awards", "skills", "evaluation", "extra"].forEach(function (k) {
      if (resume && resume[k] !== undefined) out[k] = resume[k];
    });
    if (out.basic) delete out.basic.photo;
    var s = JSON.stringify(out);
    return s.length > 12000 ? s.slice(0, 12000) + "…（内容过长已截断）" : s;
  }

  /** 从模型输出中提取第一个 JSON 对象（容错解析）。 */
  function extractJSON(text) {
    var s = String(text || "").trim();
    try { return JSON.parse(s); } catch (e) { /* try harder */ }
    var m = s.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch (e2) { /* give up */ } }
    return null;
  }

  global.ResumeAI = {
    loadConfig: loadConfig,
    saveConfig: saveConfig,
    chat: chat,
    aiSuggest: aiSuggest,
    aiRewrite: aiRewrite,
    aiPolish: aiPolish,
    aiDiagnose: aiDiagnose,
    aiPolishWithFacts: aiPolishWithFacts,
    aiTranslate: aiTranslate,
    extractJSON: extractJSON,
    cleanOutput: cleanOutput,
    DEFAULT_BASE: DEFAULT_BASE,
    DEFAULT_MODEL: DEFAULT_MODEL
  };
})(typeof window !== "undefined" ? window : globalThis);
