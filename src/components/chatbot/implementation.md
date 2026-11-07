# Klymb AI Knowledge Assistant — Implementation Plan

## 1. Project Goal

Build a small, website-embedded Klymb AI Help Assistant.

The user sees a compact chat bubble in the corner of the Klymb AI website. Clicking it opens a small chat panel with:

- A short welcome message
- A handful of suggested questions
- A normal text input so the user can ask anything
- Grounded answers from the approved Klymb AI knowledge base
- A strict fallback when the knowledge base cannot support an answer

This is not a general-purpose chatbot.

### Core rule

> The assistant may answer only from approved Klymb AI knowledge. If the retrieved knowledge does not contain enough information to answer reliably, the assistant must not guess, infer unpublished information, or use general model knowledge. It must direct the user to the official Klymb AI support email.

## 2. What the Assistant Should Know

The knowledge base should cover all publicly answerable Klymb AI information that is available in the supplied source material.

## Main knowledge areas

1. Klymb AI identity and positioning
2. What Klymb AI is
3. Why Klymb AI exists
4. Who Klymb AI is for
5. Anil Bajpai
6. Klymb AI community
7. 60-Day Coding Challenge
8. 60-Day Claude AI Challenge
9. AI Cohort
10. AI Tools Workshop
11. Figma × Cursor AI/UI/UX Workshop
12. ViCodathon / Vibe Code Hackathon
13. Hackathon rules
14. Hackathon submission requirements
15. Hackathon judging and verification
16. Community rules
17. Certificates
18. Registration
19. Events
20. Social channels
21. Contact information
22. Website sections
23. Publicly described recruiter/talent ecosystem
24. Publicly described Klymb AI vision and future direction
25. FAQs and common variations of already-answered questions

## 3. Important Source Interpretation Rules

The supplied documents are not all from the same date.

They are snapshots of Klymb AI at different points in time. The knowledge system must preserve source dates and scope instead of treating every document as simultaneous.

### Community numbers

The `10,000+` figure is the overall Klymb AI community figure.

The older approximately `2,400+` figure was associated with the hackathon context and subsequently increased.

### Instagram

The current official identity is:

`@abtalksonai`

The older `@abtalks_official` reference should not be used as the current official Instagram identity because it was flagged for duplication.

### Workshops

The following are separate offerings:

1. The broader/free AI Tools Workshop
2. The Figma × Cursor AI/UI/UX Workshop

They must not be merged into one workshop.

### Dates

Documents represent different moments.

The knowledge system must distinguish historical, current, upcoming, expired, and unknown.

## 4. Repository Structure

Use the existing `abtalksapp` repository.

The knowledge system is part of the application, but the knowledge files are not React components.

## 5. Source File Conversion Plan

### Source 1: Klymb AI Master Fact Sheet PDF

Primary foundation for identity, positioning, audience, operating model, program index, core program information, community, channels, site map, and stakeholder value.

### Source 2: Klymb AI Overview PPTX

Broad overview source for what Klymb AI is, why it exists, operating model, community, program portfolio, AI Cohort overview, and workshop overview.

### Source 3: Klymb AI Fact Sheet DOCX

Treat as duplicate or alternate representation of the Master Fact Sheet unless it contains new information.

### Source 4: Klymb AI Fact Sheet PDF

Same treatment as the Master Fact Sheet.

### Source 5: AI Tools Workshop Program Overview

Primary source for the AI Tools Workshop, workshop purpose, duration, format, audience, tools covered, curriculum, and ongoing Klymb AI programs.

### Source 6: Figma × Cursor AI/UI/UX Workshop PDF

Separate workshop. Create a dedicated section in `processed/workshops.md`.

### Source 7: ViCodathon 2026 Official Event Notice

Highest-authority source for event-specific facts. Mark the event as historical/completed because the event dates are past relative to the project date.

### Source 8: ViCodathon Influencer Brief

Supporting source for hackathon positioning, content angles, and event ecosystem context.
