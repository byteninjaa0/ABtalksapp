# Klymb AI Program Repository

Your program repo holds notebooks, code, and project deliverables for the 60-day AI Mastery cohort.

## Setup (Day 1)

Copy these template files into your GitHub repo root:

- `.devcontainer/devcontainer.json` — one-click Codespaces / Dev Container setup
- `requirements.txt` — Python dependencies for lab notebooks
- `notebooks/` — starter notebooks for lab days

We do **not** push to your repo — you clone, copy, commit, and push.

```bash
git clone https://github.com/YOU/your-program-repo.git
cd your-program-repo
# copy template files from the program repo-template bundle
git add .
git commit -m "Set up program repo scaffold"
git push origin main
```

## Lab days

On notebook lab days, work in the in-platform JupyterLite lab or open the same notebook in Colab/Codespaces. Submit by pushing your `.ipynb` to the path shown on the mission page, then click **Submit for verification**.

## Structure

```
.
├── .devcontainer/
│   └── devcontainer.json
├── data/                         # Day 4+ structured datasets
│   ├── plans.csv
│   └── claims.csv
├── notebooks/
│   └── day04-ingestion-lab.ipynb
├── coverage.db                   # Day 4 SQLite deliverable
├── structured_queries.md         # Day 4 SQL query log
├── README.md
└── requirements.txt
```
