// journey.tsx — render a `::::journey` as a Step 1 → Step 2 → … vertical
// timeline, styled after GitHub's activity timeline: a thin muted rail with
// subtle grey-ringed bubbles, the accent used only as a whisper. Each step has a
// title (vertically centered on its bubble) and a RICH body — prose, one or more
// code blocks, and callouts — all sharing one left rail.
//
// Styling lives in index.css under the .jr-* classes (like the .cb-* code-block
// chrome) so it uses the DevHub/Delta CSS vars directly — full control over the
// muted look without fighting Tailwind token indirection.
//
// remark-journey emits <Journey> wrapping <JourneyStep step="…"> nodes whose
// children are the step's body content; steps are auto-numbered here by order.
import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";

interface JourneyStepProps {
  step?: string;
  /** Injected by <Journey>: the 1-based position in the timeline. */
  index?: number;
  /** Injected by <Journey>: true for the last step (rail stops at its bubble). */
  last?: boolean;
  children: ReactNode;
}

export function JourneyStep({ step, index = 1, last = false, children }: JourneyStepProps) {
  return (
    <li className="jr-step" data-last={last || undefined}>
      <span className="jr-bubble" aria-hidden="true">
        {index}
      </span>
      {step && <div className="jr-title">{step}</div>}
      <div className="jr-body">{children}</div>
    </li>
  );
}

export function Journey({ children }: { children: ReactNode }) {
  const steps = Children.toArray(children).filter(isValidElement) as ReactElement<JourneyStepProps>[];
  return (
    <ol className="jr">
      {steps.map((child, i) =>
        cloneElement(child, {
          index: i + 1,
          last: i === steps.length - 1,
          key: child.key ?? i,
        }),
      )}
    </ol>
  );
}
