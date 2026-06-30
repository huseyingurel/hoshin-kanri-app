import { getSessionOrRedirect } from "@/lib/session";
import { ImportWizardClient } from "./ImportWizardClient";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  await getSessionOrRedirect();
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">Excel İçe Aktarım Sihirbazı</h1>
      <ImportWizardClient />
    </div>
  );
}
