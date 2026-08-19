/* 排查脚本：验证个性化方案面板渲染与快捷入口 */
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const html = readFileSync(join(root, "interview-kit", "dist", "interview-kit.html"), "utf8");

const dom = new JSDOM(html, { runScripts: "dangerously", url: "http://localhost/" });

setTimeout(() => {
  const doc = dom.window.document;
  /* 点击「我的方案」tab */
  const planTab = [...doc.querySelectorAll("#tabs .tab")].find(t => t.dataset.tab === "plan");
  if (!planTab) { console.log("ERROR: plan tab 不存在"); process.exit(1); }
  planTab.click();

  const body = doc.querySelector("#planBody");
  const text = body.textContent;
  const checks = [
    ["方案头部岗位", text.includes("AI 应用开发 / Agent 应用 / RAG 后端")],
    ["4 个阶段", text.includes("第 1 周") && text.includes("第 2 周") && text.includes("第 3 周") && text.includes("第 4 周")],
    ["阶段1 RAG", text.includes("RAG 与 LLM 应用基础")],
    ["阶段2 Agent", text.includes("Agent 与系统设计")],
    ["阶段3 知识图谱", text.includes("知识图谱 + 笔试算法")],
    ["阶段4 冲刺", text.includes("全真模拟冲刺")],
    ["笔试按钮", body.querySelector('[data-plan-written]') !== null],
    ["面试按钮", body.querySelector('[data-plan-interview]') !== null],
    ["刷题按钮", body.querySelector('[data-plan-go]') !== null]
  ];
  let ok = true;
  for (const [name, pass] of checks) { console.log((pass ? "✓" : "✗"), name); if (!pass) ok = false; }

  /* 测试「刷 RAG」跳转 */
  const goBtn = body.querySelector('[data-plan-go="rag"]');
  goBtn && goBtn.click();
  const bankActive = [...doc.querySelectorAll("#tabs .tab")].find(t => t.classList.contains("active"));
  console.log("点击刷RAG后激活tab:", bankActive ? bankActive.dataset.tab : "none");
  console.log("题库筛选分类:", doc.querySelector(".cat-item.active") ? doc.querySelector(".cat-item.active").textContent.trim().slice(0, 20) : "无");

  /* 测试「笔试模拟」快捷 */
  const planTab2 = [...doc.querySelectorAll("#tabs .tab")].find(t => t.dataset.tab === "plan");
  planTab2.click();
  const wBtn = doc.querySelector('[data-plan-written="第 1 周"]');
  wBtn && wBtn.click();
  const writtenActive = [...doc.querySelectorAll("#tabs .tab")].find(t => t.classList.contains("active"));
  console.log("点击笔试后激活tab:", writtenActive ? writtenActive.dataset.tab : "none");
  console.log("笔试已开始:", doc.querySelector("#writtenBody .quiz-head") !== null, "| 题数:", doc.querySelectorAll(".quiz-dot").length);
  process.exit(ok ? 0 : 1);
}, 800);
