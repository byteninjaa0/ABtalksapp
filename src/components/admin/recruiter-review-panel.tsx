"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, X } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  publishRecruiterProfileAction,
  regenerateShareTokenAction,
  unpublishRecruiterProfileAction,
  upsertRecruiterReviewAction,
} from "@/app/actions/recruiter-review-actions";
import { cn } from "@/lib/utils";
import type {
  Certification,
  CodingChallenge,
  Compensation,
  Education,
  Experience,
  Logistics,
  Project,
  RecommendationLevel,
  SkillGroup,
} from "@/lib/validations/recruiter";

type ReviewData = {
  targetRole: string;
  skillGroups: SkillGroup[];
  education: Education[];
  certifications: Certification[];
  languagesSpoken: string[];
  achievements: string[];
  headline: string;
  summary: string;
  experience: Experience[];
  projects: Project[];
  communicationScore: number | null;
  programmingScore: number | null;
  behaviorScore: number | null;
  communicationFeedback: string;
  programmingFeedback: string;
  behaviorFeedback: string;
  codingChallenges: CodingChallenge[];
  strengths: string[];
  areasForGrowth: string[];
  recommendation: RecommendationLevel | null;
  assessmentDate: string;
  interviewerName: string;
  challengeRound: string;
  klymbId: string;
  logistics: Logistics;
  compensation: Compensation;
  adminNote: string;
  isPublished: boolean;
  shareToken: string | null;
};

type Props = {
  studentId: string;
  studentName: string;
  review: ReviewData;
};

const RECOMMENDATION_OPTIONS: {
  value: RecommendationLevel;
  label: string;
}[] = [
  { value: "STRONGLY_RECOMMEND", label: "Strongly recommend" },
  { value: "RECOMMEND", label: "Recommend" },
  { value: "NEUTRAL", label: "Neutral" },
  { value: "DO_NOT_RECOMMEND", label: "Do not recommend" },
];

function TagInput({
  label,
  tags,
  onChange,
  placeholder,
  maxTags = 12,
}: {
  label: string;
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder: string;
  maxTags?: number;
}) {
  const [draft, setDraft] = useState("");

  const addFromDraft = useCallback(() => {
    const parts = draft
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    const next = [...tags];
    for (const p of parts) {
      if (next.length >= maxTags) break;
      if (!next.includes(p)) next.push(p);
    }
    onChange(next);
    setDraft("");
  }, [draft, tags, onChange, maxTags]);

  const removeTag = useCallback(
    (tag: string) => {
      onChange(tags.filter((t) => t !== tag));
    },
    [tags, onChange],
  );

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <Badge key={tag} variant="secondary" className="gap-1 pr-1">
            {tag}
            <button
              type="button"
              className="rounded p-0.5 hover:bg-muted-foreground/20"
              onClick={() => removeTag(tag)}
              aria-label={`Remove ${tag}`}
            >
              <X className="size-3.5" />
            </button>
          </Badge>
        ))}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <Input
          placeholder={placeholder}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addFromDraft();
            }
          }}
          disabled={tags.length >= maxTags}
        />
        <Button
          type="button"
          variant="outline"
          onClick={addFromDraft}
          disabled={tags.length >= maxTags}
        >
          Add
        </Button>
      </div>
    </div>
  );
}

