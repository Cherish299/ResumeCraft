/* templates.js — 校招岗位模板（技术/产品/运营/市场/设计/职能）与示例库
 * 纯数据模块，不依赖 DOM。暴露全局 RESUME_TEMPLATES。
 */
(function (global) {
  "use strict";

  /* 通用动词库：用于 STAR/动词 检查 */
  var ACTION_VERBS = [
    "负责", "主导", "参与", "独立", "组织", "搭建", "设计", "开发", "优化",
    "推动", "协调", "撰写", "完成", "实现", "带领", "策划", "运营", "分析",
    "制定", "执行", "落地", "复盘", "维护", "重构", "调研", "产出", "对接",
    "跟进", "管理", "处理", "构建", "封装", "编写", "测试", "部署", "上线",
    "推广", "转化", "提升", "降低", "缩短", "提高", "增长", "覆盖", "触达",
    "服务", "支持", "梳理", "整合", "打通", "建模", "训练", "调优", "评测",
    "采集", "清洗", "可视化", "定位", "解决", "修复", "排查", "监控", "告警",
    "沉淀", "总结", "输出", "宣讲", "谈判", "核算", "编制", "招聘", "培训",
    "选拔", "接待", "策划", "剪辑", "拍摄", "绘制", "排版", "制定", "走访",
    "调研", "调研", "答辩", "汇报", "答辩", "配合", "协助", "支撑", "供给",
    "建模", "竞品", "需求", "原型", "评审", "迭代", "上线", "灰度", "召回"
  ];

  /* 空话检测库：自我评价/经历中的"无效表达" */
  var EMPTY_PHRASES = [
    "学习能力强", "吃苦耐劳", "性格开朗", "认真负责", "抗压能力强",
    "沟通能力强", "团队合作精神", "积极主动", "责任心强", "适应能力强",
    "乐于助人", "热爱学习", "踏实肯干", "勤奋好学", "诚实守信"
  ];

  function mergeKeywords(base, extra) {
    var seen = Object.create(null);
    var out = [];
    (base || []).concat(extra || []).forEach(function (kw) {
      if (!kw || seen[kw]) return;
      seen[kw] = true;
      out.push(kw);
    });
    return out;
  }

  function cloneTemplate(src, patch) {
    var base = JSON.parse(JSON.stringify(src));
    var next = Object.assign(base, patch || {});
    if (patch && patch.tips) next.tips = Object.assign({}, base.tips || {}, patch.tips);
    if (patch && patch.keywords) next.keywords = mergeKeywords(base.keywords || [], patch.keywords);
    return next;
  }

  /* 六类校招岗位模板 + 互联网细分模板 */
  var TEMPLATES = {
    tech: {
      id: "tech",
      name: "技术开发",
      desc: "后端 / 前端 / 算法 / 测试 / 客户端",
      keywords: [
        "Java", "Python", "C++", "Go", "JavaScript", "TypeScript", "React", "Vue",
        "Spring", "MySQL", "Redis", "Linux", "Git", "Docker", "K8s", "Kubernetes",
        "算法", "数据结构", "高并发", "分布式", "微服务", "消息队列", "Kafka",
        "机器学习", "深度学习", "TensorFlow", "PyTorch", "LLM", "大模型", "NLP",
        "Hadoop", "Spark", "Flink", "SQL", "测试", "自动化", "CI/CD", "HTTP",
        "TCP/IP", "操作系统", "计算机网络", "设计模式", "RESTful", "WebSocket"
      ],
      sectionOrder: ["basic", "target", "education", "internship", "project", "research", "award", "skill", "evaluation"],
      tips: {
        education: "技术岗看重：院校层次、GPA/排名、核心专业课（数据结构、操作系统、计算机网络、数据库）、竞赛获奖。建议补全 GPA 与排名。",
        internship: "每一条经历遵循「技术动作 + 规模 + 结果」：用了什么技术栈，解决了什么问题，性能/吞吐/准确率提升了多少。",
        project: "项目是技术简历的核心。写清楚：背景与目标、你负责的模块、技术选型与难点、量化结果（QPS、耗时、准确率、用户量）。避免只列技术名词。",
        skill: "按「语言 / 框架 / 工具 / 其他」分类，写「熟练」「掌握」「了解」三级，不要写「精通」除非有把握。",
        evaluation: "不要写空话。写 2-3 条与岗位相关的硬事实：如「独立完成 3 个上线项目」「LeetCode 300+」「开源社区贡献」。"
      },
      sampleProject: {
        name: "校园二手交易平台（示例，请替换）",
        role: "后端开发（负责人）",
        tech: "Spring Boot + MySQL + Redis + Nginx",
        content: "负责平台后端整体架构设计与开发，独立完成用户、商品、订单、支付四个核心模块。\n针对高并发秒杀场景，使用 Redis 预扣库存 + 消息队列异步削峰，将下单接口 P99 延迟从 800ms 降至 120ms。\n使用索引优化与分页缓存，接口平均响应时间降低 45%，支撑 5000+ 注册用户、日均 2000 次访问。"
      },
      sampleInternship: {
        company: "XX科技有限公司（示例，请替换）",
        title: "后端开发实习生",
        content: "参与电商后台订单系统的开发与维护，负责订单查询接口的重构，使用缓存与索引优化使查询耗时降低 60%。\n编写单元测试 40+ 个，覆盖率从 30% 提升至 75%，参与 CI/CD 流水线搭建，发布频率从每周 1 次提升到每天 3 次。"
      }
    },

    product: {
      id: "product",
      name: "产品经理",
      desc: "产品 / 产品运营 / 用户研究",
      keywords: [
        "需求分析", "需求文档", "PRD", "原型", "Axure", "Figma", "用户调研",
        "数据分析", "SQL", "埋点", "A/B测试", "增长", "留存", "转化率",
        "竞品分析", "市场调研", "用户画像", "产品规划", "迭代", "灰度",
        "Roadmap", "MVP", "用户体验", "流程图", "思维导图", "Xmind",
        "OKR", "项目管理", "跨部门", "协作", "复盘"
      ],
      sectionOrder: ["basic", "target", "education", "internship", "project", "campus", "research", "award", "skill", "evaluation"],
      tips: {
        education: "产品岗看重：逻辑表达、数据敏感度、商业 sense。如有相关课程（用户研究、市场营销）或数据分析工具（SQL/Excel）学习经历可列出。",
        internship: "用「发现问题 → 方案 → 数据结果」的结构写：你发现了什么用户痛点，做了什么方案，数据（转化率/留存/时长）变化多少。产品经历最忌只写「跟进需求」。",
        project: "可以是课程项目、竞赛、个人 Side Project 甚至复盘一个 App。重点是体现产品思维闭环：调研、定位、方案、验证、数据。",
        skill: "工具类：Axure/Figma/ProcessOn/SQL/Excel 透视表。能力类：需求分析、数据分析、项目管理，用事例佐证而非空泛罗列。",
        evaluation: "突出数据敏感与逻辑表达，用具体事例说明，例如「在校期间主导 2 次 200+ 人规模的活动策划」。"
      },
      sampleProject: {
        name: "校园拼车小程序（示例，请替换）",
        role: "产品负责人",
        tech: "Figma + 问卷星 + 微信小程序",
        content: "发现校园跨校区通勤痛点，通过 120 份问卷 + 10 人次深度访谈完成需求调研，输出用户画像与需求优先级。\n独立完成信息架构、流程图与 40+ 页高保真原型，组织 3 轮可用性测试，根据反馈优化 15 处交互细节。\n推动小程序上线，2 个月累计注册用户 800+，周活跃率 35%，完成 300+ 次拼车匹配。"
      },
      sampleInternship: {
        company: "XX互联网公司（示例，请替换）",
        title: "产品实习生",
        content: "负责新用户引导流程的改版，通过漏斗分析定位 3 个流失环节，输出 2 版优化方案并推动 A/B 测试，注册转化率提升 18%。\n建立竞品功能追踪表，每周输出竞品周报，为团队提供 10+ 条产品迭代建议，其中 4 条被采纳上线。"
      }
    },

    operation: {
      id: "operation",
      name: "运营",
      desc: "用户运营 / 内容运营 / 新媒体 / 活动运营",
      keywords: [
        "用户增长", "留存", "活跃", "转化率", "拉新", "促活", "召回", "社群",
        "公众号", "小红书", "抖音", "微博", "视频号", "内容", "选题", "排版",
        "活动策划", "裂变", "投放", "ROI", "数据复盘", "用户画像", "分层运营",
        "SOP", "KOL", "私域", "GMV", "DAU", "UV", "PV", "漏斗", "复盘"
      ],
      sectionOrder: ["basic", "target", "education", "internship", "campus", "project", "research", "award", "skill", "evaluation"],
      tips: {
        education: "运营岗经历>成绩，但相关课程（市场营销、传播学）与数据分析能力仍是加分项，可写在技能里。",
        internship: "每个项目写清：目标、动作、数据结果。运营最看重数据闭环：涨了多少粉、活动参与多少人、转化多少单，全部量化。",
        campus: "社团/学生会经历对运营岗很有价值：活动组织、公众号运营、社群维护都可以写，同样要量化（人数、场次、阅读量）。",
        project: "个人账号运营（公众号/小红书/抖音）是运营岗最好的作品：粉丝数、爆款内容、涨粉方法论都可以写。",
        skill: "工具：Excel、PS/Canva、剪映、公众号后台、数据平台。能力：内容策划、数据分析、活动执行。",
        evaluation: "突出网感、数据敏感与执行力，用运营数据说话。"
      },
      sampleProject: {
        name: "个人小红书账号（示例，请替换）",
        role: "账号运营（独立）",
        tech: "小红书 + 剪映 + Canva",
        content: "独立运营校园生活类账号，3 个月发布笔记 40+ 篇，产出 3 篇 1000+ 赞爆款，粉丝从 0 增长至 3200+。\n通过分析后台数据与评论区反馈迭代选题方向，将笔记平均互动率从 3% 提升至 9%。\n总结爆款方法论并输出运营复盘文档 12 篇，形成可复用的选题-标题-封面 SOP。"
      },
      sampleInternship: {
        company: "XX新媒体公司（示例，请替换）",
        title: "新媒体运营实习生",
        content: "负责公众号与小红书账号日常运营，独立完成选题、撰写、排版与发布，3 个月输出内容 60+ 篇。\n策划「开学季」裂变活动，通过社群+朋友圈传播，单场活动拉新 1500+ 用户，活动期间账号涨粉 800+。\n搭建内容数据周报模板，每周输出复盘报告，推动内容团队将爆款率从 5% 提升至 12%。"
      }
    },

    market: {
      id: "market",
      name: "市场 / 销售",
      desc: "市场推广 / 商务拓展 / 销售 / 品牌",
      keywords: [
        "市场调研", "竞品分析", "品牌", "推广", "营销", "策划", "渠道",
        "BD", "商务", "客户", "签约", "销售额", "KPI", "ROI", "投放",
        "路演", "宣讲", "陌拜", "电话销售", "成交", "转化", "复购",
        "线下活动", "展会", "赞助", "合作", "资源置换", "数据分析", "复盘"
      ],
      sectionOrder: ["basic", "target", "education", "internship", "campus", "research", "award", "project", "skill", "evaluation"],
      tips: {
        education: "市场岗重实战，成绩相对次要；但逻辑与表达会通过群面和单面考察，面试准备时多用案例说话。",
        internship: "写清：客户/市场是谁、你的动作、成交结果。金额、客户数、转化率是硬通货，一定要量化。",
        campus: "拉赞助、办活动、外联经历都是很好的市场/BD 素材：谈下了多少赞助、办了多少场活动、覆盖多少人。",
        project: "可以是校园营销大赛、商赛或创业项目：目标、策略、执行、结果四段式。",
        skill: "工具：Excel/PPT、PS、问卷。能力：谈判、陌拜、方案撰写、数据分析。",
        evaluation: "突出结果导向与抗压能力，用签约额、客户数、活动规模等事实支撑。"
      },
      sampleProject: {
        name: "校园歌手大赛赞助项目（示例，请替换）",
        role: "外联负责人",
        tech: "合作方案 + 商务谈判",
        content: "主导 2024 校园歌手大赛招商工作，独立撰写 5 份赞助方案，通过陌拜与电话拜访 30+ 家本地商家。\n成功签约 8 家赞助商（含 2 家连锁品牌），累计获得赞助款 3.2 万元，创学院历史新高。\n统筹赞助权益落地，活动覆盖观众 2000+ 人次，为赞助商带来 15% 的到店转化，2 家赞助商达成长期合作。"
      },
      sampleInternship: {
        company: "XX教育机构（示例，请替换）",
        title: "课程顾问实习生（销售）",
        content: "通过电话与微信跟进潜在客户，3 个月累计沟通客户 400+ 组，完成签约 45 单，总业绩 28 万元，团队排名前 3。\n针对不同类型客户梳理 3 套话术模板，被团队采纳后整体转化率提升 20%。\n协助搭建客户跟进台账，将客户流失率降低 15%。"
      }
    },

    design: {
      id: "design",
      name: "设计",
      desc: "UI/UX / 视觉设计 / 交互设计",
      keywords: [
        "Figma", "Sketch", "Photoshop", "Illustrator", "AE", "C4D", "Blender",
        "UI", "UX", "交互", "视觉", "设计规范", "设计系统", "组件库", "原型",
        "用户研究", "可用性测试", "信息架构", "图标", "插画", "海报", "banner",
        "切图", "标注", "动效", "响应式", "APP", "小程序", "Web", "作品集", "审美"
      ],
      sectionOrder: ["basic", "target", "education", "project", "internship", "research", "award", "skill", "evaluation"],
      tips: {
        education: "设计岗简历 + 作品集缺一不可！在基本信息中务必放上作品集链接（站酷/Behance/Notion/在线链接），简历本身也要体现排版审美。",
        internship: "写清：负责的产品与页面、你的设计流程（调研-方案-验证）、设计结果（可用性提升、业务数据）。",
        project: "作品集项目逐个说明：背景、目标用户、设计过程（草图-低保真-高保真）、决策依据与结果。项目数量 2-4 个为宜，质量 > 数量。",
        skill: "软件按熟练度分级：Figma/Sketch 熟练，AE/C4D 了解等。有手绘、3D、动效等额外技能可加分。",
        evaluation: "突出审美与设计思维，用项目与作品说话，可提设计比赛获奖（红点/大广赛等）。"
      },
      sampleProject: {
        name: "校园点餐 App 改版设计（示例，请替换）",
        role: "UI/UX 设计师（独立完成）",
        tech: "Figma + 用户访谈 + 可用性测试",
        content: "针对现有校园点餐 App 流程繁琐的问题，通过 8 人次用户访谈与竞品分析定位 5 个核心痛点。\n独立完成信息架构梳理、30+ 页低保真与高保真设计，输出完整设计规范与组件库（30+ 组件）。\n组织 2 轮可用性测试（15 人），关键流程操作时长平均缩短 40%，方案获得 90% 测试者好评。"
      },
      sampleInternship: {
        company: "XX设计工作室（示例，请替换）",
        title: "UI 设计实习生",
        content: "参与 3 个企业官网与 2 款小程序的设计工作，独立负责其中 8 个核心页面的视觉与交互设计。\n维护项目设计规范与组件库，将设计交付效率提升 30%，减少 60% 的标注返工。\n配合开发完成切图与走查，保证 95% 的页面还原度。"
      }
    },

    function: {
      id: "function",
      name: "职能类",
      desc: "人力 / 财务 / 行政 / 法务",
      keywords: [
        "招聘", "培训", "员工关系", "考勤", "薪酬", "绩效", "入离职", "档案",
        "HR", "人力资源", "招聘渠道", "简历筛选", "面试安排", "offer",
        "记账", "凭证", "报销", "对账", "发票", "报表", "Excel", "财务分析",
        "预算", "审计", "行政", "会务", "采购", "固定资产", "公文", "写作"
      ],
      sectionOrder: ["basic", "target", "education", "internship", "campus", "research", "award", "skill", "evaluation"],
      tips: {
        education: "职能岗看重：专业对口（人力/会计/法律）、证书（人力资源师、初级会计、法考）、办公软件熟练度。",
        internship: "写清：负责的事务流程、处理的数量规模、效率提升。职能岗同样要量化：筛了多少简历、办了多少入离职、处理多少凭证。",
        campus: "学生会/团委的行政类工作（文件管理、会议组织、活动后勤）是职能岗的好素材。",
        skill: "工具：Excel（透视表/VLOOKUP）、Word、PPT、OA/ERP 系统。证书：相关从业资格证单独列出。",
        evaluation: "突出细心、责任心与流程意识，用事务性成果佐证。"
      },
      sampleProject: {
        name: "学院学生会档案数字化项目（示例，请替换）",
        role: "办公室部长",
        tech: "Excel + 在线文档",
        content: "主导学生会 3 年纸质档案的数字化整理，制定分类标准与归档流程，完成 1200+ 份文件的扫描、命名与归档。\n搭建在线共享文档库，建立 15 套常用模板（会议纪要、活动策划、报销单），使部门文件查找时间从 20 分钟缩短至 2 分钟。\n组织 6 次干事办公技能培训，部门整体文档规范率从 40% 提升至 95%。"
      },
      sampleInternship: {
        company: "XX咨询公司（示例，请替换）",
        title: "人力资源实习生",
        content: "协助校招全流程，筛选简历 800+ 份，安排面试 120+ 场，独立完成 offer 发放与入职材料收集，入职转化率 90%。\n维护招聘台账与面试官日历，优化面试排期表，将面试到场率从 70% 提升至 92%。\n协助员工档案整理与考勤统计，处理入离职手续 60+ 人次，零差错。"
      }
    }
  };

  TEMPLATES.backend = cloneTemplate(TEMPLATES.tech, {
    id: "backend",
    name: "后端 / 服务端",
    desc: "Java / Go / 分布式 / 基础架构",
    keywords: ["Java", "Go", "Spring Boot", "MyBatis", "Redis", "MySQL", "Kafka", "MQ", "RPC", "微服务", "限流", "熔断", "缓存", "分库分表", "服务治理", "链路追踪", "监控", "Prometheus", "Nginx"],
    sectionOrder: ["basic", "target", "education", "internship", "project", "skill", "research", "award", "evaluation"],
    tips: {
      project: "后端岗优先突出：接口设计、数据链路、性能优化、稳定性治理与监控告警。量化 QPS、RT、错误率、成本、可用性。",
      skill: "把语言/框架/数据库/中间件/云原生拆开写，便于 ATS/JD 关键词命中。"
    },
    sampleProject: {
      name: "内容推荐服务重构（示例，请替换）",
      role: "后端开发",
      tech: "Go + gRPC + Redis + MySQL + Kafka",
      content: "负责推荐服务召回与排序链路改造，拆分单体服务为 4 个微服务，支持按场景独立扩缩容。\n引入 Redis 热点缓存与异步回源策略，使首页接口 P95 延迟从 320ms 降至 95ms，峰值吞吐提升 2.8 倍。\n补齐 Prometheus 指标、日志与告警规则，核心接口 7 天可用性稳定在 99.95%。"
    },
    sampleInternship: {
      company: "XX互联网平台（示例，请替换）",
      title: "后端开发实习生",
      content: "参与商家服务域 3 个核心接口开发与联调，补充灰度开关与降级逻辑，避免大促期间雪崩。\n对慢 SQL 与缓存穿透问题做专项治理，接口平均响应时间降低 48%，数据库 CPU 峰值下降 22%。"
    }
  });

  TEMPLATES.frontend = cloneTemplate(TEMPLATES.tech, {
    id: "frontend",
    name: "前端 / 客户端",
    desc: "Web / React / Vue / 工程化 / 性能优化",
    keywords: ["TypeScript", "React", "Vue", "Next.js", "Vite", "Webpack", "Node.js", "SSR", "CSR", "组件库", "Hooks", "状态管理", "埋点", "性能优化", "首屏", "LCP", "交互设计", "兼容性", "单测", "E2E"],
    sectionOrder: ["basic", "target", "education", "project", "internship", "skill", "campus", "award", "evaluation"],
    tips: {
      project: "前端岗优先突出：页面复杂度、组件抽象、性能指标、工程质量、跨端兼容与协作闭环。",
      evaluation: "可写真实的前端作品/博客/组件库/npm 包/开源 PR，远比空话更有说服力。"
    },
    sampleProject: {
      name: "校园活动平台前端重构（示例，请替换）",
      role: "前端负责人",
      tech: "React + TypeScript + Vite + Zustand",
      content: "负责报名、审核、签到 3 个核心流程页面重构，抽象 18 个通用组件并沉淀表单/表格规范。\n通过路由懒加载、图片压缩与缓存策略优化，使首屏加载时间从 3.8s 降至 1.6s，LCP 改善 42%。\n补充埋点与异常上报面板，定位并修复 20+ 个高频交互问题，活动报名转化率提升 15%。"
    },
    sampleInternship: {
      company: "XX科技有限公司（示例，请替换）",
      title: "前端开发实习生",
      content: "参与管理后台迭代，独立负责订单详情与报表模块开发，支持 6 类角色权限展示。\n封装通用筛选与导出组件，页面重复代码减少约 35%，联调效率明显提升。"
    }
  });

  TEMPLATES.data = cloneTemplate(TEMPLATES.tech, {
    id: "data",
    name: "数据 / 分析 / BI",
    desc: "SQL / Python / 指标体系 / 可视化",
    keywords: ["SQL", "Python", "Pandas", "NumPy", "Tableau", "Power BI", "Looker", "埋点", "指标体系", "漏斗", "留存", "A/B 测试", "因果分析", "用户分层", "增长", "可视化", "ETL", "数据仓库", "Hive", "Spark"],
    sectionOrder: ["basic", "target", "education", "internship", "project", "research", "skill", "award", "evaluation"],
    tips: {
      internship: "数据岗经历尽量写成：业务问题、口径定义、分析方法、结论、落地效果。只说“做报表”价值不大。",
      skill: "把分析工具、统计方法、数据仓库/ETL 能力拆开写，便于匹配 BI/分析师 JD。"
    },
    sampleProject: {
      name: "校园产品增长分析项目（示例，请替换）",
      role: "数据分析负责人",
      tech: "SQL + Python + Tableau",
      content: "围绕新用户转化与次日留存搭建漏斗看板，定义注册、激活、首单 3 层核心指标口径。\n通过 cohort 分析与分层对比定位 2 个关键流失环节，提出欢迎页与优惠券策略优化建议。\n方案落地后，新用户首单转化率提升 11%，次日留存提升 6 个百分点。"
    },
    sampleInternship: {
      company: "XX互联网公司（示例，请替换）",
      title: "数据分析实习生",
      content: "负责用户行为埋点校验与周报输出，沉淀 20+ 核心指标 SQL 模板。\n基于实验数据复盘推荐位改版效果，识别出高活跃用户 CTR 提升 9%、低活跃用户无显著改善，为下一轮实验提供分群建议。"
    }
  });

  TEMPLATES.ai = cloneTemplate(TEMPLATES.tech, {
    id: "ai",
    name: "AI / 算法 / 大模型",
    desc: "机器学习 / 深度学习 / LLM / 推理部署",
    keywords: ["Python", "PyTorch", "TensorFlow", "机器学习", "深度学习", "大模型", "LLM", "Transformer", "微调", "LoRA", "RAG", "向量数据库", "评测", "推理优化", "量化", "蒸馏", "CUDA", "训练", "数据清洗", "召回"],
    sectionOrder: ["basic", "target", "education", "research", "project", "internship", "skill", "award", "evaluation"],
    tips: {
      project: "AI 岗最看重问题定义、数据集、模型方案、训练/推理指标、线上效果与工程落地，务必把实验指标写清楚。",
      research: "论文/竞赛/科研成果放前面；如果是大模型项目，写清评测集、指标、推理成本和部署方式。"
    },
    sampleProject: {
      name: "垂类问答助手（示例，请替换）",
      role: "算法 / 工程负责人",
      tech: "Python + PyTorch + LoRA + FAISS + FastAPI",
      content: "基于 3 万条领域语料构建 RAG 问答系统，完成数据清洗、切分、向量化、召回与重排链路搭建。\n对 7B 模型进行 LoRA 微调，在自建评测集上的答案准确率从 61% 提升至 79%，幻觉率下降 23%。\n引入量化与批处理推理后，单次问答平均响应时间从 4.2s 降至 1.7s，GPU 成本下降约 35%。"
    },
    sampleInternship: {
      company: "XX AI 公司（示例，请替换）",
      title: "算法实习生",
      content: "参与文本分类与问答评测项目，负责样本清洗、特征工程与实验复盘，维护 1000+ 条人工标注评测集。\n优化推理服务批处理策略与缓存逻辑，使日均推理吞吐提升 40%，异常超时率降低 60%。"
    }
  });

  TEMPLATES.internet = cloneTemplate(TEMPLATES.product, {
    id: "internet",
    name: "互联网通用投递",
    desc: "面向大厂 JD 裁剪 / 保留完整版底稿",
    keywords: ["用户增长", "数据分析", "跨部门协作", "落地", "复盘", "效率提升", "项目推进", "指标", "方案设计", "业务理解", "互联网", "产品思维", "执行力"],
    sectionOrder: ["basic", "target", "education", "internship", "project", "campus", "skill", "award", "evaluation", "extra"],
    tips: {
      internship: "互联网通用投递优先保留最能体现业务结果、项目推进、数据分析、协作推进的内容，其他细枝末节放到完整版。",
      evaluation: "自我评价尽量写成“方向 + 结果 + 证据”，便于后续按 JD 再裁剪。"
    },
    sampleProject: {
      name: "内容增长专题项目（示例，请替换）",
      role: "项目 owner",
      tech: "SQL + Figma + 用户访谈",
      content: "围绕新用户内容消费体验做专题改版，串联调研、方案、埋点、上线复盘的完整闭环。\n通过入口优化与推荐位调整，使新用户首周内容消费时长提升 14%，专题页点击率提升 21%。"
    },
    sampleInternship: {
      company: "XX互联网公司（示例，请替换）",
      title: "业务/产品/运营实习生",
      content: "参与业务线版本迭代与跨部门推进，负责需求梳理、方案跟进、数据复盘 3 个关键环节。\n围绕核心指标输出每周复盘与优化建议，推动 2 个方案上线，其中 1 个方案带来核心转化率提升 12%。"
    }
  });

  /* 校招时间线（静态指南 + 用户笔记由 app 层管理） */
  var TIMELINE = [
    { stage: "秋招提前批", time: "6月 - 8月", note: "互联网大厂提前批 / 内推集中开放，HC 多、流程快，简历可先投提前批练手" },
    { stage: "秋招正式批", time: "9月 - 10月", note: "网申高峰 + 笔试集中期，目标公司建议 9 月上旬完成投递" },
    { stage: "秋招面试与offer", time: "10月 - 12月", note: "面试高峰，拿到 offer 后注意三方协议与违约金条款" },
    { stage: "秋招补录 / 春招提前批", time: "1月 - 2月", note: "部分公司秋招补录；国企/银行春招提前批开始" },
    { stage: "春招正式批", time: "3月 - 4月", note: "春招集中期，秋招失利者最后一次校招机会，务必复盘秋招" },
    { stage: "春招收尾", time: "5月 - 6月", note: "补录与少量岗位，6 月底前基本结束，准备好毕业相关材料" }
  ];

  /* 求职准备清单默认项 */
  var CHECKLIST_DEFAULT = [
    { group: "简历与材料", items: [
      "简历完成初稿（基本信息、教育、实习、项目齐全）",
      "简历通过体检 ≥ 85 分",
      "按目标岗位套用模板并补充关键词",
      "证件照 / 一寸照电子版",
      "成绩单（教务处盖章扫描件）",
      "获奖证书扫描件归档",
      "身份证、学生证复印件",
      "作品集 / GitHub / 个人主页整理完毕（如需要）"
    ]},
    { group: "求职准备", items: [
      "确定目标岗位与城市（2-3 个方向）",
      "整理目标公司清单（20 家以上，分梯队）",
      "撰写并完善自我介绍（1 分钟 / 3 分钟版本）",
      "准备 STAR 结构的行为面试案例 8 个以上",
      "笔试准备：行测 / 专业题 / 编程题开始刷题",
      "了解意向公司校招流程与往年笔面试真题",
      "准备面试着装与设备（视频面试）",
      "注册并完善招聘平台（应届生求职网/牛客/BOSS直聘/公司官网）"
    ]},
    { group: "投递与跟进", items: [
      "制作投递记录表并保持更新",
      "投递后 3-5 天无回复主动跟进",
      "每场笔试/面试后当天复盘",
      "秋招失利及时复盘并调整策略（春招）"
    ]}
  ];

  global.RESUME_TEMPLATES = TEMPLATES;
  global.RESUME_ACTION_VERBS = ACTION_VERBS;
  global.RESUME_EMPTY_PHRASES = EMPTY_PHRASES;
  global.RESUME_TIMELINE = TIMELINE;
  global.RESUME_CHECKLIST_DEFAULT = CHECKLIST_DEFAULT;
})(typeof window !== "undefined" ? window : globalThis);
