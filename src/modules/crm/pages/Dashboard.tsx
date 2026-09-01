import { AppLayout } from "@/shared/components/AppLayout";
import { CommandCenter } from "@/modules/crm/components/CommandCenter";

const Dashboard = () => {
  return (
    <AppLayout>
      <CommandCenter />
    </AppLayout>
  );
};

export default Dashboard;
