export const CLAUDE_MILESTONE_DAYS = [10, 30, 45, 60] as const;

export type ClaudeMilestoneDay = (typeof CLAUDE_MILESTONE_DAYS)[number];

export type ClaudeSharePromptKey = 0 | ClaudeMilestoneDay;

const PASTE_INSTRUCTION =
  "Paste this prompt on ChatGPT or Gemini with your image and post the output image on your LinkedIn";

/** Distinct ~400-word placeholders per milestone until real copy is provided. */
const CLAUDE_SHARE_PROMPTS: Record<ClaudeSharePromptKey, string> = {
  0: `Use the uploaded photo as the exact face reference. Keep the face realistic and recognizable while transforming the person into a premium AI-founder-style avatar. Person should look young as in the picture.

Create a cinematic LinkedIn/Instagram story poster inspired by Claude AI, Linear, Cursor, Arc Browser, Apple keynote visuals, and luxury SaaS branding.

Style:

- Dark matte black/charcoal background
- Warm bronze & amber glow accents
- Subtle blue-purple rim lighting
- Minimal, futuristic, luxury-tech aesthetic
- Clean editorial spacing with strong hierarchy

Composition:

- Vertical poster format
- Large bold headline on the left
- Cinematic founder portrait on the right
- Warm orange key light + cool rim light
- Minimal layout with strong negative space

Add subtle UI-inspired elements:
thin bronze lines, rounded cards, soft gradients, elegant glow effects.

Avoid:
robots, circuit graphics, clutter, cheap cyberpunk effects.

Typography:
Modern bold sans-serif (Satoshi, Inter, SF Pro style), oversized premium headline.

Main Headline:
“I’m joining the 60-Day Claude AI Mastery Challenge”

Secondary Section:
“What I want to learn with AI:”
⚡ AI Workflows
⚡ Prompt Engineering
⚡ Automation
⚡ AI Productivity
⚡ Context Engineering
⚡ Real-World Projects

Personal Statement:
“Excited to build, learn & grow with AI for the next 60 days.”

Bottom CTA:
“If you also don’t want to feel left behind in the AI era, join the challenge now.”
app.klymb.ai/claude-signup

The final design should feel cinematic, founder-focused, futuristic, intelligent, premium, and like a Silicon Valley AI launch campaign.`,

  10: `Use the uploaded photo as the exact face reference. Keep the face realistic and recognizable while transforming the person into a premium AI-founder-style avatar. Person should look young as in the picture.
Create a cinematic LinkedIn/Instagram story poster inspired by Claude AI, Linear, Cursor, Arc Browser, Apple keynote visuals, and luxury SaaS branding.
Style:
Dark matte black/charcoal background
Warm bronze & amber glow accents
Subtle blue-purple rim lighting
Minimal, futuristic, luxury-tech aesthetic
Clean editorial spacing with strong hierarchy
Composition:
Vertical poster format
Large bold headline on the left
Cinematic founder portrait on the right
Warm orange key light + cool rim light
Minimal layout with strong negative space
A glowing "DAY 10 / 60" progress badge near the top with a thin bronze ring or progress bar showing 10 of 60 days complete
A sleek premium announcement pill at the very top, glowing amber, styled like a luxury SaaS launch banner
Top Banner:
🚀 MILESTONE UNLOCKED: 10 Days Completed • 8 Skills & Projects Built
Add subtle UI-inspired elements: thin bronze lines, rounded cards, soft gradients, elegant glow effects. Display the completed skills as a stack of sleek rounded achievement cards with subtle checkmarks, like a premium app dashboard.
Avoid:
Robots
Circuit graphics
Clutter
Cheap cyberpunk effects
Typography:
Modern bold sans-serif (Satoshi, Inter, SF Pro style), oversized premium headline.
Main Headline:
Day 10 of the 60-Day Claude Challenge by Klymb AI ⚡ Here's what I've already built.
Progress Section — "Completed in just 10 days ✅":
✓ Prompt Engineering
✓ Context Engineering
✓ Chain of Thought (CoT) Reasoning
✓ Role-Based Prompting
✓ Resume Optimization using AI
✓ NutriScope Diet Analyzer
✓ AI Portfolio Website
✓ AQI and Water Data Analysis for Health
Personal Statement:
10 days in. 8 skills & projects completed. 50 days of building still ahead. Every day is another step toward becoming an AI-first builder.
Bottom CTA:
AI is moving faster than ever. While you're thinking about it, we're already building. Don't get left behind — join now.
app.klymb.ai/claude-signup`,

  30: `Halfway Milestone Achievement Poster – 60 Days Claude AI Challenge by Klymb AI

> Create a premium, ultra-realistic achievement poster (1080×1350) celebrating "Halfway Completed – Day 30 of the 60 Days Claude AI Challclaudey Klymb AI."

Use the uploaded image as the exact face reference. Preserve the person's facial features, hairstyle, age, skin tone, expression, and identity exactly. Only enhance lighting, sharpness, posture, and overall confidence while keeping the face completely photorealistic.

Theme: Elite AI Professional • Innovation • Growth • Achievement • Future of Work

Background:

Futuristic AI workspace with subtle holographic interfaces

Elegant blue, purple, and white neon lighting

Floating AI elements, digital grids, neural network patterns

Premium corporate/editorial aesthetic

Clean, modern composition with depth and cinematic lighting

Branding (Elegant & Professional):

Klymb AI logo

"60 Days Claude AI Challenge" branding

Premium gold or glowing badge: "DAY 30 • HALFWAY ACHIEVED"

Visual Achievement Elements:

Progress ring showing 30/60 Days

"50% Milestone Completed" badge
Golden achievement ribbon
Confetti and subtle particle effects

Premium glassmorphism UI cards

Small AI-themed icons representing:

Prompt Engineering

Claude Skills

AI Workflows

Connectors

Artifacts

Healthcare
supply chain

Main Headline: HALFWAY THERE

Subheading: Day 30 of the 60 Days Claude AI Challenge

Footer: Keep Learning • Keep Building • Keep Growing

#60DaysClaudeChallenge #Klymb AI

The final poster should look like a prestigious LinkedIn achievement announcement, comparable to a global AI certification or professional award, with a clean, premium, and inspiring design that is highly shareable on social media.

This should also ask others to join and all the demographics should be accurate like 30 out of 60 days should be half circle and all use claude logo as it is`,

  45: `Create a premium LinkedIn milestone poster (portrait 4:5, 1080×1350) celebrating "45/60 Days Completed" of the Klymb AI 60 Days Claude Challenge. This is an IMAGE EDITING task, not an image generation task. Use my uploaded photo exactly as provided. 
  Do NOT redraw, recreate, beautify, stylize, age, de-age, modify, or regenerate my face, hairstyle, skin tone, facial features, expression, clothing, pose, body proportions, or camera angle. 
  Preserve the original photograph pixel-for-pixel, only remove the background and seamlessly composite the original photo into the poster. Place the unmodified photo on the right with soft blue and purple brush-stroke blending and subtle cinematic rim lighting around the edges only. Use a dark navy-black cosmic background with faint stars, abstract tech textures, 
  floating particles, and neon blue (#076573) and violet (#076573) glow. Top-left: Klymb AI in bold white brush typography, PRESENTS below, rounded badge reading "60 DAYS CLAUDE CHALLENGE". Center-left: huge brush-stroke "45", "DAYS", glowing violet pill "COMPLETED". Add a premium progress card showing "45/60", "75% Complete", and a circular progress ring. Add the headline "CONSISTENCY TODAY, EXPERTISE TOMORROW.", subtext "Halfway there. 
  The best projects are still ahead! 🚀", elegant quote card with "Small progress every day leads to big transformation.", section title "WHAT WE'RE BUILDING TOGETHER" with five premium icon cards: Real Projects, AI Mastery, Build in Public, Level Up, Amazing Community. Bottom glowing brush-stroke banner with trophy icon reading "45 DAYS OF FOCUS. A LIFETIME OF IMPACT." and subtitle "LET'S FINISH THESE 15 DAYS LIKE LEGENDS. 🔥". Add handwritten script in the top-right saying "Build. Reflect. Grow.". Use modern startup branding, Behance and Dribbble-quality composition, ultra-sharp typography, clean spacing, high contrast, 
  crisp readable text, premium graphic design, no watermark, no logo distortion, preserve the uploaded photograph exactly without changing the person's appearance.`,

  60: `Create a premium LinkedIn achievement poster (portrait 1080×1350, 4:5) celebrating 60/60 Days Completed of the Klymb AI 60 Days Claude AI Challenge. This is an IMAGE EDITING task, not image generation.

Use my uploaded photograph exactly as provided. Do not redraw, regenerate, beautify, stylize, alter, or modify my face, hairstyle, skin tone, facial features, expression, clothing, pose, body proportions, or camera angle. Preserve the original photo pixel-for-pixel. Only remove the background and seamlessly composite it into the poster. Place the photo on the right with subtle blue and violet brush-stroke blending and soft cinematic rim lighting around the edges only.

Theme

Elite AI Professional • Graduation • Innovation • Growth • Community • Future of Work

Background

Dark navy-black cosmic backdrop with subtle stars, neural-network patterns, holographic UI, floating particles, glassmorphism, and neon blue (#076573) & violet (#076573) lighting. Modern OpenAI / Linear / Apple-style aesthetic.

Branding

Top-left:

Klymb AI
PRESENTS
Rounded badge: 60 DAYS CLAUDE AI CHALLENGE
Official Claude logo (undistorted)
Hero Section

Huge typography:

60
DAYS
Gold glowing pill: COMPLETED

Floating glass achievement card:

60/60
100% Complete
Elite AI Builder
Full circular progress ring (100%)
Gold completion badge
Headline

60 DAYS. COUNTLESS LESSONS. A NEW BEGINNING.

From experimenting with AI to building production-ready projects. This is only the beginning. 🚀

Quote Card

"Consistency beats talent when talent stops showing up."

— Klymb AI Community

What We Built Together

Premium icon cards for:

Prompt Engineering
Claude Mastery
AI Agents
MCP & Connectors
Artifacts & Apps
Healthcare AI
Supply Chain AI
Creative AI
Data & Analytics
AI Automation
Challenge Stats
60 Days
60 AI Projects
8 Learning Phases
Countless Skills Learned
One Incredible Community
Community

MORE THAN A CHALLENGE

Learning together. Building together. Growing together. Creating the next generation of AI professionals.

What's Next
Build Real Products
Launch AI Career
Build in Public
Never Stop Learning

Top-right handwritten script:
Build. Learn. Ship. Repeat.

Bottom glowing banner:
60 DAYS OF DISCIPLINE. A FUTURE BUILT WITH AI.

THANK YOU FOR BUILDING THIS JOURNEY WITH Klymb AI ❤️

Footer:
KEEP BUILDING • KEEP LEARNING • KEEP SHARING

Klymb AI • #60DaysClaudeChallenge

The final poster should look like a prestigious global AI certification or graduation announcement, with ultra-sharp typography, clean spacing, no watermark, no logo distortion, and the uploaded photograph preserved exactly. Keep the original lighting, exposure, color temperature, skin texture, and facial contrast exactly as in the uploaded photograph. Do not relight the face, increase contrast, sharpen facial details, smooth skin, alter shadows, brighten highlights, or apply beauty-retouching. Any glow or rim lighting must be applied only behind the subject and around the silhouette, never across the face or clothing.`,
};

export function getClaudeSharePromptTitle(day: ClaudeSharePromptKey): string {
  if (day === 0) {
    return PASTE_INSTRUCTION;
  }
  return `Congratulations on reaching Day ${day}! ${PASTE_INSTRUCTION}`;
}

export function getClaudeSharePrompt(day: ClaudeSharePromptKey): string {
  return CLAUDE_SHARE_PROMPTS[day];
}

export function isClaudeMilestoneDay(
  dayNumber: number,
): dayNumber is ClaudeMilestoneDay {
  return (CLAUDE_MILESTONE_DAYS as readonly number[]).includes(dayNumber);
}
