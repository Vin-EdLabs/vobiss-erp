import React from 'react';
import { Check } from 'lucide-react';
import type { ProjectRequest } from '@/api/project';
import { cn } from '@/lib/utils';

const STEPS = [
  { key: 'project', label: 'Project Unit' },
  { key: 'ts', label: 'TS' },
  { key: 'ip', label: 'IP' },
  { key: 'noc', label: 'NOC' },
];

function activeStepKey(request: ProjectRequest): string {
  if (request.status === 'completed' || request.current_stage === 'done') return 'noc';
  if (request.status === 'integrated' || request.current_stage === 'project') return 'noc';
  if (request.current_stage === 'noc') return 'noc';
  if (request.current_stage === 'ip' || request.status === 'ongoing') return 'ip';
  return 'ts';
}

export function StageStepper({ request }: { request: ProjectRequest }) {
  const activeKey = activeStepKey(request);
  const activeIndex = STEPS.findIndex((step) => step.key === activeKey);
  const rejected = request.status === 'rejected';
  const completed = request.status === 'completed' || request.current_stage === 'done';

  return (
    <div className="w-full">
      <div className="flex items-start">
        {STEPS.map((step, i) => {
          const stepNum = i + 1;
          const done = i < activeIndex || completed;
          const current = i === activeIndex && !rejected && !completed;
          const isRejectedStep = rejected && i === 1;
          const connectorDone =
            i < STEPS.length - 1 &&
            (completed || i < activeIndex);

          return (
            <React.Fragment key={step.key}>
              <div className="flex min-w-0 flex-1 flex-col items-center">
                <div
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold sm:h-9 sm:w-9',
                    isRejectedStep && 'border-red-500 bg-red-50 text-red-700',
                    !isRejectedStep &&
                      done &&
                      'border-emerald-500 bg-emerald-500 text-white shadow-sm shadow-emerald-500/25',
                    !isRejectedStep &&
                      current &&
                      'border-blue-600 bg-blue-600 text-white ring-4 ring-blue-100 dark:ring-blue-500/20',
                    !isRejectedStep &&
                      !done &&
                      !current &&
                      'border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text-muted)]'
                  )}
                >
                  {done && !isRejectedStep ? (
                    <Check className="h-4 w-4" strokeWidth={2.5} />
                  ) : (
                    stepNum
                  )}
                </div>
                <span
                  className={cn(
                    'mt-2 px-0.5 text-center text-[10px] font-semibold leading-tight sm:text-xs',
                    current && 'text-blue-600 dark:text-blue-300',
                    done && !current && 'text-emerald-600 dark:text-emerald-300',
                    !done && !current && 'text-[var(--text-muted)]',
                    isRejectedStep && 'text-red-600'
                  )}
                >
                  {step.label}
                </span>
              </div>

              {i < STEPS.length - 1 && (
                <div className="mt-4 h-0.5 flex-1 min-w-[8px] max-w-[48px] sm:max-w-none" aria-hidden>
                  <div
                    className={cn(
                      'h-full w-full rounded-full',
                      connectorDone ? 'bg-emerald-400' : 'bg-[var(--border-strong)]'
                    )}
                  />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {rejected && (
        <p className="mt-3 text-center text-xs font-medium text-red-600 sm:text-sm">
          Rejected at TS — workflow stopped
        </p>
      )}
    </div>
  );
}
