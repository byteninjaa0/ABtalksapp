import type { CatalogItem } from "@/features/marketplace/get-catalog";
import { ProductCard } from "@/components/marketplace/product-card";

type Props = {
  items: CatalogItem[];
  balance: number;
  defaultPhone: string;
  defaultName: string;
};

export function ProductGrid({
  items,
  balance,
  defaultPhone,
  defaultName,
}: Props) {
  return (
    <div
      id="products"
      className="grid grid-cols-1 justify-items-center gap-x-[51px] gap-y-[53px] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
    >
      {items.map((item) => (
        <ProductCard
          key={item.id}
          item={item}
          balance={balance}
          defaultPhone={defaultPhone}
          defaultName={defaultName}
        />
      ))}
    </div>
  );
}
