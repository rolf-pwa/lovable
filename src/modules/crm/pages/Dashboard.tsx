import { AppLayout } from "@/shared/components/AppLayout";
import { CommandCenter } from "@/modules/crm/components/CommandCenter";
import { TodayActivities } from "@/modules/crm/components/TodayActivities";

const Dashboard = () => {
  return (
    <AppLayout>
      <div className="space-y-8">
        <TodayActivities />
        <CommandCenter />
      </div>
    </AppLayout>
  );
};

export default Dashboard;
