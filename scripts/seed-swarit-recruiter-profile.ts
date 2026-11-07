import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";

config({ path: ".env.local" });
config();

const prisma = new PrismaClient();

const EMAIL = "swarit@abtalks.dev";

async function main() {
  const user = await prisma.user.findUnique({
    where: { email: EMAIL },
    select: {
      id: true,
      email: true,
      studentProfile: {
        select: { fullName: true, phone: true, linkedinUrl: true, githubUsername: true },
      },
    },
  });

  if (!user?.studentProfile) {
    throw new Error(`${EMAIL} not found or has no student profile — run npm run db:seed:claude-test`);
  }

  const shareToken = crypto.randomUUID().replace(/-/g, "");

  const review = await prisma.recruiterReview.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      targetRole: "Full-Stack Software Engineer",
      headline: "Consistent Klymb AI performer with strong full-stack delivery",
      summary:
        "Swarit is a motivated computer science student with hands-on experience building production-style web applications. Through the Klymb AI 60-day challenge, he has demonstrated disciplined daily execution, clear communication, and the ability to ship end-to-end features under time constraints. He combines solid fundamentals in JavaScript/TypeScript with practical exposure to modern React and Node.js stacks.",
      skillGroups: [
        {
          category: "Languages",
          skills: ["TypeScript", "JavaScript", "Python", "SQL"],
        },
        {
          category: "Frontend",
          skills: ["React", "Next.js", "Tailwind CSS", "HTML/CSS"],
        },
        {
          category: "Backend & Tools",
          skills: ["Node.js", "PostgreSQL", "Prisma", "Git", "REST APIs"],
        },
      ],
      education: [
        {
          degree: "B.Tech Computer Science",
          institution: "Delhi Technological University",
          year: "2024 – 2028",
          score: "8.6 CGPA",
        },
      ],
      certifications: [
        {
          name: "Meta Front-End Developer Professional Certificate",
          issuer: "Coursera / Meta",
          year: "2025",
        },
        {
          name: "AWS Cloud Practitioner",
          issuer: "Amazon Web Services",
          year: "2024",
        },
      ],
      languagesSpoken: [
        "English — Professional",
        "Hindi — Native",
      ],
      achievements: [
        "Completed 45+ days of the Klymb AI SE challenge with consistent on-time submissions",
        "Built and deployed a task-management SaaS as a capstone project",
        "Campus hackathon finalist — built a real-time collaboration tool in 24 hours",
      ],
      experience: [
        {
          title: "Software Engineering Intern",
          company: "TechNova Solutions",
          location: "Gurugram, India",
          period: "May 2025 – Jul 2025",
          bullets: [
            "Developed internal dashboard features using React and Node.js, reducing manual reporting time by 30%",
            "Collaborated with a 4-person agile team; participated in code reviews and sprint planning",
            "Integrated REST APIs and wrote unit tests for critical business logic modules",
          ],
        },
      ],
      projects: [
        {
          title: "StudySync — Collaborative Learning Platform",
          tech: "Next.js, TypeScript, PostgreSQL, Prisma, Tailwind",
          description:
            "A web app for student groups to share notes, track assignments, and maintain study streaks. Includes auth, real-time updates via polling, and an admin panel for content moderation.",
        },
        {
          title: "ExpenseTracker CLI + Web Dashboard",
          tech: "Python, FastAPI, React, SQLite",
          description:
            "Personal finance tracker with category-wise spending analytics, CSV import/export, and monthly budget alerts. Demonstrates data modeling and full-stack integration skills.",
        },
      ],
      communicationScore: 82,
      programmingScore: 88,
      behaviorScore: 85,
      communicationFeedback:
        "Swarit articulates technical concepts clearly and responds thoughtfully to follow-up questions. He explains trade-offs in his design decisions and communicates progress proactively during collaborative tasks.",
      programmingFeedback:
        "Strong grasp of JavaScript/TypeScript fundamentals and modern React patterns. Writes clean, readable code with appropriate error handling. Comfortable with database design and API integration. Minor room for improvement in advanced algorithm optimization under tight time limits.",
      behaviorFeedback:
        "Professional, receptive to feedback, and collaborates well in team settings. Shows curiosity and a growth mindset. Maintains composure under pressure and follows through on commitments reliably.",
      codingChallenges: [
        {
          name: "Array Manipulation & Two-Pointer Techniques",
          status: "Passed",
          score: "48 / 50",
        },
        {
          name: "REST API Design & CRUD Implementation",
          status: "Passed",
          score: "45 / 50",
        },
        {
          name: "React Component Architecture Challenge",
          status: "Passed",
          score: "42 / 50",
        },
      ],
      strengths: [
        "Consistent daily execution and strong work ethic",
        "Clean, maintainable code with good naming conventions",
        "Quick learner — picks up new frameworks and tools rapidly",
        "Effective communicator in both written and verbal formats",
      ],
      areasForGrowth: [
        "System design depth for large-scale distributed architectures",
        "Advanced algorithmic problem-solving under strict time constraints",
        "Production DevOps and CI/CD pipeline experience",
      ],
      recommendation: "STRONGLY_RECOMMEND",
      assessmentDate: new Date("2026-06-01T00:00:00.000Z"),
      interviewerName: "Admin Klymb AI",
      challengeRound: "Technical + Behavioral",
      klymbId: null,
      logistics: {
        openToRelocation: "Yes",
        preferredLocations: "Bangalore, Hyderabad, Pune, Remote (India)",
        currentLocation: "New Delhi, India",
        availableFrom: "Immediate",
        noticePeriod: "N/A (Student)",
        workAuthorization: "Indian Citizen",
        preferredWorkMode: "Hybrid",
      },
      compensation: {
        currentCtc: "N/A (Student)",
        expectedCtc: "₹8–10 LPA (entry-level)",
        negotiatedOffer: "Open to discussion",
        equity: "Interested in ESOPs at growth-stage startups",
        benefitsRequired: "Health insurance, learning budget",
        currencyPreference: "INR",
      },
      adminNote:
        "Internal: Strong campus ambassador candidate. Recommend for startup full-stack roles. Follow up after challenge completion for placement pipeline.",
      isPublished: true,
      shareToken,
      reviewedAt: new Date(),
    },
    update: {
      targetRole: "Full-Stack Software Engineer",
      headline: "Consistent Klymb AI performer with strong full-stack delivery",
      summary:
        "Swarit is a motivated computer science student with hands-on experience building production-style web applications. Through the Klymb AI 60-day challenge, he has demonstrated disciplined daily execution, clear communication, and the ability to ship end-to-end features under time constraints. He combines solid fundamentals in JavaScript/TypeScript with practical exposure to modern React and Node.js stacks.",
      skillGroups: [
        {
          category: "Languages",
          skills: ["TypeScript", "JavaScript", "Python", "SQL"],
        },
        {
          category: "Frontend",
          skills: ["React", "Next.js", "Tailwind CSS", "HTML/CSS"],
        },
        {
          category: "Backend & Tools",
          skills: ["Node.js", "PostgreSQL", "Prisma", "Git", "REST APIs"],
        },
      ],
      education: [
        {
          degree: "B.Tech Computer Science",
          institution: "Delhi Technological University",
          year: "2024 – 2028",
          score: "8.6 CGPA",
        },
      ],
      certifications: [
        {
          name: "Meta Front-End Developer Professional Certificate",
          issuer: "Coursera / Meta",
          year: "2025",
        },
        {
          name: "AWS Cloud Practitioner",
          issuer: "Amazon Web Services",
          year: "2024",
        },
      ],
      languagesSpoken: [
        "English — Professional",
        "Hindi — Native",
      ],
      achievements: [
        "Completed 45+ days of the Klymb AI SE challenge with consistent on-time submissions",
        "Built and deployed a task-management SaaS as a capstone project",
        "Campus hackathon finalist — built a real-time collaboration tool in 24 hours",
      ],
      experience: [
        {
          title: "Software Engineering Intern",
          company: "TechNova Solutions",
          location: "Gurugram, India",
          period: "May 2025 – Jul 2025",
          bullets: [
            "Developed internal dashboard features using React and Node.js, reducing manual reporting time by 30%",
            "Collaborated with a 4-person agile team; participated in code reviews and sprint planning",
            "Integrated REST APIs and wrote unit tests for critical business logic modules",
          ],
        },
      ],
      projects: [
        {
          title: "StudySync — Collaborative Learning Platform",
          tech: "Next.js, TypeScript, PostgreSQL, Prisma, Tailwind",
          description:
            "A web app for student groups to share notes, track assignments, and maintain study streaks. Includes auth, real-time updates via polling, and an admin panel for content moderation.",
        },
        {
          title: "ExpenseTracker CLI + Web Dashboard",
          tech: "Python, FastAPI, React, SQLite",
          description:
            "Personal finance tracker with category-wise spending analytics, CSV import/export, and monthly budget alerts. Demonstrates data modeling and full-stack integration skills.",
        },
      ],
      communicationScore: 82,
      programmingScore: 88,
      behaviorScore: 85,
      communicationFeedback:
        "Swarit articulates technical concepts clearly and responds thoughtfully to follow-up questions. He explains trade-offs in his design decisions and communicates progress proactively during collaborative tasks.",
      programmingFeedback:
        "Strong grasp of JavaScript/TypeScript fundamentals and modern React patterns. Writes clean, readable code with appropriate error handling. Comfortable with database design and API integration. Minor room for improvement in advanced algorithm optimization under tight time limits.",
      behaviorFeedback:
        "Professional, receptive to feedback, and collaborates well in team settings. Shows curiosity and a growth mindset. Maintains composure under pressure and follows through on commitments reliably.",
      codingChallenges: [
        {
          name: "Array Manipulation & Two-Pointer Techniques",
          status: "Passed",
          score: "48 / 50",
        },
        {
          name: "REST API Design & CRUD Implementation",
          status: "Passed",
          score: "45 / 50",
        },
        {
          name: "React Component Architecture Challenge",
          status: "Passed",
          score: "42 / 50",
        },
      ],
      strengths: [
        "Consistent daily execution and strong work ethic",
        "Clean, maintainable code with good naming conventions",
        "Quick learner — picks up new frameworks and tools rapidly",
        "Effective communicator in both written and verbal formats",
      ],
      areasForGrowth: [
        "System design depth for large-scale distributed architectures",
        "Advanced algorithmic problem-solving under strict time constraints",
        "Production DevOps and CI/CD pipeline experience",
      ],
      recommendation: "STRONGLY_RECOMMEND",
      assessmentDate: new Date("2026-06-01T00:00:00.000Z"),
      interviewerName: "Admin Klymb AI",
      challengeRound: "Technical + Behavioral",
      logistics: {
        openToRelocation: "Yes",
        preferredLocations: "Bangalore, Hyderabad, Pune, Remote (India)",
        currentLocation: "New Delhi, India",
        availableFrom: "Immediate",
        noticePeriod: "N/A (Student)",
        workAuthorization: "Indian Citizen",
        preferredWorkMode: "Hybrid",
      },
      compensation: {
        currentCtc: "N/A (Student)",
        expectedCtc: "₹8–10 LPA (entry-level)",
        negotiatedOffer: "Open to discussion",
        equity: "Interested in ESOPs at growth-stage startups",
        benefitsRequired: "Health insurance, learning budget",
        currencyPreference: "INR",
      },
      adminNote:
        "Internal: Strong campus ambassador candidate. Recommend for startup full-stack roles. Follow up after challenge completion for placement pipeline.",
      isPublished: true,
      shareToken,
      reviewedAt: new Date(),
    },
  });

  // Ensure profile has contact fields for the public page
  await prisma.studentProfile.update({
    where: { userId: user.id },
    data: {
      phone: user.studentProfile.phone ?? "+91 98765 43210",
      linkedinUrl:
        user.studentProfile.linkedinUrl ??
        "https://www.linkedin.com/in/swarit-dev",
      githubUsername: user.studentProfile.githubUsername ?? "swarit-dev",
      isReadyForInterview: true,
    },
  });

  console.log(`✅ Recruiter profile created for ${user.studentProfile.fullName} (${EMAIL})`);
  console.log(`   Published: ${review.isPublished}`);
  console.log(`   Share link: /r/${review.shareToken}`);
  console.log(`   Assessment score: ${82 + 88 + 85} / 300`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
