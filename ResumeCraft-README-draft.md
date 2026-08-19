# ResumeCraft

> Open-source resume workbench for campus recruiting and early-career job hunting.
>
> Build a full resume once, then generate a one-page targeted version for specific JD.

## Why ResumeCraft

Most resume tools only solve layout.

ResumeCraft focuses on the part that actually blocks interviews:

- what to write for internships and projects
- how to compress a resume into one page without losing value
- how to keep a detailed master resume and derive job-specific versions
- how to align with internet company JD keywords without fabricating facts
- how to review resume quality before投递

It is designed for:

- campus recruiting: spring / fall recruitment
- fresh graduates and early-career candidates
- internet / product / operation / design / data / AI roles
- users who want local-first editing instead of heavy SaaS workflows

## Core Features

### 1. Structured resume editing

- Basic info, target role, education, internships, projects, campus experience, research, awards, skills, self-evaluation, extras
- Left-side form + right-side real-time A4 preview
- Section order / hide / show control

### 2. Role templates that actually affect output

Built-in role templates:

- Tech / General development
- Backend / Service
- Frontend / Client
- Data / Analytics / BI
- AI / Algorithm / LLM
- Product
- Internet general application
- Operations
- Marketing / Sales
- Design
- Functional roles (HR / Finance / Admin / Legal)

Each template can affect:

- section priority
- JD keyword matching
- sample content
- preview layout emphasis
- AI rewriting context

### 3. Full version vs targeted version

ResumeCraft supports multiple resume strategies:

- Detailed version: keep more background and detail as the master resume
- Targeted version: default one-page-first view for general delivery
- Internet JD tailored version: preserve content more relevant to the target JD

This lets users keep a full factual archive while generating lighter application versions.

### 4. Smart one-page compression

A local one-page compression helper can:

- shorten low-priority details first
- keep quantified results and stronger bullets
- reduce overlong lines
- preserve more JD-related bullets in internet mode

### 5. Resume audit

Local audit engine with explainable checks:

- hard blockers
- quantified results
- expression quality
- keyword matching
- completeness

Instead of only giving a score, it tells users what is wrong and where.

### 6. AI-assisted optimization (optional)

Optional DeepSeek-based AI help for:

- overall optimization suggestions
- role-specific rewriting
- single-entry polish

Design principles:

- API key stays local
- no fact fabrication
- only visible / selected resume data is sent
- JD text can be included for better targeting

### 7. Job search workspace

- campus recruiting timeline
- application tracker
- checklist management
- CSV export

### 8. Backup and export

- single-file HTML backup
- JSON export / import
- Markdown export
- print / export PDF

## Product Philosophy

ResumeCraft is built on 4 principles:

1. Content first, layout second
2. Full resume first, tailored version second
3. Local-first and explainable
4. Never fabricate facts

## Demo Flow

A good first-time user flow is:

1. Choose a role template
2. Fill sample content or import existing resume data
3. Run resume audit
4. Paste a target JD
5. Switch to JD tailored version
6. Apply smart one-page compression
7. Export PDF / Markdown / backup

## Current Tech Stack

- Native HTML / CSS / JavaScript
- No heavy frontend framework in the app itself
- Single-file build for local use
- Optional DSH web plugin wrapper for embedded use

## Repository Structure

```text
ResumeCraft/
├── app/                    # source app
├── dist/                   # single-file output
├── dsh-plugin/             # DSH plugin wrapper
├── scripts/                # build + tests
└── README.md
```

## Local Development

```bash
node scripts/build.js
node scripts/test-engine.js
node scripts/smoke/smoke-dom.mjs
```

## Roadmap

- [ ] AI diagnostic mode with missing-fact follow-up questions
- [ ] JD keyword heatmap and evidence mapping
- [ ] full-version vs targeted-version diff view
- [ ] more realistic demo datasets
- [ ] screenshot / GIF showcase for GitHub
- [ ] multi-language README

## Open Source Positioning

ResumeCraft is not just another resume template website.

It is an open-source resume workbench for users who need:

- one-page resume compression
- JD-based trimming
- role-aware rewriting
- local-first control over resume data

## License

Recommended: MIT

## Acknowledgements

This project is inspired by practical campus recruiting resume workflows and structured resume-optimization approaches in the open-source community.
