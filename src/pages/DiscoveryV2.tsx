import { Georgia2App } from "@/components/georgia2/Georgia2App";
import { useEffect } from "react";

const DiscoveryV2 = () => {
  useEffect(() => {
    document.title = "Sovereignty Diagnostic · ProsperWise";
  }, []);
  return <Georgia2App />;
};

export default DiscoveryV2;