function SkillGroupsEditor({
  groups,
  onChange,
}: {
  groups: SkillGroup[];
  onChange: (groups: SkillGroup[]) => void;
}) {
  function updateGroup(index: number, patch: Partial<SkillGroup>) {
    onChange(groups.map((g, i) => (i === index ? { ...g, ...patch } : g)));
  }

  function removeGroup(index: number) {
    onChange(groups.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-3">
      <Label>Skill groups</Label>
      {groups.map((group, index) => (
        <div key={index} className="space-y-2 rounded-lg border p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">Group {index + 1}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => removeGroup(index)}
            >
              Remove
            </Button>
          </div>
          <Input
            placeholder="Category (e.g. Frontend)"
            value={group.category}
            onChange={(e) => updateGroup(index, { category: e.target.value })}
          />
          <TagInput
            label="Skills in this group"
            tags={group.skills}
            onChange={(skills) => updateGroup(index, { skills })}
            placeholder="Type skills, comma-separated, then Add"
            maxTags={20}
          />
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        disabled={groups.length >= 12}
        onClick={() => onChange([...groups, { category: "", skills: [] }])}
      >
        Add skill group
      </Button>
    </div>
  );
}

function EducationEditor({
  education,
  onChange,
}: {
  education: Education[];
  onChange: (education: Education[]) => void;
}) {
  function updateRow(index: number, patch: Partial<Education>) {
    onChange(education.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function removeRow(index: number) {
    onChange(education.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-3">
      <Label>Education & marks</Label>
      {education.map((row, index) => (
        <div key={index} className="space-y-2 rounded-lg border p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">Education {index + 1}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => removeRow(index)}
            >
              Remove
            </Button>
          </div>
          <Input
            placeholder="Degree"
            value={row.degree}
            onChange={(e) => updateRow(index, { degree: e.target.value })}
          />
          <Input
            placeholder="Institution"
            value={row.institution}
            onChange={(e) => updateRow(index, { institution: e.target.value })}
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              placeholder="Year"
              value={row.year}
              onChange={(e) => updateRow(index, { year: e.target.value })}
            />
            <Input
              placeholder="Score (CGPA / %)"
              value={row.score}
              onChange={(e) => updateRow(index, { score: e.target.value })}
            />
          </div>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        disabled={education.length >= 6}
        onClick={() =>
          onChange([
            ...education,
            { degree: "", institution: "", year: "", score: "" },
          ])
        }
      >
        Add education
      </Button>
    </div>
  );
}

function CertificationsEditor({
  certifications,
  onChange,
}: {
  certifications: Certification[];
  onChange: (certifications: Certification[]) => void;
}) {
  function updateRow(index: number, patch: Partial<Certification>) {
    onChange(
      certifications.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  }

  function removeRow(index: number) {
    onChange(certifications.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-3">
      <Label>Certifications</Label>
      {certifications.map((row, index) => (
        <div key={index} className="space-y-2 rounded-lg border p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">Certification {index + 1}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => removeRow(index)}
            >
              Remove
            </Button>
          </div>
          <Input
            placeholder="Name"
            value={row.name}
            onChange={(e) => updateRow(index, { name: e.target.value })}
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              placeholder="Issuer"
              value={row.issuer}
              onChange={(e) => updateRow(index, { issuer: e.target.value })}
            />
            <Input
              placeholder="Year"
              value={row.year}
              onChange={(e) => updateRow(index, { year: e.target.value })}
            />
          </div>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        disabled={certifications.length >= 12}
        onClick={() =>
          onChange([...certifications, { name: "", issuer: "", year: "" }])
        }
      >
        Add certification
      </Button>
    </div>
  );
}

function ExperienceEditor({
  experience,
  onChange,
}: {
  experience: Experience[];
  onChange: (experience: Experience[]) => void;
}) {
  function updateRow(index: number, patch: Partial<Experience>) {
    onChange(experience.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function removeRow(index: number) {
    onChange(experience.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-3">
      <Label>Experience</Label>
      {experience.map((row, index) => (
        <div key={index} className="space-y-2 rounded-lg border p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">Role {index + 1}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => removeRow(index)}
            >
              Remove
            </Button>
          </div>
          <Input
            placeholder="Title"
            value={row.title}
            onChange={(e) => updateRow(index, { title: e.target.value })}
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              placeholder="Company"
              value={row.company}
              onChange={(e) => updateRow(index, { company: e.target.value })}
            />
            <Input
              placeholder="Location"
              value={row.location}
              onChange={(e) => updateRow(index, { location: e.target.value })}
            />
          </div>
          <Input
            placeholder="Period (e.g. Jan 2022 – Present)"
            value={row.period}
            onChange={(e) => updateRow(index, { period: e.target.value })}
          />
          <TagInput
            label="Bullet points"
            tags={row.bullets}
            onChange={(bullets) => updateRow(index, { bullets })}
            placeholder="Type bullet, comma-separated, then Add"
            maxTags={8}
          />
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        disabled={experience.length >= 8}
        onClick={() =>
          onChange([
            ...experience,
            {
              title: "",
              company: "",
              location: "",
              period: "",
              bullets: [],
            },
          ])
        }
      >
        Add experience
      </Button>
    </div>
  );
}

function ProjectsEditor({
  projects,
  onChange,
}: {
  projects: Project[];
  onChange: (projects: Project[]) => void;
}) {
  function updateProject(index: number, patch: Partial<Project>) {
    onChange(projects.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  function removeProject(index: number) {
    onChange(projects.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-3">
      <Label>Projects</Label>
      {projects.map((project, index) => (
        <div key={index} className="space-y-2 rounded-lg border p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">Project {index + 1}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => removeProject(index)}
            >
              Remove
            </Button>
          </div>
          <Input
            placeholder="Title"
            value={project.title}
            onChange={(e) => updateProject(index, { title: e.target.value })}
          />
          <Input
            placeholder="Tech stack"
            value={project.tech}
            onChange={(e) => updateProject(index, { tech: e.target.value })}
          />
          <Textarea
            placeholder="Description"
            value={project.description}
            rows={2}
            onChange={(e) =>
              updateProject(index, { description: e.target.value })
            }
          />
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        disabled={projects.length >= 8}
        onClick={() =>
          onChange([...projects, { title: "", tech: "", description: "" }])
        }
      >
        Add project
      </Button>
    </div>
  );
}

function CodingChallengesEditor({
  challenges,
  onChange,
}: {
  challenges: CodingChallenge[];
  onChange: (challenges: CodingChallenge[]) => void;
}) {
  function updateRow(index: number, patch: Partial<CodingChallenge>) {
    onChange(challenges.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function removeRow(index: number) {
    onChange(challenges.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-3">
      <Label>Coding challenges</Label>
      {challenges.map((row, index) => (
        <div key={index} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-3">
          <Input
            placeholder="Name"
            value={row.name}
            onChange={(e) => updateRow(index, { name: e.target.value })}
          />
          <Input
            placeholder="Status"
            value={row.status}
            onChange={(e) => updateRow(index, { status: e.target.value })}
          />
          <div className="flex gap-2">
            <Input
              placeholder="Score"
              value={row.score}
              onChange={(e) => updateRow(index, { score: e.target.value })}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => removeRow(index)}
            >
              Remove
            </Button>
          </div>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        disabled={challenges.length >= 12}
        onClick={() =>
          onChange([...challenges, { name: "", status: "", score: "" }])
        }
      >
        Add challenge
      </Button>
    </div>
  );
}

function ScoreInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        type="number"
        min={0}
        max={100}
        value={value ?? ""}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") {
            onChange(null);
            return;
          }
          const n = Number(raw);
          if (Number.isNaN(n)) return;
          onChange(Math.min(100, Math.max(0, Math.round(n))));
        }}
      />
    </div>
  );
}

export function RecruiterReviewPanel({ studentId, studentName, review }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [targetRole, setTargetRole] = useState(review.targetRole);
  const [skillGroups, setSkillGroups] = useState(review.skillGroups);
  const [education, setEducation] = useState(review.education);
  const [certifications, setCertifications] = useState(review.certifications);
  const [languagesSpoken, setLanguagesSpoken] = useState(review.languagesSpoken);
  const [achievements, setAchievements] = useState(review.achievements);
  const [headline, setHeadline] = useState(review.headline);
  const [summary, setSummary] = useState(review.summary);
  const [experience, setExperience] = useState(review.experience);
  const [projects, setProjects] = useState(review.projects);
  const [communicationScore, setCommunicationScore] = useState(
    review.communicationScore,
  );
  const [programmingScore, setProgrammingScore] = useState(
    review.programmingScore,
  );
  const [behaviorScore, setBehaviorScore] = useState(review.behaviorScore);
  const [communicationFeedback, setCommunicationFeedback] = useState(
    review.communicationFeedback,
  );
  const [programmingFeedback, setProgrammingFeedback] = useState(
    review.programmingFeedback,
  );
  const [behaviorFeedback, setBehaviorFeedback] = useState(
    review.behaviorFeedback,
  );
  const [codingChallenges, setCodingChallenges] = useState(
    review.codingChallenges,
  );
  const [strengths, setStrengths] = useState(review.strengths);
  const [areasForGrowth, setAreasForGrowth] = useState(review.areasForGrowth);
  const [recommendation, setRecommendation] = useState(review.recommendation);
  const [assessmentDate, setAssessmentDate] = useState(review.assessmentDate);
  const [interviewerName, setInterviewerName] = useState(review.interviewerName);
  const [challengeRound, setChallengeRound] = useState(review.challengeRound);
  const [klymbId, setKlymbId] = useState(review.klymbId);
  const [logistics, setLogistics] = useState(review.logistics);
  const [compensation, setCompensation] = useState(review.compensation);
  const [adminNote, setAdminNote] = useState(review.adminNote);
  const [isPublished, setIsPublished] = useState(review.isPublished);
  const [shareToken, setShareToken] = useState(review.shareToken);

  const assessmentComposite = useMemo(() => {
    if (
      communicationScore == null ||
      programmingScore == null ||
      behaviorScore == null
    ) {
      return null;
    }
    return communicationScore + programmingScore + behaviorScore;
  }, [communicationScore, programmingScore, behaviorScore]);

  function handleSave() {
    startTransition(async () => {
      const result = await upsertRecruiterReviewAction({
        userId: studentId,
        targetRole: targetRole || undefined,
        headline: headline || undefined,
        summary: summary || undefined,
        adminNote: adminNote || undefined,
        skillGroups: skillGroups.filter((g) => g.category.trim()),
        education: education.filter(
          (e) => e.degree.trim() && e.institution.trim(),
        ),
        certifications: certifications.filter((c) => c.name.trim()),
        languagesSpoken,
        achievements,
        experience: experience.filter((e) => e.title.trim()),
        projects: projects.filter((p) => p.title.trim()),
        communicationScore,
        programmingScore,
        behaviorScore,
        communicationFeedback: communicationFeedback || undefined,
        programmingFeedback: programmingFeedback || undefined,
        behaviorFeedback: behaviorFeedback || undefined,
        codingChallenges: codingChallenges.filter((c) => c.name.trim()),
        strengths,
        areasForGrowth,
        recommendation,
        assessmentDate: assessmentDate || "",
        interviewerName: interviewerName || undefined,
        challengeRound: challengeRound || undefined,
        klymbId: klymbId || undefined,
        logistics,
        compensation,
      });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Recruiter review saved");
      router.refresh();
    });
  }

  function handlePublish() {
    startTransition(async () => {
      const result = await publishRecruiterProfileAction({ userId: studentId });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setShareToken(result.data.shareToken);
      setIsPublished(true);
      toast.success("Recruiter profile published");
      router.refresh();
    });
  }

  function handleUnpublish() {
    startTransition(async () => {
      const result = await unpublishRecruiterProfileAction({ userId: studentId });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setIsPublished(false);
      toast.success("Recruiter profile unpublished");
      router.refresh();
    });
  }

  function handleRegenerate() {
    startTransition(async () => {
      const result = await regenerateShareTokenAction({ userId: studentId });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setShareToken(result.data.shareToken);
      toast.success("Share link regenerated");
      router.refresh();
    });
  }

  async function handleCopy() {
    if (!shareToken) return;
    const url = `${window.location.origin}/r/${shareToken}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Could not copy link");
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Capture the full resume and assessment report for {studentName}. Contact
        details are never shown on the shared page.
      </p>

      <Tabs defaultValue="resume">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="resume">Resume</TabsTrigger>
          <TabsTrigger value="assessment">Assessment</TabsTrigger>
          <TabsTrigger value="internal">Internal</TabsTrigger>
        </TabsList>

        <TabsContent value="resume" className="space-y-4 pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Resume content</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="targetRole">Target role</Label>
                <Input
                  id="targetRole"
                  value={targetRole}
                  onChange={(e) => setTargetRole(e.target.value)}
                  placeholder="e.g. Full-stack Engineer"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="headline">Headline</Label>
                <Input
                  id="headline"
                  value={headline}
                  onChange={(e) => setHeadline(e.target.value)}
                />
              </div>
              <SkillGroupsEditor groups={skillGroups} onChange={setSkillGroups} />
              <EducationEditor education={education} onChange={setEducation} />
              <CertificationsEditor
                certifications={certifications}
                onChange={setCertifications}
              />
              <TagInput
                label="Languages spoken"
                tags={languagesSpoken}
                onChange={setLanguagesSpoken}
                placeholder='e.g. "English — Native", comma-separated'
              />
              <TagInput
                label="Achievements"
                tags={achievements}
                onChange={setAchievements}
                placeholder="Type achievements, comma-separated, then Add"
              />
              <div className="space-y-2">
                <Label htmlFor="summary">Professional summary</Label>
                <Textarea
                  id="summary"
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  rows={4}
                />
              </div>
              <ExperienceEditor experience={experience} onChange={setExperience} />
              <ProjectsEditor projects={projects} onChange={setProjects} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="assessment" className="space-y-4 pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Klymb AI assessment scores</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <ScoreInput
                  label="Communication (/100)"
                  value={communicationScore}
                  onChange={setCommunicationScore}
                />
                <ScoreInput
                  label="Programming (/100)"
                  value={programmingScore}
                  onChange={setProgrammingScore}
                />
                <ScoreInput
                  label="Behavior (/100)"
                  value={behaviorScore}
                  onChange={setBehaviorScore}
                />
              </div>
              <p className="text-sm font-medium">
                Klymb AI Assessment Score:{" "}
                {assessmentComposite != null
                  ? `${assessmentComposite} / 300`
                  : "— / 300"}
              </p>
              <div className="space-y-2">
                <Label htmlFor="communicationFeedback">
                  Communication feedback
                </Label>
                <Textarea
                  id="communicationFeedback"
                  value={communicationFeedback}
                  onChange={(e) => setCommunicationFeedback(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="programmingFeedback">Programming feedback</Label>
                <Textarea
                  id="programmingFeedback"
                  value={programmingFeedback}
                  onChange={(e) => setProgrammingFeedback(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="behaviorFeedback">Behavior feedback</Label>
                <Textarea
                  id="behaviorFeedback"
                  value={behaviorFeedback}
                  onChange={(e) => setBehaviorFeedback(e.target.value)}
                  rows={3}
                />
              </div>
              <CodingChallengesEditor
                challenges={codingChallenges}
                onChange={setCodingChallenges}
              />
              <TagInput
                label="Key strengths"
                tags={strengths}
                onChange={setStrengths}
                placeholder="Type strengths, comma-separated, then Add"
              />
              <TagInput
                label="Areas for growth"
                tags={areasForGrowth}
                onChange={setAreasForGrowth}
                placeholder="Type areas, comma-separated, then Add"
              />
              <div className="space-y-2">
                <Label>Recommendation</Label>
                <Select
                  value={recommendation ?? ""}
                  onValueChange={(v) =>
                    setRecommendation(
                      v ? (v as RecommendationLevel) : null,
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select recommendation" />
                  </SelectTrigger>
                  <SelectContent>
                    {RECOMMENDATION_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="assessmentDate">Assessment date</Label>
                  <Input
                    id="assessmentDate"
                    type="date"
                    value={assessmentDate}
                    onChange={(e) => setAssessmentDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="interviewerName">Interviewer name</Label>
                  <Input
                    id="interviewerName"
                    value={interviewerName}
                    onChange={(e) => setInterviewerName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="challengeRound">Challenge round</Label>
                  <Input
                    id="challengeRound"
                    value={challengeRound}
                    onChange={(e) => setChallengeRound(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="klymbId">Klymb AI ID</Label>
                  <Input
                    id="klymbId"
                    value={klymbId}
                    onChange={(e) => setKlymbId(e.target.value)}
                    placeholder="Leave blank to auto-generate"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="internal" className="space-y-4 pt-4">
          <Card className="border-destructive/30">
            <CardHeader>
              <CardTitle>Internal — not shown to recruiters</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                {(
                  [
                    ["openToRelocation", "Open to relocation"],
                    ["preferredLocations", "Preferred locations"],
                    ["currentLocation", "Current location"],
                    ["availableFrom", "Available from"],
                    ["noticePeriod", "Notice period"],
                    ["workAuthorization", "Work authorization"],
                    ["preferredWorkMode", "Preferred work mode"],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key} className="space-y-2">
                    <Label>{label}</Label>
                    <Input
                      value={logistics[key]}
                      onChange={(e) =>
                        setLogistics({ ...logistics, [key]: e.target.value })
                      }
                    />
                  </div>
                ))}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {(
                  [
                    ["currentCtc", "Current CTC"],
                    ["expectedCtc", "Expected CTC"],
                    ["negotiatedOffer", "Negotiated offer"],
                    ["equity", "Equity"],
                    ["benefitsRequired", "Benefits required"],
                    ["currencyPreference", "Currency preference"],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key} className="space-y-2">
                    <Label>{label}</Label>
                    <Input
                      value={compensation[key]}
                      onChange={(e) =>
                        setCompensation({
                          ...compensation,
                          [key]: e.target.value,
                        })
                      }
                    />
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                <Label htmlFor="adminNote">Interviewer private notes</Label>
                <Textarea
                  id="adminNote"
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  rows={4}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={handleSave} disabled={pending}>
          {pending ? "Saving…" : "Save review"}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Publish & share</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isPublished ? (
            <Button type="button" onClick={handlePublish} disabled={pending}>
              {pending ? "Publishing…" : "Publish recruiter profile"}
            </Button>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input
                  readOnly
                  value={
                    shareToken
                      ? `${typeof window !== "undefined" ? window.location.origin : ""}/r/${shareToken}`
                      : ""
                  }
                  className="font-mono text-sm"
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCopy}
                    disabled={!shareToken || pending}
                  >
                    <Copy className="mr-2 size-4" />
                    Copy
                  </Button>
                  {shareToken ? (
                    <Link
                      href={`/r/${shareToken}`}
                      target="_blank"
                      rel="noreferrer"
                      className={cn(buttonVariants({ variant: "outline" }))}
                    >
                      Preview
                    </Link>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleRegenerate}
                  disabled={pending}
                >
                  Regenerate link
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleUnpublish}
                  disabled={pending}
                >
                  Unpublish
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
