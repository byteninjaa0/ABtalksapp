export const DASHBOARD_FAQ: { q: string; a: string }[] = [
  {
    q: "How does the 60-day challenge work?",
    a: "Each day you receive a new task in your chosen track (AI, Data Science, Software Engineering, or Claude). Complete it, submit proof on GitHub and LinkedIn, and move on to the next day. The challenge runs for 60 IST calendar days from your start date.",
  },
  {
    q: "What proof do I need for daily submissions?",
    a: "Every submission requires a GitHub repository link and a LinkedIn post URL showing your work for that day. Both links are verified before your submission is marked complete.",
  },
  {
    q: "How are streaks calculated?",
    a: "Your streak counts consecutive IST calendar days on which you submit at least one challenge task. Missing a day resets your current streak, but your longest streak is always preserved.",
  },
  {
    q: "What are Synergy points?",
    a: "Synergy points reward community participation: referrals, workshop attendance, and other platform activity. You can redeem them in the Marketplace for rewards and perks.",
  },
  {
    q: "When do I get a certificate?",
    a: "Certificates are issued when you complete all 60 days of your challenge track. You can view and download them from the Achievements page once issued.",
  },
  {
    q: "Can I join another track?",
    a: "You can explore other tracks from the Roadmaps section on your dashboard. Each track has its own 60-day journey. Browse available challenges and follow the join flow for the track you want.",
  },
  {
    q: "How do I contact support?",
    a: "Email us at team@abtalks.in for any questions, technical issues, or feedback. We typically respond within one business day.",
  },
];

/** Three questions per hub stage, shown under that stage's panel. */
export const STAGE_FAQ: Record<"build" | "test" | "hired", { q: string; a: string }[]> = {
  build: [
    {
      q: "How does the 60-day challenge work?",
      a: "Each day you receive a new task in your track. Complete it, submit proof on GitHub and LinkedIn, and move on to the next day. The challenge runs for 60 IST calendar days from your start date.",
    },
    {
      q: "How are streaks calculated?",
      a: "Your streak counts consecutive IST calendar days on which you submit at least one challenge task. Missing a day resets your current streak, but your longest streak is always kept. Streak milestones unlock badges at 3, 5, 7, 10, 14, 30 and 60 days.",
    },
    {
      q: "What proof do I need for daily submissions?",
      a: "Every submission needs a GitHub repository link and a LinkedIn post URL showing your work for that day. Both are checked before the day is marked complete.",
    },
  ],
  test: [
    {
      q: "How do I reach the three Test skills milestones?",
      a: "Complete one AI mock interview, pass a weekly quiz on your track, and submit a project in a hackathon. Each milestone is a third of your Test skills score.",
    },
    {
      q: "When do weekly quizzes unlock?",
      a: "A quiz unlocks after each completed week of your 60-day track. Take it from your track page or straight from the Test skills panel when it says “Ready now”.",
    },
    {
      q: "Do recruiter assessments count towards my score?",
      a: "No. Recruiter assessments are extra — they show up when a recruiter invites you, and don't change your Test skills score.",
    },
  ],
  hired: [
    {
      q: "How is my profile strength calculated?",
      a: "Nine sections add up to 100%: basic information, experience, education, projects, skills, accomplishments, resume, links and career preferences. The Get hired panel shows what each is worth and what's left.",
    },
    {
      q: "Can recruiters see my profile?",
      a: "Recruiters can discover you once your profile is set up. Turn on Open to work in your profile to let them know you're actively looking.",
    },
    {
      q: "Where do I find jobs to apply for?",
      a: "Open Jobs from the sidebar or the Browse jobs card to see roles, track your applications and set up job alerts.",
    },
  ],
};
