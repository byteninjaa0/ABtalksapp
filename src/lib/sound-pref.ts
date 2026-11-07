/**
 * Theme-toggle click sound. Add a short UI clip at `public/sounds/click.mp3`
 * (under ~200ms). Until then, `playClickSound` no-ops when the file is missing
 * or fails to decode (errors are swallowed).
 */
export const SOUND_KEY = "klymb_sound_enabled";

export function isSoundEnabled(): boolean {
  if (typeof window === "undefined") return false;
  const v = localStorage.getItem(SOUND_KEY);
  if (v === "false") return false;
  return true;
}

export function setSoundEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SOUND_KEY, enabled ? "true" : "false");
}

export function playClickSound() {
  if (!isSoundEnabled()) return;
  try {
    const audio = new Audio("/sounds/click.mp3");
    audio.volume = 0.3;
    void audio.play().catch(() => {});
  } catch {
    /* ignore */
  }
}
