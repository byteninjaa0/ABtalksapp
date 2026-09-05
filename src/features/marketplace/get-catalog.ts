import { prisma } from "@/lib/db";

export type CatalogItem = {
  id: string;
  slug: string;
  title: string;
  description: string;
  costSP: number;
  imagePath: string | null;
  /** Empty for items with no size — the dialog then shows no size control. */
  sizeOptions: string[];
};

export async function getCatalog(): Promise<CatalogItem[]> {
  const items = await prisma.marketplaceItem.findMany({
    where: { active: true },
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      costSP: true,
      imagePath: true,
      sizeOptions: true,
    },
    orderBy: [{ costSP: "desc" }, { sortOrder: "asc" }],
  });
  return items;
}
