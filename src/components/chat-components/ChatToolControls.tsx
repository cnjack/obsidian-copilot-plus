import React from "react";
import { Pen, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface ChatToolControlsProps {
  composerToggle: boolean;
  setComposerToggle: (value: boolean) => void;
  onComposerToggleOff?: () => void;
}

const ChatToolControls: React.FC<ChatToolControlsProps> = ({
  composerToggle,
  setComposerToggle,
  onComposerToggleOff,
}) => {
  const handleComposerToggle = () => {
    const newValue = !composerToggle;
    setComposerToggle(newValue);
    if (!newValue && onComposerToggleOff) {
      onComposerToggleOff();
    }
  };

  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost2"
            size="fit"
            onClick={handleComposerToggle}
            className={cn(
              "tw-text-muted hover:tw-text-accent",
              composerToggle && "tw-text-accent tw-bg-accent/10"
            )}
          >
            <span className="tw-flex tw-items-center tw-gap-0.5">
              <Sparkles className="tw-size-2" />
              <Pen className="tw-size-3" />
            </span>
          </Button>
        </TooltipTrigger>
        <TooltipContent className="tw-px-1 tw-py-0.5">
          Toggle composer (note editing)
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export { ChatToolControls };
