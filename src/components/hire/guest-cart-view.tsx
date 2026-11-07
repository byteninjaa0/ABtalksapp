"use client";

import { useEffect, useState } from "react";
import { decodeCandidateRef } from "@/features/hire/candidate-ref";
import { ShortlistCart, type CartRow } from "@/components/hire/shortlist-cart";
import {
  guestCartNonProgram,
  readGuestCart,
} from "@/components/hire/guest-cart";

function toRow(item: {
  candidateRef: string;
  jobRole: string;
  totalScore: number;
  openToWork?: boolean;
}): CartRow {
  const ref = decodeCandidateRef(item.candidateRef);
  return {
    candidateRef: item.candidateRef,
    memberId: ref?.source === "PROGRAM" ? ref.id : null,
    jobRole: item.jobRole,
    totalScore: item.totalScore,
    note: null,
    // Carried from the device-local cart so a signed-out recruiter sees the same
    // badge here that they saw on the card they added.
    openToWork: item.openToWork,
    revealedName: null,
    engagementStatus: null,
  };
}

export function GuestCartView() {
  const [rows, setRows] = useState<CartRow[]>([]);

  useEffect(() => {
    const sync = () => setRows(readGuestCart().map(toRow));
    sync();
    window.addEventListener("klymb-hire-cart", sync);
    return () => window.removeEventListener("klymb-hire-cart", sync);
  }, []);

  return <ShortlistCart rows={rows} />;
}

/** Signed-in cart: DB program rows plus device-local Claude/hackathon rows. */
export function ApprovedCart({ rows }: { rows: CartRow[] }) {
  const [extra, setExtra] = useState<CartRow[]>([]);

  useEffect(() => {
    const sync = () => setExtra(guestCartNonProgram().map(toRow));
    sync();
    window.addEventListener("klymb-hire-cart", sync);
    return () => window.removeEventListener("klymb-hire-cart", sync);
  }, []);

  const seen = new Set(rows.map((r) => r.candidateRef));
  return <ShortlistCart rows={[...rows, ...extra.filter((r) => !seen.has(r.candidateRef))]} />;
}
