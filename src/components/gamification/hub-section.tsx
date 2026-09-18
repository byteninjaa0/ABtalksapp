import {
  getBoard,
  getCohortPanel,
  getLedger,
  getMyBadges,
  getMyProgress,
  getMyQuests,
  getStreakView,
} from "@/features/gamification/loaders";
import { ProgressCard } from "./progress-card";
import { QuestCard } from "./quest-card";
import { WeekStreakCard } from "./week-streak-card";
import { ProofLedger } from "./proof-ledger";
import { CohortProgressPanel } from "./cohort-progress-panel";
import { HackathonResultsBoard } from "./hackathon-results-board";
import { BadgeShelf } from "./badge-shelf";
import { LevelUpOverlay } from "./level-up-overlay";

/**
 * Plan 151 §21 — the hub rail. Progress, the active quest, the week strip and
 * the proof ledger sit beside the main column on desktop and stack on mobile.
 * Every loader is flag-gated and fails soft, so an outage hides a panel
 * instead of breaking the page.
 */
export async function GamificationHubSection({ userId }: { userId: string }) {
  const [progress, quests, streak, ledger, cohort, board, badges] = await Promise.all([
    getMyProgress(userId),
    getMyQuests(userId),
    getStreakView(userId),
    getLedger(userId, 6),
    getCohortPanel(userId),
    getBoard({ board: "hackathon", viewerUserId: userId, limit: 10 }),
    getMyBadges(userId),
  ]);

  const quest = quests[0] ?? null;
  const earnedBadges = badges.filter((b) => b.earnedAt);
  const hasAnything =
    progress || quest || streak || cohort || board?.rows.length || earnedBadges.length;
  if (!hasAnything) return null;

  return (
    <>
      {progress ? <LevelUpOverlay progress={progress} /> : null}
      {/*
        One flow, two shapes. On a phone the cards are ordered by what matters
        first — progress, the next action, the week — with the long badge grid
        last. `contents` lets those same children sit directly in the mobile
        flow, then collapse into a main column and a progress rail on desktop.
      */}
      <div className="mt-6 flex min-w-0 flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-6">
        <div className="contents lg:col-start-1 lg:flex lg:min-w-0 lg:flex-col lg:gap-4">
          {quest ? (
            <div className="order-2 min-w-0">
              <QuestCard quest={quest} />
            </div>
          ) : null}
          {cohort ? (
            <div className="order-4 min-w-0">
              <CohortProgressPanel
                cohortName={cohort.cohortName}
                completed={cohort.completed}
                total={cohort.total}
                percentile={cohort.percentile}
                milestones={cohort.milestones}
                dayLabel={cohort.dayLabel}
              />
            </div>
          ) : null}
          {board && board.rows.length > 0 ? (
            <div className="order-5 min-w-0">
              <HackathonResultsBoard rows={board.rows} viewerRank={board.viewerRank} />
            </div>
          ) : null}
          {badges.length > 0 ? (
            <div className="order-7 min-w-0">
              <BadgeShelf badges={badges} />
            </div>
          ) : null}
        </div>

        <div
          className="contents lg:col-start-2 lg:flex lg:min-w-0 lg:flex-col lg:gap-4"
          aria-label="Your progress"
        >
          {progress ? (
            <div className="order-1 min-w-0">
              <ProgressCard progress={progress} />
            </div>
          ) : null}
          {streak ? (
            <div className="order-3 min-w-0">
              <WeekStreakCard streak={streak} />
            </div>
          ) : null}
          {progress?.started ? (
            <div className="order-6 min-w-0">
              <ProofLedger entries={ledger} />
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
