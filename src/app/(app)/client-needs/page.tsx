import { requireAdminOrProcessor } from "@/server/auth/guards";
import { db } from "@/server/db/client";
import { getAllProductOptions } from "@/server/actions/client-need-catalog";
import { ClientNeedsBrowser, type BrowsableClientNeed } from "@/components/client-needs/client-needs-browser";

export default async function ClientNeedsPage() {
  await requireAdminOrProcessor();

  const [items, allProducts] = await Promise.all([
    db.query.clientNeeds.findMany({
      with: {
        questions: true,
        products: { columns: { id: true } },
        categoryLinks: { columns: { category: true } },
      },
      orderBy: (cn, { asc }) => asc(cn.itemName),
    }),
    getAllProductOptions(),
  ]);

  const browsableItems: BrowsableClientNeed[] = items.map((item) => ({
    id: item.id,
    itemName: item.itemName,
    description: item.description,
    category: item.category,
    needType: item.needType,
    esignVendor: item.esignVendor,
    linkUrl: item.linkUrl,
    pandadocTemplateUuid: item.pandadocTemplateUuid,
    templateFileName: item.templateFileName,
    isCustom: item.isCustom,
    isGlobal: item.isGlobal,
    loanCategories: item.categoryLinks.map((l) => l.category),
    questions: item.questions,
    productCount: item.products.length,
  }));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Client Needs</h1>
        <p className="text-sm text-muted-foreground">
          The shared library every product&apos;s checklist pulls from — edit one here and it updates everywhere
          it&apos;s used.
        </p>
      </div>

      <ClientNeedsBrowser items={browsableItems} allProducts={allProducts} />
    </div>
  );
}
