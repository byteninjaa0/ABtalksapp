import Image from "next/image";
import type { CatalogItem } from "@/features/marketplace/get-catalog";
import { ProductImage } from "@/components/marketplace/product-image";
import { RedeemButton } from "@/components/marketplace/redeem-button";

type Props = {
  item: CatalogItem;
  balance: number;
  defaultPhone: string;
  defaultName: string;
};

export function ProductCard({
  item,
  balance,
  defaultPhone,
  defaultName,
}: Props) {
  // Items priced at 0 SP aren't priced yet — show as "Revealing Soon".
  const revealSoon = item.costSP <= 0;

  return (
    <article className="flex min-h-[396px] w-full max-w-[312px] flex-col overflow-hidden rounded-[15px] border border-[#030712] bg-gradient-to-b from-[#180F5B] to-[#050C1D]">
      <div className="-mt-4 overflow-hidden">
        <ProductImage src={item.imagePath} alt={item.title} />
      </div>
      <div className="flex flex-1 flex-col px-[26px] pb-5 pt-1">
        <h3 className="text-xl font-bold leading-6 text-white">{item.title}</h3>
        <p className="mt-2 line-clamp-3 text-[10px] leading-[1.35] text-[#BCBCBC]">
          {item.description}
        </p>

        {revealSoon ? (
          <>
            <div className="mt-auto flex items-center gap-2 pt-4">
              <span className="text-lg font-bold tracking-tight text-white">
                Revealing Soon
              </span>
              <span className="inline-block size-1.5 animate-pulse rounded-full bg-[#7364E6]" />
            </div>
            <div className="mt-3">
              <div className="flex h-11 w-full items-center justify-center rounded-[10px] border border-[#7364E6]/40 bg-white/[0.04] text-sm font-semibold text-[#BCBCBC]">
                Revealing Soon
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="mt-auto flex items-center gap-2 pt-4">
              <Image
                src="/marketplace/synergy-coin.png"
                alt=""
                width={21}
                height={21}
                className="size-[21px] shrink-0 rounded-full"
                aria-hidden
              />
              <span className="text-xl font-bold text-white">{item.costSP}</span>
              <span className="text-[11px] text-[#7364E6]">Synergy Points</span>
            </div>
            <div className="mt-3">
              <RedeemButton
                itemId={item.id}
                costSP={item.costSP}
                itemTitle={item.title}
                balance={balance}
                imagePath={item.imagePath}
                defaultPhone={defaultPhone}
                defaultName={defaultName}
                sizeOptions={item.sizeOptions}
              />
            </div>
          </>
        )}
      </div>
    </article>
  );
}
