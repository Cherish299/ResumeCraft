#!/usr/bin/env node
/* scripts/smoke/smoke-dom.mjs — 用 jsdom 加载单文件应用做 DOM 冒烟测试
 * 用法：node scripts/smoke/smoke-dom.mjs
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const html = readFileSync(join(root, "dist", "resume-workbench.html"), "utf8");

const errors = [];
const consoleErrors = [];

const dom = new JSDOM(html, {
  url: "https://localhost/resume-kit/",
  runScripts: "dangerously",
  pretendToBeVisual: true,
  beforeParse(window) {
    window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    window.ResizeObserver = undefined; /* jsdom 无 ResizeObserver，验证 app 的防御性分支 */
  }
});
dom.window.addEventListener("error", (e) => errors.push(e.message || String(e.error)));
const vc = dom.window._virtualConsole;
if (vc) {
  const orig = vc.emit.bind(vc);
  vc.emit = (method, ...args) => {
    const msg = String(args[0] && args[0].message || args[0]);
    if (method === "jsdomError" && /Not implemented: window\.(print|prompt)/.test(msg)) return;
    if (method === "jsdomError" || method === "error") consoleErrors.push(msg);
    return orig(method, ...args);
  };
}

const win = dom.window;
const doc = win.document;
let failed = 0;
function assert(cond, name, extra) {
  if (cond) console.log("  ✓ " + name);
  else { failed++; console.log("  ✗ " + name + (extra ? "  → " + extra : "")); }
}
function $(s) { return doc.querySelector(s); }
function $$(s) { return Array.from(doc.querySelectorAll(s)); }

await new Promise((r) => setTimeout(r, 500));

/* ---------- 初始渲染 ---------- */
console.log("[1] 初始渲染");
assert($$(".tab").length === 5, "5 个选项卡（实际 " + $$(".tab").length + "）");
assert($$("#formPane .form-section").length >= 8, "表单板块 ≥ 8 个（实际 " + $$("#formPane .form-section").length + "）");
assert($("#templateSelect").options.length >= 10, "岗位模板 >= 10 个（实际 " + $("#templateSelect").options.length + "）");
assert($("#styleSelect").options.length === 4, "简历风格 4 个");
assert($("#variantSelect").options.length === 3, "版本策略 3 个");
assert(!!$("#miniPreviewBody .page"), "迷你预览渲染出 .page");
assert($("#miniPreviewBody .p-name").textContent.includes("姓名"), "预览显示姓名占位");
assert(!!$("#printArea .page"), "打印区同步渲染");
assert(!!$("#timeline .tl-item"), "时间线渲染");
assert($$("#checklist .cl-group").length === 3, "准备清单 3 组");
assert(!!$("#aiBody .ai-card"), "AI 面板渲染");
assert(!!$("#btnAIDiagnose"), "AI 诊断按钮存在");
assert(!!$("#formTemplateSelect"), "表单内模板选择器");
assert(win.__RESUME_KIT_SINGLE_FILE__ && win.__RESUME_KIT_SINGLE_FILE__.includes("<!DOCTYPE html>"), "内置单文件模板可用");
assert(!errors.length, "无未捕获 JS 错误" + (errors.length ? "：" + errors.join(" | ") : ""));

/* ---------- 表单交互 ---------- */
console.log("[2] 表单交互与实时预览");
const nameInput = $('[data-path="basic.name"]');
nameInput.value = "李四";
nameInput.dispatchEvent(new win.Event("input", { bubbles: true }));
await new Promise((r) => setTimeout(r, 250));
assert($("#miniPreviewBody .p-name").textContent.includes("李四"), "输入姓名后预览更新");
const posInput = $('[data-path="target.position"]');
posInput.value = "后端开发工程师（校招）";
posInput.dispatchEvent(new win.Event("input", { bubbles: true }));
const jdInput = $("#jdTextInput");
jdInput.value = "负责推荐系统后端服务优化，熟悉 Redis、Kafka、微服务治理。";
jdInput.dispatchEvent(new win.Event("input", { bubbles: true }));
await new Promise((r) => setTimeout(r, 250));
assert($("#miniPreviewBody .p-target").textContent.includes("后端开发工程师"), "求职意向同步到预览");

