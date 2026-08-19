/* export.js — 导出模块：Markdown / JSON / 单文件备份
 * 依赖全局 RESUME_TEMPLATES。暴露全局 ResumeExport。
 */
(function (global) {
  "use strict";

  function hasText(v) { return typeof v === "string" && v.trim().length > 0; }
  function j(v) { return (v || "").trim(); }

  /* 渲染一段经历内容为 Markdown 列表 */
  function bulletsToMd(content) {
    if (!hasText(content)) return "";
    return content.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean)
      .map(function (l) { return "- " + l; }).join("\n");
  }

  /* 生成 Markdown 简历全文 */
  function toMarkdown(resume, templateId) {
    var tpl = (templateId && global.RESUME_TEMPLATES && global.RESUME_TEMPLATES[templateId]) || null;
    var L = [];
    var b = (resume && resume.basic) || {};
    var t = (resume && resume.target) || {};

    L.push("# " + (b.name || "（姓名）"));
    var contact = [];
    if (hasText(b.phone)) contact.push("电话 " + b.phone);
    if (hasText(b.email)) contact.push("邮箱 " + b.email);
    if (hasText(b.city)) contact.push("城市 " + b.city);
    if (hasText(b.birth)) contact.push("出生 " + b.birth);
    if (hasText(b.website)) contact.push("主页 " + b.website);
    if (hasText(b.github)) contact.push("GitHub " + b.github);
    if (contact.length) L.push("> " + contact.join(" ｜ "));
    L.push("");

    if (hasText(t.position) || hasText(t.industry) || hasText(t.salary)) {
      L.push("## 求职意向");
      L.push("- 目标岗位：" + (t.position || "—"));
      if (hasText(t.industry)) L.push("- 意向行业：" + t.industry);
      if (hasText(t.city)) L.push("- 意向城市：" + t.city);
      if (hasText(t.salary)) L.push("- 期望薪资：" + t.salary);
      if (hasText(t.availability)) L.push("- 可到岗时间：" + t.availability);
      L.push("");
    }

    var edu = (resume && resume.education) || [];
    if (edu.length) {
      L.push("## 教育背景");
      edu.forEach(function (e) {
        var head = [j(e.school), j(e.major), j(e.degree)].filter(Boolean).join(" · ");
        var range = [j(e.start), j(e.end)].filter(Boolean).join(" - ");
        L.push("**" + head + "**" + (range ? "（" + range + "）" : ""));
        var meta = [];
        if (hasText(e.gpa)) meta.push("GPA " + e.gpa);
        if (hasText(e.rank)) meta.push("排名 " + e.rank);
        if (meta.length) L.push("- " + meta.join("；"));
        if (hasText(e.courses)) L.push("- 主修课程：" + e.courses);
        if (hasText(e.honors)) L.push("- 在校荣誉：" + e.honors);
        L.push("");
      });
    }

    function section(title, arr, headFn, bodyFn) {
      if (!arr || !arr.length) return;
      L.push("## " + title);
      arr.forEach(function (it) {
        var head = headFn(it);
        if (head) L.push("### " + head);
        bodyFn(it).forEach(function (line) { if (line) L.push(line); });
        L.push("");
      });
    }

    section("实习经历", (resume && resume.internships) || [],
      function (it) { return [j(it.company), j(it.title)].filter(Boolean).join(" · ") + (hasText(it.start) || hasText(it.end) ? "（" + [j(it.start), j(it.end)].filter(Boolean).join(" - ") + "）" : ""); },
      function (it) { return bulletsToMd(it.content).split("\n"); });

    section("项目经历", (resume && resume.projects) || [],
      function (it) {
        var parts = [j(it.name)];
        if (hasText(it.role)) parts.push("（" + it.role + "）");
        if (hasText(it.tech)) parts.push(" 技术栈：" + it.tech);
        return parts.join("");
      },
      function (it) { return bulletsToMd(it.content).split("\n"); });

    section("校园经历", (resume && resume.campus) || [],
      function (it) { return [j(it.org), j(it.role)].filter(Boolean).join(" · "); },
      function (it) { return bulletsToMd(it.content).split("\n"); });

    section("科研成果", (resume && resume.research) || [],
      function (it) {
        var head = [j(it.kind), j(it.title)].filter(Boolean).join(" · ");
        var meta = [j(it.role), j(it.venue), j(it.date)].filter(Boolean).join(" · ");
        return head + (meta ? "（" + meta + "）" : "");
      },
      function (it) { return bulletsToMd(it.note).split("\n"); });

    var awards = (resume && resume.awards) || [];
    if (awards.length) {
      L.push("## 荣誉奖项");
      awards.forEach(function (a) {
        L.push("- " + [j(a.name), j(a.level), j(a.date)].filter(Boolean).join(" · "));
      });
      L.push("");
    }

    var skills = (resume && resume.skills) || [];
    if (skills.length) {
      L.push("## 技能");
      skills.forEach(function (s) {
        if (hasText(s.category) || hasText(s.items)) {
          L.push("- " + (s.category ? "**" + s.category + "**：" : "") + (s.items || ""));
        }
      });
      L.push("");
    }

    if (hasText(resume && resume.evaluation)) {
      L.push("## 自我评价");
      L.push(resume.evaluation.trim());
      L.push("");
    }
    if (hasText(resume && resume.extra)) {
      L.push("## 其他");
      L.push(resume.extra.trim());
    }

    return L.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
  }

  function toJSON(payload) {
    return JSON.stringify(Object.assign({ app: "resume-kit", version: 2, exportedAt: new Date().toISOString() }, payload), null, 2);
  }

  /* 浏览器端下载辅助（无 DOM 环境自动跳过；无 createObjectURL 时退化为 data: URL） */
  function download(filename, content, mime) {
    if (typeof document === "undefined") return;
    var a = document.createElement("a");
    a.download = filename;
    try {
      if (typeof URL !== "undefined" && typeof URL.createObjectURL === "function" && typeof Blob !== "undefined") {
        var blob = new Blob([content], { type: (mime || "text/plain") + ";charset=utf-8" });
        var url = URL.createObjectURL(blob);
        a.href = url;
        document.body.appendChild(a);
        a.click();
        setTimeout(function () {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 100);
        return;
      }
    } catch (e) { /* fall through to data: URL */ }
    a.href = "data:" + (mime || "text/plain") + ";charset=utf-8," + encodeURIComponent(content);
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { document.body.removeChild(a); }, 100);
  }

  /* 导出便携版单文件 HTML：把当前数据注入到单文件模板中
   * 注入点必须是 <head> 之后、业务脚本之前的注释锚点（build.js 生成），
   * 这样 app.js 启动时就能读到 __RESUME_KIT_BOOT_DATA__。
   */
  function buildPortableHTML(singleFileHTML, resume) {
    var anchor = "<!--__RESUME_KIT_DATA__-->";
    var marker = "window.__RESUME_KIT_BOOT_DATA__";
    var payload = JSON.stringify({ app: "resume-kit", version: 1, exportedAt: new Date().toISOString(), resume: resume })
      .replace(/</g, "\\u003c");
    var script = "\n<script>\n" + marker + " = " + payload + ";\n<\/script>";
    if (singleFileHTML.indexOf(anchor) >= 0) return singleFileHTML.replace(anchor, script);
    return singleFileHTML.replace(/<head>/i, "<head>" + script);
  }

  /* 解析便携版注入数据（不存在返回 null） */
  function parseBootData() {
    if (typeof window !== "undefined" && window.__RESUME_KIT_BOOT_DATA__) {
      var d = window.__RESUME_KIT_BOOT_DATA__;
      if (d && d.resume) return d.resume;
    }
    return null;
  }

  global.ResumeExport = {
    toMarkdown: toMarkdown,
    toJSON: toJSON,
    download: download,
    buildPortableHTML: buildPortableHTML,
    parseBootData: parseBootData
  };
})(typeof window !== "undefined" ? window : globalThis);
