import { useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { Bot, X } from "lucide-react";
import { SovereigntyAssistant } from "./SovereigntyAssistant";

export function AssistantSidebar() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Toggle button */}
      {!isOpen && (
        <Button
          onClick={() => setIsOpen(true)}
          size="icon"
          className="fixed bottom-6 right-6 z-50 h-12 w-12 rounded-full shadow-lg bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Bot className="h-5 w-5" />
        </Button>
      )}

      {/* Sidebar panel */}
      {isOpen && (
        <div className="fixed inset-y-0 right-0 z-50 w-[400px] border-l bg-background shadow-2xl flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <span className="text-sm font-semibold">Sovereignty Assistant</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex-1 overflow-hidden">
            <SovereigntyAssistant variant="embedded" />
          </div>
        </div>
      )}
    </>
  );
}