const addProject = $('[data-add="projects"]');
addProject.click();
assert($$('[data-remove="projects"]').length === 1, "添加项目条目");
const projName = $('[data-path="projects.0.name"]');
projName.value = "校园二手平台";
projName.dispatchEvent(new win.Event("input", { bubbles: true }));
const projContent = $('[data-path="projects.0.content"]');
projContent.value = "独立完成用户模块开发，支撑 5000+ 注册用户。\n使用缓存优化接口，延迟降低 60%。";
projContent.dispatchEvent(new win.Event("input", { bubbles: true }));
await new Promise((r) => setTimeout(r, 250));
assert($("#miniPreviewBody .p-sec").textContent.includes("校园二手平台"), "项目出现在预览");
$('[data-remove="projects"]').click();
assert($$('[data-remove="projects"]').length === 0, "删除项目条目");

/* ---------- 示例填充 + 体检 ---------- */
console.log("[3] 示例填充与体检");
$("#btnFillSample").click();
await new Promise((r) => setTimeout(r, 200));
assert($$('[data-remove="projects"]').length >= 1, "填入示例后存在项目条目");
$("#btnAudit").click();
assert(!!$("#auditBody .score-card"), "体检渲染得分卡");
const scoreText = ($("#auditBody .score-ring .num").textContent || "").trim();
const scoreNum = parseInt((scoreText.match(/\d+/) || ["0"])[0], 10);
assert(scoreNum > 0 && scoreNum <= 100, "体检分数有效（" + scoreText + "）");
assert($$("#auditBody .issue").length > 0, "体检列出问题条目");
assert($("#auditSummary").textContent.length > 10, "体检摘要生成");
$("#btnCopyReport").click();
await new Promise((r) => setTimeout(r, 100));
assert($$("#toastRoot .toast").length >= 1, "复制报告触发反馈（toast）");

/* ---------- 求职台 ---------- */
console.log("[4] 求职台");
$("#btnAddApp").click();
assert($$("#appTableWrap tbody tr").length === 1, "添加投递记录行");
const appInput = $("#appTableWrap input[data-k=company]");
appInput.value = "字节跳动";
appInput.dispatchEvent(new win.Event("input", { bubbles: true }));
await new Promise((r) => setTimeout(r, 500));
const saved = win.localStorage.getItem("resumeKit:state:v1");
assert(!!saved && saved.includes("字节跳动"), "输入内容已自动保存到 localStorage");
$("#btnAddCheck").click(); /* prompt 在 jsdom 中不可用，跳过 */
assert($("#checkProgress").textContent.length > 0, "清单进度显示");

/* ---------- 备份与主题 ---------- */
console.log("[5] 备份 / 主题 / 选项卡");
$("#btnBackup").click();
assert(!!$("#modalRoot .modal"), "备份弹窗打开");
$(".bk-md", $("#modalRoot")).click();
assert($$("#toastRoot .toast").length >= 2, "导出 Markdown 触发 toast");
$("#btnTheme").click();
assert(doc.documentElement.getAttribute("data-theme") === "dark", "主题切换为深色");
$$(".tab").forEach((t) => { if (t.dataset.tab === "job") t.click(); });
assert($("#tab-job").classList.contains("active"), "切换到求职台选项卡");
$$(".tab").forEach((t) => { if (t.dataset.tab === "preview") t.click(); });
assert($("#tab-preview").classList.contains("active"), "切换到预览选项卡");
const styleSel = $("#styleSelect");
styleSel.value = "business";
styleSel.dispatchEvent(new win.Event("change", { bubbles: true }));
assert($("#previewBody .page").classList.contains("business"), "切换简历风格生效");
const variantSel = $("#variantSelect");
variantSel.value = "internet";
variantSel.dispatchEvent(new win.Event("change", { bubbles: true }));
await new Promise((r) => setTimeout(r, 150));
assert($("#previewBody .page"), "切换版本策略后预览仍存在");
const tplSel3 = $("#templateSelect");
tplSel3.value = "design";
tplSel3.dispatchEvent(new win.Event("change", { bubbles: true }));
await new Promise((r) => setTimeout(r, 150));
assert($("#previewBody .page").classList.contains("role-design"), "岗位模板切换会附带可见版式类");
$("#btnAutoCompress").click();
await new Promise((r) => setTimeout(r, 150));
assert($$("#toastRoot .toast").length >= 3, "智能压缩触发反馈（toast）");

