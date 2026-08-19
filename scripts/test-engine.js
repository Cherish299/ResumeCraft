#!/usr/bin/env node
/* scripts/test-engine.js — 体检引擎冒烟测试（纯 Node，无依赖）
 * 用法：node scripts/test-engine.js
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const f of ["app/js/templates.js", "app/js/engine.js"]) {
  new Function(readFileSync(join(root, f), "utf8"))();
}

const Engine = globalThis.ResumeEngine;
let failed = 0;

function assert(cond, name, extra) {
  if (cond) {
    console.log("  ✓ " + name);
  } else {
    failed++;
    console.log("  ✗ " + name + (extra ? "  → " + extra : ""));
  }
}

/* ---------- 空简历 ---------- */
console.log("[1] 空简历应低分并报出硬伤");
const empty = {
  basic: {}, target: {}, education: [], internships: [], projects: [],
  campus: [], awards: [], skills: [], evaluation: "", extra: ""
};
const r1 = Engine.audit(empty, "tech");
assert(r1.total < 50, "总分 < 50（实际 " + r1.total + "）", String(r1.total));
const hard = r1.categories.find((c) => c.key === "hard");
assert(hard.score < 15, "硬伤分 < 15（实际 " + hard.score + "）");
const titles = r1.items.map((i) => i.title).join("|");
assert(titles.includes("姓名"), "报出未填写姓名");
assert(titles.includes("手机号"), "报出未填写手机号");
assert(titles.includes("邮箱"), "报出未填写邮箱");
assert(titles.includes("教育背景"), "报出未添加教育背景");
assert(titles.includes("求职意向"), "报出未填写求职意向");

/* ---------- 优质简历 ---------- */
console.log("[2] 完整量化简历应 ≥ 85 分");
const good = {
  basic: { name: "张三", gender: "男", birth: "2002.06", phone: "13812345678", email: "zhangsan@example.com", city: "北京", website: "https://blog.example.com", github: "github.com/zhangsan", photo: "" },
  target: { position: "后端开发工程师（校招）", industry: "互联网", city: "北京", salary: "15-20K", availability: "2025.07 毕业后", jobType: "校招" },
  education: [{ school: "XX大学", major: "计算机科学与技术", degree: "本科", start: "2021-09", end: "2025-06", gpa: "3.7/4.0", rank: "前 10%", courses: "数据结构、操作系统、计算机网络", honors: "校级一等奖学金" }],
  internships: [{ company: "XX科技", title: "后端实习生", start: "2024-06", end: "2024-09", content: "负责订单系统重构，使用 Redis 缓存与 MySQL 索引优化使查询耗时降低 60%。\n主导 CI/CD 流水线搭建，发布频率从每周 1 次提升到每天 3 次。" }],
  projects: [{ name: "校园二手平台", role: "负责人", tech: "Spring Boot + MySQL + Redis + Git", start: "2023-09", end: "2024-05", content: "独立完成用户与订单模块开发，支撑 5000+ 注册用户。\n使用消息队列削峰，将下单接口 P99 延迟从 800ms 降至 120ms。" }],
  campus: [], awards: [{ name: "全国大学生数学建模竞赛", level: "省级", date: "2023-11" }],
  skills: [{ category: "编程语言", items: "Java（熟练）、Python（掌握）" }, { category: "框架", items: "Spring Boot、MyBatis" }],
  evaluation: "独立完成 3 个上线项目；LeetCode 已刷 300+ 题；有 2 段互联网公司实习经历。",
  extra: ""
};
const r2 = Engine.audit(good, "tech");
assert(r2.total >= 85, "总分 ≥ 85（实际 " + r2.total + "）", String(r2.total));
assert(r2.passLevel === "优秀" || r2.passLevel === "良好", "评级为优秀或良好（实际 " + r2.passLevel + "）");

