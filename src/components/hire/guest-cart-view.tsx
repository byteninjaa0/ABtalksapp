"use client";

import { useEffect, useState } from "react";
import { ShortlistCart, type CartRow } from "@/components/hire/shortlist-cart";
import { readGuestCart } from "@/components/hire/guest-cart";

export function GuestCartView() {
  const [rows, setRows] = useState<CartRow[]>([]);

  useEffect(() => {
    const sync = () => {
      setRows(
        readGuestCart().map((i) => ({
          memberId: i.memberId,
          jobRole: i.jobRole,
          totalScore: i.totalScore,
          note: null,
          revealedName: null,
          engagementStatus: null,
        })),
      );
    };
    sync();
    window.addEventListener("abtalks-hire-cart", sync);
    return () => window.removeEventListener("abtalks-hire-cart", sync);
  }, []);

  return <ShortlistCart rows={rows} />;
}
