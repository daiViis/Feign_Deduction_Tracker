import { useMemo } from "react";
import {
  getCurrentTimelineStep,
  setTimelineViewMode,
  setCurrentTimelineStep,
  useOverlayState
} from "./overlayStore";
import {
  getLabelForTimelineStep,
  getTimelineStepKey,
  getTimelineStepOptionIndex,
  getTimelineSteps
} from "./timeline";

export function useTimelineSelection() {
  const state = useOverlayState();
  const steps = useMemo(() => getTimelineSteps(state.match), [state.match]);
  const currentStep = getCurrentTimelineStep(state);
  const currentIndex = getTimelineStepOptionIndex(steps, currentStep);
  const previousStep = currentIndex > 0 ? steps[currentIndex - 1] : undefined;
  const nextStep =
    currentIndex >= 0 && currentIndex < steps.length - 1
      ? steps[currentIndex + 1]
      : undefined;

  return {
    steps,
    currentStep,
    currentStepKey: getTimelineStepKey(currentStep),
    currentStepLabel: getLabelForTimelineStep(currentStep),
    timelineViewMode: state.timelineViewMode,
    isFocusMode: state.timelineViewMode === "focus",
    isFullTimelineMode: state.timelineViewMode === "full",
    canGoPrevious: Boolean(previousStep),
    canGoNext: Boolean(nextStep),
    setTimelineViewMode,
    setCurrentTimelineStep,
    goToPreviousStep: () => {
      if (previousStep) {
        setCurrentTimelineStep(previousStep);
      }
    },
    goToNextStep: () => {
      if (nextStep) {
        setCurrentTimelineStep(nextStep);
      }
    }
  };
}
