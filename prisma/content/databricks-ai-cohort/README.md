# Databricks Data & AI Engineering Cohort — content seed

Content JSONs for the **15-Day Databricks Data & AI Engineering Cohort** (a retail/e-commerce lakehouse built on Databricks Free Edition, mapped to the Databricks Certified Data Engineer Associate and Machine Learning Associate exam guides, with a Generative AI Engineering capstone). It is a separate track from the 31-day healthcare-claims Databricks cohort in `prisma/content/Databricks/` (LearningProgram `databricks`). This one is LearningProgram `databricks-ai`, served at `/program/databricks-ai`. Same seed structure as the Snowflake and Power BI cohorts, so all of them render and grade identically.

Files:
- `modules.json` — the 6 modules, one per program phase (title, subtitle, color, start/end day).
- `days.json` — per-day mission briefs (`briefMd`) plus server-only `missionSpec` (`answers` for the Submit-your-answers questions and `repoChecks` for GitHub verification), `objectives`, `tools`, `estimatedMin`, `missionPoints`, `isProjectDay`, `missionType` (DATA_ROOM for the Day 1 setup day, SHIP_IT for build days).
- `concept-questions.json` — 5 multiple-choice concept questions per day (`options`, `correctIndex`, `explanation`).
- `entry-questions.json` — empty. This cohort is open to anyone with a completed Klymb AI profile, and there is no entrance exam.
- `exercises.json` — empty. The work happens in the learner's own Free Edition workspace, so the daily repo artifacts are the signal, not isolated practice-arena snippets.
- `videos.json` — per-day YouTube resources (`youtubeId`) taken from the program document (28, all checked live via YouTube oEmbed on 2026-09-22). **Re-check each one before every cohort run** — channel-owner takedowns and re-uploads are common.
- `rubrics.json` — milestone rubrics grouped into 4 milestones (Governed Platform Foundations, Data Engineering Pipelines, Analytics & ML Engineering, Generative AI Capstone), loaded at grade time.

Verification model: learners connect a **Databricks Git folder** to the GitHub repo registered at enrolment, with the default notebook format set to **Source** so Python notebooks commit as `notebooks/dayNN_*.py`. They also commit the pipeline SQL, job YAML, bundle, dashboard, notes and screenshots. `missionSpec.repoChecks` verifies committed file paths. Content regexes are stored for when content checks are switched on, and they use plain JavaScript regex syntax with no inline flags. `missionSpec.answers` are single fixed values (a number or one token), matched case-insensitively, and all must be correct to unlock the next day. Day 1 is DATA_ROOM, so it grades answers only.

Points: Day 1 = 10, Days 2–13 = 15 each, Days 14–15 are project days (25 + 30). **Max = 245.**

Data safety: every step runs on Databricks Free Edition (no credit card, no cloud account) with the built-in `samples` catalog and small synthetic files — never real customer or production data. Free Edition is serverless-only and quota-limited (one SQL warehouse, one active pipeline per type, one AI Search endpoint, restricted outbound internet, no Online Tables). Where a step is blocked, the brief tells the learner what to document instead.

Where the program doc would fail on Free Edition as written, the briefs were corrected: Auto Loader uses `trigger(availableNow=True)` because serverless supports no other streaming trigger; Day 9 reads the query profile because serverless has no Spark UI; Day 5 notes that serverless reports `spark.sql.shuffle.partitions` as `auto` and doesn't allow `autoBroadcastJoinThreshold`; Day 13 uses serverless environment version 4+ for `pyspark.ml` and Optuna in place of Hyperopt, which Databricks stopped shipping after 16.4 LTS ML; and the REST step has a fallback for blocked egress.

Naming: Delta Live Tables = **Lakeflow Declarative Pipelines**; Workflows = **Lakeflow Jobs**; Databricks Asset Bundles = **Declarative Automation Bundles**; Vector Search = **AI Search** (June 2026). Exam guides change — cross-check the official guides on databricks.com before each run.

Seed with `npm run db:seed:databricks-ai`. The seed refuses both production Neon hosts unless `SEED_ALLOW_PRODUCTION=true`.
