import { getMyBadges, getMyProgress } from "@/features/gamification/loaders";
import { BadgeShelf } from "./badge-shelf";
import { ProfileProgressStrip } from "./profile-progress-strip";

export async function ProfileGamificationSection({ userId }: { userId: string }) {
  const [progress, badges] = await Promise.all([
    getMyProgress(userId),
    getMyBadges(userId),
  ]);
  if (!progress && badges.length === 0) return null;
  return (
    <div className="space-y-4 px-4 pt-6 sm:px-6">
      {progress ? <ProfileProgressStrip progress={progress} /> : null}
      {badges.length > 0 ? <BadgeShelf badges={badges} compact /> : null}
    </div>
  );
}
