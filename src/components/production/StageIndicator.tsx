import React from 'react';
import { Check } from 'lucide-react';
import type { ProjectRequest } from '@/api/project';
import { cn } from '@/lib/utils';

/**
 * The 360° Service Request Flow, exactly as specified: Sales → Design → Project → TX → IP →
 * NOC. NOC is the last step — once NOC adds the circuit to monitoring and Project does final sign-off
 * (current_stage flips to 'done'), every step here shows complete with NOC as the final one;
 * there's no separate "Active" bubble after it. Transport and IP Circuit allocation are linked
 * workflows (see LinkedReferencesSection on the profile page), not steps here — they can happen
 * more than once or run in parallel, so they don't fit a single linear position. Display labels
 * only; `current_stage`'s stored values (ts/ip/noc/done) are unchanged.
 */
const STAGES = [
  { key: 'sales', label: 'Sales' },
  { key: 'design', label: 'Design' },
  { key: 'project', label: 'Project' },
  { key: 'ts', label: 'TX' },
  { key: 'ip', label: 'IP' },
  { key: 'noc', label: 'NOC' },
];

function activeStepKey(request: ProjectRequest): string {
  if (request.status === 'completed' || request.current_stage === 'done') return 'noc';
  // NOC has already added the circuit to monitoring — current_stage flips back to 'project' so
  // Project can act on the Sign-Off Form, but that must never look like the flow restarted at
  // step 3. Every stage already happened, so treat this exactly like the completed case visually.
  if (request.status === 'noc_approved') return 'noc';
  const known = STAGES.find((s) => s.key === request.current_stage);
  return known ? known.key : 'project';
}

export function StageIndicator({ request }: { request: ProjectRequest }) {
  const activeKey = activeStepKey(request);
  const activeIndex = STAGES.findIndex((step) => step.key === activeKey);
  const rejected = request.status === 'rejected' || request.current_stage === 'rejected';
  const completed = request.status === 'completed' || request.current_stage === 'done';
  const awaitingSignOff = request.status === 'noc_approved' && !completed;

  return (
    <div className="w-full">
      <div className="flex items-start overflow-x-auto pb-1">
        {STAGES.map((step, i) => {
          const stepNum = i + 1;
          const done = i < activeIndex || completed || awaitingSignOff;
          const current = i === activeIndex && !rejected && !completed && !awaitingSignOff;

          return (
            <React.Fragment key={step.key}>
              <div className="flex min-w-[3.5rem] flex-1 flex-col items-center">
                <div
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold sm:h-9 sm:w-9',
                    done && 'border-emerald-500 bg-emerald-500 text-white shadow-sm shadow-emerald-500/25',
                    current && 'border-blue-600 bg-blue-600 text-white ring-4 ring-blue-100 dark:ring-blue-500/20',
                    !done && !current && 'border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text-muted)]'
                  )}
                >
                  {done ? <Check className="h-4 w-4" strokeWidth={2.5} /> : stepNum}
                </div>
                <span
                  className={cn(
                    'mt-2 px-0.5 text-center text-[10px] font-semibold leading-tight sm:text-xs',
                    current && 'text-blue-600 dark:text-blue-300',
                    done && !current && 'text-emerald-600 dark:text-emerald-300',
                    !done && !current && 'text-[var(--text-muted)]'
                  )}
                >
                  {step.label}
                </span>
              </div>

              {i < STAGES.length - 1 && (
                <div className="mt-4 h-0.5 flex-1 min-w-[8px] max-w-[32px] sm:max-w-none" aria-hidden>
                  <div className={cn('h-full w-full rounded-full', i < activeIndex || completed || awaitingSignOff ? 'bg-emerald-400' : 'bg-[var(--border-strong)]')} />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {completed && (
        <p className="mt-3 text-center text-xs font-medium text-emerald-600 sm:text-sm">
          Complete — NOC confirmed monitoring and Project signed off
        </p>
      )}
      {awaitingSignOff && (
        <p className="mt-3 text-center text-xs font-medium text-amber-600 sm:text-sm">
          Every stage is done — awaiting the Sign-Off Form on the Project Unit dashboard
        </p>
      )}
      {rejected && (
        <p className="mt-3 text-center text-xs font-medium text-red-600 sm:text-sm">
          Rejected — workflow stopped at {STAGES.find((s) => s.key === request.current_stage)?.label || 'this stage'}
        </p>
      )}
    </div>
  );
}
