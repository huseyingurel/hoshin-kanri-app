import { Bell } from "lucide-react";
import { getMyNotifications } from "../actions/notificationActions";
import { NotificationsClient } from "./NotificationsClient";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const notifications = await getMyNotifications();

  return (
    <div className="flex flex-col gap-8 max-w-3xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Bell className="text-blue-500" />
          Bildirimler
        </h1>
        <p className="text-zinc-400 mt-2">
          Dönem, vade, kırmızı KPI, eskalasyon ve catchball olaylarına dair uygulama-içi bildirimleriniz.
        </p>
      </div>

      <NotificationsClient notifications={notifications as never} />
    </div>
  );
}
