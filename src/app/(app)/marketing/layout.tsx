import { requireAdmin } from "@/server/auth/guards";
import { MarketingTabs } from "@/components/marketing/marketing-tabs";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <h1 className="text-xl font-semibold">Marketing Email</h1>
        <MarketingTabs />
      </div>
      {children}
    </div>
  );
}
