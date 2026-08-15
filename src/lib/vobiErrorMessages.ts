export type VobiFieldError = {
  field: string;
  message: string;
};

export type VobiErrorContext = {
  errorCode: string;
  fieldErrors?: VobiFieldError[];
  pageContext: string;
  rawMessage?: string;
};

export type VobiErrorMessage = {
  title: string;
  body: string;
  steps: string[];
  action?: string;
};

const fieldMessages: Record<string, string> = {
  amount: 'Enter numbers only (e.g. 250). No letters or symbols.',
  purpose: 'This field is required. Describe what the cash is for.',
  description: 'Add more detail. Vague descriptions get rejected.',
  quantity: 'Enter a whole number. No decimals.',
  assignee_id: 'Select a staff member from the dropdown.',
  target_date: 'Select a date that is today or in the future.',
  date_needed: 'Select a date that is today or in the future.',
  title: 'Add a clear title so the team understands the request quickly.',
  subject: 'Use a clear subject that says what the issue is.',
  item_id: 'Select an item from the list before submitting.',
  approver_ids: 'Select at least one valid approver who is not yourself.',
};

const errorMessages: Record<string, VobiErrorMessage> = {
  VALIDATION_FAILED: {
    title: 'A few things need fixing',
    body: 'Some required details are missing or not in the right format.',
    steps: ['Check the highlighted fields.', 'Use numbers only where amounts or quantities are requested.', 'Submit again after the missing details are added.'],
    action: 'Got it - fix the form',
  },
  NETWORK_ERROR: {
    title: 'Connection issue',
    body: 'Vobi could not reach the server. Your internet or the office network may be unstable.',
    steps: ['Check your internet connection.', 'Wait a few seconds.', 'Try the action again.'],
    action: 'Got it - try again',
  },
  UNAUTHORIZED: {
    title: 'Session expired',
    body: 'Your login session is no longer active.',
    steps: ['Refresh the page.', 'Log in again if asked.', 'Repeat the action after your session is restored.'],
    action: 'Got it',
  },
  FORBIDDEN: {
    title: 'Permission blocked',
    body: "You don't have permission for this action.",
    steps: ['Confirm you are using the right account.', 'Ask your manager or System Admin to grant access.', 'Try again after your access is updated.'],
    action: 'Got it',
  },
  SERVER_ERROR: {
    title: 'Server problem',
    body: 'Something went wrong on our end.',
    steps: ['Wait a moment.', 'Try the action again.', 'If it keeps happening, send the error message to support.'],
    action: 'Got it',
  },
  NOT_FOUND: {
    title: 'Record not found',
    body: 'This record no longer exists or may have been deleted.',
    steps: ['Go back to the list page.', 'Refresh the records.', 'Open the latest version of the item.'],
    action: 'Got it',
  },
};

const pageOverrides: Record<string, Partial<Record<string, VobiErrorMessage>>> = {
  'cash-request-form': {
    VALIDATION_FAILED: {
      title: 'Cash request needs attention',
      body: 'The cash request cannot be submitted until the amount, purpose, date, and approver details are correct.',
      steps: ['Enter valid item amounts and quantities.', 'Describe the purpose clearly.', 'Choose a date that is today or later.', 'Select valid finance approvers.'],
      action: 'Got it - fix the form',
    },
  },
  'material-request': {
    VALIDATION_FAILED: {
      title: 'Material request needs attention',
      body: 'The material request needs complete item, quantity, project, and approver details.',
      steps: ['Select each item from the inventory list.', 'Use whole numbers for quantities.', 'Add the project or job reason.', 'Choose valid approvers who are not you.'],
      action: 'Got it - fix the form',
    },
  },
};

const normalizeCode = (value?: string) => String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
const normalizeField = (value?: string) => String(value || '').trim().toLowerCase();

export function getFieldErrorMessage(field: string, fallback?: string): string {
  return fieldMessages[normalizeField(field)] || fallback || 'Check this field and enter the correct value.';
}

export function getVobiErrorMessage(ctx: VobiErrorContext | null): VobiErrorMessage {
  if (!ctx) return errorMessages.SERVER_ERROR;

  const code = normalizeCode(ctx.errorCode || 'SERVER_ERROR');
  const pageMessage = pageOverrides[ctx.pageContext]?.[code];
  const base = pageMessage || errorMessages[code] || errorMessages.SERVER_ERROR;

  if (!ctx.fieldErrors?.length) {
    const raw = (ctx.rawMessage || '').toLowerCase();
    const inferredSteps = raw.includes('missing required fields')
      ? [
          'Read the missing field names in the message above.',
          'Fill each missing field in the open form.',
          'Check any item rows and approver selections before submitting again.',
        ]
      : base.steps;

    return {
      ...base,
      body: ctx.rawMessage || base.body,
      steps: inferredSteps,
    };
  }

  const fieldSteps = ctx.fieldErrors
    .slice(0, 5)
    .map((error) => getFieldErrorMessage(error.field, error.message));

  return {
    ...base,
    title: `${ctx.fieldErrors.length} form item${ctx.fieldErrors.length === 1 ? '' : 's'} need fixing`,
    steps: fieldSteps,
  };
}

export function statusToVobiErrorCode(status?: number): string {
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status && status >= 500) return 'SERVER_ERROR';
  if (status && status >= 400) return 'VALIDATION_FAILED';
  return 'NETWORK_ERROR';
}
