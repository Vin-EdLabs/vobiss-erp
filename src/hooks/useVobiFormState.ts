import { useEffect, useMemo } from 'react';
import { vobiAmbientStore, type VobiFieldIssue } from '@/stores/vobiAmbientStore';

type RequiredField = {
  field: string;
  label?: string;
};

type UseVobiFormStateArgs = {
  formKey: string;
  requiredFields?: RequiredField[];
  currentValues?: Record<string, unknown>;
  fieldErrors?: VobiFieldIssue[];
  showIssues?: boolean;
  enabled?: boolean;
};

const isEmpty = (value: unknown) => {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'string') return value.trim() === '';
  return false;
};

export function evaluateFormCompleteness(
  requiredFields: RequiredField[] = [],
  currentValues: Record<string, unknown> = {},
  fieldErrors: VobiFieldIssue[] = []
) {
  const missingFields = requiredFields
    .filter((field) => isEmpty(currentValues[field.field]))
    .map((field) => field.label || field.field);

  return {
    missingFields,
    invalidFields: fieldErrors,
    complete: missingFields.length === 0 && fieldErrors.length === 0,
  };
}

export function useVobiFormState({
  formKey,
  requiredFields = [],
  currentValues = {},
  fieldErrors = [],
  showIssues = false,
  enabled = true,
}: UseVobiFormStateArgs) {
  const completeness = useMemo(
    () => evaluateFormCompleteness(requiredFields, currentValues, fieldErrors),
    [requiredFields, currentValues, fieldErrors]
  );

  useEffect(() => {
    if (!enabled) return;
    vobiAmbientStore.getState().setFormState(
      {
        formKey,
        missingFields: completeness.missingFields,
        invalidFields: completeness.invalidFields,
      },
      { showIssues }
    );
  }, [completeness.invalidFields, completeness.missingFields, enabled, formKey, showIssues]);

  useEffect(() => () => vobiAmbientStore.getState().setFormState(null), []);

  return completeness;
}
