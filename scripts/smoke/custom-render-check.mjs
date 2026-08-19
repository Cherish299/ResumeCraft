/* 临时排查脚本：jsdom 渲染用户简历，检查预览 DOM 的板块与内容顺序 */
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const html = readFileSync(join(root, "dist", "简历工作台.html"), "utf8");
const data = JSON.parse(readFileSync("C:/Users/hew/Downloads/简历数据 (1).json", "utf8"));

const dom = new JSDOM(html, {
  runScripts: "dangerously",
  url: "http://localhost/",
  beforeParse(window) {
    window.__RESUME_KIT_BOOT_DATA__ = { resume: data.resume };
  }
});

setTimeout(() => {
  const doc = dom.window.document;
  const preview = doc.querySelector("#previewBody");
  if (!preview) { console.log("ERROR: #previewBody not found"); process.exit(1); }
  const page = preview.querySelector(".page");
  const html = page.innerHTML;

  /* 板块标题顺序 */
  const titles = [...html.matchAll(/p-sec-h[^>]*>\s*<span[^>]*>([^<]+)<\/span>\s*<span class="en">([^<]+)<\/span>/g)]
    .map(m => m[1] + "(" + m[2] + ")");
  console.log("板块顺序:", titles.join(" → "));

  /* 实习内容位置检查 */
  const internshipIdx = html.indexOf("承担生态学文献智能抽取系统");
  const projectTitleIdx = html.indexOf("EcoMINER");
  console.log("实习第1条位置:", internshipIdx, "| 项目标题位置:", projectTitleIdx,
    internshipIdx >= 0 && projectTitleIdx >= 0 ? "| 实习内容在项目标题" + (internshipIdx < projectTitleIdx ? "之前 ✓" : "之后 ✗") : "| 未找到");

  /* 项目第6条（FastAPI）位置 vs 科研成果位置 */
  const fastapiIdx = html.indexOf("使用 FastAPI 封装文档上传");
  const researchIdx = html.indexOf("科研成果");
  console.log("项目第6条位置:", fastapiIdx, "| 科研成果位置:", researchIdx,
    fastapiIdx >= 0 && researchIdx >= 0 ? "| FastAPI 条在科研板块" + (fastapiIdx < researchIdx ? "之前 ✓" : "之后 ✗") : "| 未找到");

  /* 校园内容位置 */
  const campus1Idx = html.indexOf("连续 4 年协助");
  const campusTitleIdx = html.indexOf("校园经历");
  console.log("校园第1条位置:", campus1Idx, "| 校园标题位置:", campusTitleIdx,
    campus1Idx >= 0 && campusTitleIdx >= 0 ? "| 校园内容在校园标题" + (campus1Idx > campusTitleIdx ? "之后 ✓" : "之前 ✗") : "| 未找到");

  /* 实习板块内是否包含 4 条内容 */
  const internshipBlock = html.slice(html.indexOf("实习经历"), html.indexOf("项目经历"));
  const internshipHasContent = internshipBlock.includes("承担生态学文献智能抽取系统");
  console.log("实习板块块内包含内容:", internshipHasContent ? "是 ✓" : "否 ✗（内容缺失或错位）");
  process.exit(0);
}, 800);
