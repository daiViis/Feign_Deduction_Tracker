import { type MouseEvent as ReactMouseEvent } from "react";
import { useTimelineSelection } from "./useTimelineSelection";
import { dispatchOverlayAction } from "./overlayStore";

type TimelineNavigatorProps = {
  className?: string;
  onMouseDown?: (event: ReactMouseEvent<HTMLElement>) => void;
};

export function TimelineNavigator(props: TimelineNavigatorProps) {
  const { className, onMouseDown } = props;
  const {
    currentStepLabel,
    canGoPrevious,
    canGoNext,
    setTimelineViewMode,
    goToPreviousStep,
    goToNextStep
  } = useTimelineSelection();

  const handlePreviousClick = () => {
    setTimelineViewMode("focus");
    goToPreviousStep();
  };

  const handleNextClick = () => {
    setTimelineViewMode("focus");
    if (canGoNext) {
      goToNextStep();
    } else {
      dispatchOverlayAction({ type: "nextPhase" });
    }
  };

  return (
    <div
      className={className ? `timeline-nav ${className}` : "timeline-nav"}
      onMouseDown={onMouseDown}
    >
      <button
        type="button"
        className="toolbar-button toolbar-button--icon timeline-nav__button"
        disabled={!canGoPrevious}
        aria-label="Previous timeline step"
        title="Previous timeline step"
        onClick={handlePreviousClick}
      >
        &lt;
      </button>

      <span className="timeline-nav__label" title={currentStepLabel}>
        {currentStepLabel}
      </span>

      <button
        type="button"
        className="toolbar-button toolbar-button--icon timeline-nav__button"
        disabled={false}
        aria-label={canGoNext ? "Next timeline step" : "Next Night"}
        title={canGoNext ? "Next timeline step" : "Next Night"}
        onClick={handleNextClick}
      >
        &gt;
      </button>
    </div>
  );
}
