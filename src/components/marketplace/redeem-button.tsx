"use client";

import { useState } from "react";
import { RedeemDialog } from "@/components/marketplace/redeem-dialog";

type Props = {
  itemId: string;
  costSP: number;
  itemTitle: string;
  balance: number;
  imagePath: string | null;
  defaultPhone: string;
  defaultName: string;
};

export function RedeemButton({
  itemId,
  costSP,
  itemTitle,
  balance,
  defaultPhone,
  defaultName,
}: Props) {
  const [open, setOpen] = useState(false);
  const shortfall = costSP - balance;

  if (balance < costSP) {
    return (
      <button
        type="button"
        disabled
        className="h-[31px] w-full rounded-[10px] bg-[#1C283D]/80 text-xs font-semibold text-[#BCBCBC]"
      >
        Need {shortfall} more SP
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-[31px] w-full rounded-[10px] bg-gradient-to-t from-[#2B1D8C] to-[#7166F0] text-xs font-semibold text-white shadow-[inset_0_4px_4px_rgba(0,0,0,0.25)] transition-opacity hover:opacity-95"
      >
        Redeem
      </button>
      <RedeemDialog
        open={open}
        onOpenChange={setOpen}
        itemId={itemId}
        costSP={costSP}
        itemTitle={itemTitle}
        balance={balance}
        defaultPhone={defaultPhone}
        defaultName={defaultName}
      />
    </>
  );
}