/* ---------- 板块管理 ---------- */
console.log("[7] 板块管理（顺序 / 显示隐藏）");
assert($$(".sec-mgr-row").length === 10, "板块管理 10 行（实际 " + $$(".sec-mgr-row").length + "）");
/* 隐藏求职意向 */
$('[data-sec-toggle="target"]').click();
await new Promise((r) => setTimeout(r, 200));
assert(!$('[data-path="target.position"]'), "隐藏后表单无求职意向字段");
assert(!$("#miniPreviewBody .p-target"), "隐藏后预览无求职意向");
$("#btnAudit").click();
const auditTitles = Array.from(doc.querySelectorAll("#auditBody .issue-title")).map((el) => el.textContent).join("|");
assert(!auditTitles.includes("求职意向"), "隐藏后体检不再提示求职意向");
/* 重新显示 */
$('[data-sec-toggle="target"]').click();
await new Promise((r) => setTimeout(r, 200));
assert(!!$('[data-path="target.position"]'), "重新显示求职意向");
/* 顺序调整：教育背景下移一位 */
$('[data-sec-down="education"]').click();
await new Promise((r) => setTimeout(r, 200));
let orderNames = Array.from(doc.querySelectorAll(".sec-mgr-row .sec-mgr-name")).map((el) => el.textContent);
assert(orderNames.indexOf("实习经历") < orderNames.indexOf("教育背景"), "板块管理顺序已调整（" + orderNames.join(">") + "）");
let secTitles = Array.from(doc.querySelectorAll("#miniPreviewBody .p-sec-h")).map((el) => el.textContent.trim());
const iIntern = secTitles.findIndex((t) => t.includes("实习经历"));
const iEdu = secTitles.findIndex((t) => t.includes("教育背景"));
assert(iIntern >= 0 && iEdu >= 0 && iIntern < iEdu, "预览顺序同步（" + secTitles.join(">") + "）");
/* 持久化 */
const savedSec = win.localStorage.getItem("resumeKit:state:v1");
assert(!!savedSec && savedSec.includes('"sections"'), "板块设置已持久化到 localStorage");
/* 切换模板保留自定义顺序 */
const tplSel2 = $("#templateSelect");
tplSel2.value = "product";
tplSel2.dispatchEvent(new win.Event("change", { bubbles: true }));
await new Promise((r) => setTimeout(r, 200));
orderNames = Array.from(doc.querySelectorAll(".sec-mgr-row .sec-mgr-name")).map((el) => el.textContent);
assert(orderNames.indexOf("实习经历") < orderNames.indexOf("教育背景"), "切换岗位模板保留自定义顺序");
/* 恢复模板默认 */
$('[data-sec-reset="1"]').click();
await new Promise((r) => setTimeout(r, 200));
orderNames = Array.from(doc.querySelectorAll(".sec-mgr-row .sec-mgr-name")).map((el) => el.textContent);
assert(orderNames.indexOf("教育背景") < orderNames.indexOf("实习经历"), "恢复模板默认顺序（" + orderNames.join(">") + "）");

/* ---------- 错误汇总 ---------- */
console.log("[6] 错误检查");
assert(!errors.length, "全程无未捕获 JS 错误" + (errors.length ? "：" + errors.join(" | ") : ""));
const realConsoleErrors = consoleErrors.filter((m) => !/Not implemented/.test(m));
assert(!realConsoleErrors.length, "无 jsdom 控制台错误" + (realConsoleErrors.length ? "：" + realConsoleErrors.join(" | ") : ""));

console.log(failed === 0 ? "\n冒烟测试全部通过 ✅" : "\n" + failed + " 项失败 ❌");
process.exit(failed === 0 ? 0 : 1);
