import { type ReactNode } from "react";

type PhaseSeparatorProps = {
  label: string;
  active?: boolean;
  compact?: boolean;
};

export function PhaseSeparator(props: PhaseSeparatorProps) {
  const { label, active = false, compact = false } = props;

  return (
    <div
      className={`phase-separator${active ? " is-active" : ""}${
        compact ? " is-compact" : ""
      }`}
    >
      <span className="phase-separator__line" aria-hidden="true" />
      <span className="phase-separator__label">{label}</span>
      <span className="phase-separator__line" aria-hidden="true" />
    </div>
  );
}

type TimelineSectionHeaderProps = {
  label: string;
  active?: boolean;
  compact?: boolean;
  aside?: ReactNode;
};

export function TimelineSectionHeader(props: TimelineSectionHeaderProps) {
  const { label, active = false, compact = false, aside } = props;

  return (
    <div
      className={`timeline-section-header${active ? " is-active" : ""}${
        compact ? " is-compact" : ""
      }`}
    >
      <PhaseSeparator label={label} active={active} compact={compact} />
      {aside ? <div className="timeline-section-header__aside">{aside}</div> : null}
    </div>
  );
}

type TimelineGroupProps = {
  label: string;
  active?: boolean;
  compactHeader?: boolean;
  children?: ReactNode;
  emptyState?: ReactNode;
  className?: string;
};

export function TimelineGroup(props: TimelineGroupProps) {
  const {
    label,
    active = false,
    compactHeader = false,
    children,
    emptyState,
    className
  } = props;

  return (
    <section
      className={`timeline-group${active ? " is-active" : ""}${
        className ? ` ${className}` : ""
      }`}
    >
      <TimelineSectionHeader label={label} active={active} compact={compactHeader} />
      <div className="timeline-group__body">{children ?? emptyState}</div>
    </section>
  );
}
