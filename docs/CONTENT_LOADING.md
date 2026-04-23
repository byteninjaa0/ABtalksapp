# Loading Content

## To add or update problems

1. Open `prisma/content/problems.json`.
2. Add a new entry or modify existing ones matching this structure:

```json
{
  "dayNumber": 1,
  "domain": "SE",
  "title": "Your First Python Program",
  "problemStatement": "Markdown-style text. Use \\n for newlines.",
  "learningObjectives": ["Objective one", "Objective two"],
  "resources": ["https://example.com"],
  "difficulty": "Easy",
  "estimatedMinutes": 5,
  "linkedinTemplate": "Post text with {{github_link}} placeholder",
  "solutionApproach": "How mentors verify the work",
  "tags": ["python", "setup"]
}
```

3. Run: `npm run db:seed`
4. The script upserts by challenge and day number — existing rows are updated, new ones are created when you add JSON entries.
5. Days that have no matching JSON row for that domain still show as **Day N — Placeholder** until you add content.

## To add or update quizzes

1. Open `prisma/content/quizzes.json`.
2. Add entries with `weekNumber`, `domain`, `title`, and a `questions` array. Each question needs `questionOrder`, `questionText`, `optionA`–`optionD`, `correctAnswer` (`A`–`D`), and `explanation`.
3. Run: `npm run db:seed`
4. For each quiz in the file, existing **quiz questions are deleted and recreated** on every seed (clean replace; they do not accumulate).

## Tips

- JSON is strict: use double quotes, no trailing commas.
- Use `\n` for newlines inside `problemStatement` strings.
- Test locally (`npm run db:seed` and the app) before pushing to production.
