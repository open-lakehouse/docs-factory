// Renders a `::::journey` as a vertical step timeline. Styling lives in
// index.css under the .jr-* classes (like the .cb-* code-block chrome).
//
// remark-journey emits <Journey> wrapping <JourneyStep step="…"> nodes whose
// children are the step's body content; steps are auto-numbered here by order.
import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";

interface JourneyStepProps {
  step?: string;
  /** Injected by <Journey>: the 1-based position in the timeline. */
  index?: number;
  /** Injected by <Journey>: true for the last step (drops its bottom padding). */
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
  const steps = Children.toArray(children).filter(
    isValidElement,
  ) as ReactElement<JourneyStepProps>[];
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