/* ---------- 量化缺失 ---------- */
console.log("[3] 无数字的经历应显著扣分");
const noNum = JSON.parse(JSON.stringify(good));
noNum.internships[0].content = "负责订单系统的开发与维护，参与了多次需求评审与版本迭代。";
noNum.projects[0].content = "负责项目的整体架构设计，完成了多个核心模块的开发工作。";
const r3 = Engine.audit(noNum, "tech");
const q3 = r3.categories.find((c) => c.key === "quantified");
assert(q3.score === 0, "量化分类 0 分（实际 " + q3.score + "）");
assert(r3.total < r2.total, "总分低于量化版（" + r3.total + " < " + r2.total + "）");

/* ---------- 单元断言 ---------- */
console.log("[4] 单元断言");
assert(Engine.isValidPhone("13812345678"), "isValidPhone 接受 11 位手机号");
assert(!Engine.isValidPhone("12345"), "isValidPhone 拒绝短号码");
assert(Engine.isValidEmail("a@b.com"), "isValidEmail 接受合法邮箱");
assert(!Engine.isValidEmail("a@b"), "isValidEmail 拒绝无域名邮箱");
assert(Engine.startsWithVerb("负责订单系统重构"), "startsWithVerb 识别「负责」开头");
assert(!Engine.startsWithVerb("订单系统的重构"), "startsWithVerb 拒绝名词开头");
assert(Engine.containsEmptyPhrase("学习能力强，认真负责"), "containsEmptyPhrase 识别空话");
assert(Engine.splitBullets("第一行\n第二行\n\n第三行").length === 3, "splitBullets 按行拆分");
assert(Engine.fullText(good).includes("Java"), "fullText 包含技能内容");

/* ---------- 关键词按岗位变化 ---------- */
console.log("[5] 岗位关键词匹配随模板变化");
const rTech = Engine.audit(good, "tech");
const rBackend = Engine.audit(good, "backend");
const rProd = Engine.audit(good, "product");
const kTech = rTech.categories.find((c) => c.key === "keywords");
const kBackend = rBackend.categories.find((c) => c.key === "keywords");
const kProd = rProd.categories.find((c) => c.key === "keywords");
assert(kTech.score > kProd.score, "技术简历对 tech 模板关键词分更高（" + kTech.score + " vs " + kProd.score + "）");
assert(kBackend.score >= kProd.score, "后端模板关键词分不低于产品模板（" + kBackend.score + " vs " + kProd.score + "）");

/* ---------- 隐藏板块不参与体检 ---------- */
console.log("[6] 隐藏板块不参与体检");
const rHiddenT = Engine.audit(good, "tech", { hidden: { target: true } });
const titlesT = rHiddenT.items.map((i) => i.title).join("|");
assert(!titlesT.includes("求职意向"), "隐藏求职意向后不再报「未填写求职意向」");
const rHiddenK = Engine.audit(good, "tech", { hidden: { projects: true, skills: true } });
const kH = rHiddenK.categories.find((c) => c.key === "keywords");
assert(kH.score < kTech.score, "隐藏项目/技能后关键词分下降（" + kH.score + " < " + kTech.score + "）");
const noEval = JSON.parse(JSON.stringify(good));
noEval.evaluation = "";
const rE1 = Engine.audit(noEval, "tech");
assert(rE1.items.some((i) => i.title.includes("自我评价")), "未隐藏时完整度提示自我评价缺失");
const rE2 = Engine.audit(noEval, "tech", { hidden: { evaluation: true } });
assert(!rE2.items.some((i) => i.title.includes("自我评价")), "隐藏自我评价后不再提示缺失");
const qHidden = Engine.audit(good, "tech", { hidden: { internships: true } });
const qH = qHidden.categories.find((c) => c.key === "quantified");
assert(qH.score >= 15, "隐藏实习后量化分按剩余项目计算（" + qH.score + "）");

console.log(failed === 0 ? "\n全部通过 ✅" : "\n" + failed + " 项失败 ❌");
process.exit(failed === 0 ? 0 : 1);
