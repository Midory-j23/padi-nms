import type { ReactNode } from "react";

/** An empty page that explains why it is empty and what to do about it. */
export default function EmptyGuide({ title, intro, steps, footer, action }: { title: string; intro: string; steps: string[]; footer?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl space-y-3 p-6 text-sm">
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="text-dim">{intro}</p>
      <ol className="list-decimal space-y-1.5 ps-5">
        {steps.map((s) => <li key={s}>{s}</li>)}
      </ol>
      {action && <div>{action}</div>}
      {footer && <p className="text-xs text-dim"><bdi dir="ltr">{footer}</bdi></p>}
    </div>
  );
}
