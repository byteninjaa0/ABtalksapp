# Snowflake Data & AI Engineering Cohort — content seed

Content JSONs for the **15-Day Snowflake Data & AI Engineering Cohort** (a retail/e-commerce lakehouse built on a Snowflake free trial, mapped to SnowPro Core COF-C03 and SnowPro Advanced: Data Engineer DEA-C02, with a Cortex AI capstone). Same seed structure as the AI, Databricks, Data & Solution Architect and Power BI cohorts so all of them render and grade identically.

Files:
- `modules.json` — the 6 modules, one per program phase (title, subtitle, color, start/end day).
- `days.json` — per-day mission briefs (`briefMd`) plus server-only `missionSpec` (`answers` for the Submit-your-answers questions and `repoChecks` for GitHub verification), `objectives`, `tools`, `estimatedMin`, `missionPoints`, `isProjectDay`, `missionType` (DATA_ROOM for the Day 1 setup day, SHIP_IT for build days).
- `concept-questions.json` — 5 multiple-choice concept questions per day (`options`, `correctIndex`, `explanation`).
- `entry-questions.json` — empty. This cohort is open to anyone with a completed Klymb AI profile; there is no entrance exam.
- `exercises.json` — empty. The work happens in Snowsight against the learner's own trial account, so isolated practice-arena snippets aren't the right signal; the daily repo artifacts are.
- `videos.json` — per-day YouTube resources (`youtubeId`) taken from the program document. **Re-check each one before every cohort run** (channel-owner takedowns and re-uploads are common).
- `rubrics.json` — milestone rubrics grouped into 4 milestones (Platform Foundations, Data Engineering Pipelines, Analytics & ML Engineering, Generative AI Capstone), loaded at grade time.

Verification model: learners export their Snowsight worksheets, Snowpark scripts, notebook exports (`.ipynb`), dbt project, migrations, Streamlit app, semantic model, screenshots and notes into a **GitHub repo** registered at enrolment. `missionSpec.repoChecks` verifies committed file paths (content regexes are stored for when content checks are switched on — they use plain JavaScript regex syntax, no inline flags); `missionSpec.answers` are single fixed values (number or one token), matched case-insensitively — all correct to unlock the next day. Day 1 is DATA_ROOM, so it grades answers only.

Points: Day 1 = 10, Days 2–13 = 15 each, Days 14–15 are project days (25 + 30). **Max = 245.**

Data safety: every step runs on a Snowflake free trial (30 days or $400 in credits, no credit card) with the built-in `SNOWFLAKE_SAMPLE_DATA` share and small synthetic files — never real customer or production data. Where a trial quota blocks a step (some Cortex Agents / Snowflake Intelligence features), the brief tells the learner what to document instead.

Naming: **Snowflake Intelligence** is evolving into **Snowflake CoWork**; `SNOWFLAKE.CORTEX.COMPLETE` is also available as `AI_COMPLETE`. Exam codes and product names change — cross-check the official exam guides on snowflake.com before each run.

Seed with `npm run db:seed:snowflake`.
