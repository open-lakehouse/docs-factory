// A `::::journey` step timeline. The vendored remark-journey emits <JourneyStep>
// children as the step's heading (class jr-title) then its <div class="jr-body">.
import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";

interface JourneyStepProps {
  /** Injected by <Journey>: true for the last step (drops its bottom padding). */
  last?: boolean;
  children: ReactNode;
}

// The bubble's number is a CSS counter, so no step digits land in the HTML text.
export function JourneyStep({ last = false, children }: JourneyStepProps) {
  return (
    <li className="jr-step" data-last={last || undefined}>
      <span className="jr-bubble" aria-hidden="true" />
      {children}
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
          last: i === steps.length - 1,
          key: child.key ?? i,
        }),
      )}
    </ol>
  );
}
