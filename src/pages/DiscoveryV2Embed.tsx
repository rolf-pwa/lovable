import { Georgia2App } from "@/components/georgia2/Georgia2App";
import { useEffect } from "react";

const DiscoveryV2Embed = () => {
  useEffect(() => {
    document.title = "Sovereignty Diagnostic";
  }, []);
  return <Georgia2App embed />;
};

export default DiscoveryV2Embed;
