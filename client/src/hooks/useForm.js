import { useState } from 'react';

function issuesToErrors(issues) {
  const errors = {};
  for (const { path, message } of issues) {
    const key = Array.isArray(path) ? path.join('.') : path;
    errors[key] ??= message;
  }
  return errors;
}

/**
 * Minimal form state for the auth/settings forms. Validates with the same shared Zod schema
 * the server uses, and maps server-side field errors (`error.details`) back onto fields.
 * Errors without a matching field (or path '') become `formError`.
 *
 * @template T
 * @param {import('zod').ZodType<T>} schema
 * @param {Record<string, string>} initialValues
 */
export function useForm(schema, initialValues) {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);

  const applyErrors = (fieldErrors, form) => {
    const known = {};
    let fallback = null;
    for (const [key, message] of Object.entries(fieldErrors)) {
      if (key in initialValues) known[key] = message;
      else fallback ??= message;
    }
    setErrors(known);
    setFormError(fallback);
    // Move focus to the first invalid field so keyboard and screen-reader users land on it.
    requestAnimationFrame(() => form?.querySelector('[aria-invalid="true"]')?.focus());
  };

  /** Props for a TextField bound to `name`. */
  const field = (name) => ({
    name,
    value: values[name],
    error: errors[name],
    onChange: (event) => {
      const { value } = event.target;
      setValues((current) => ({ ...current, [name]: value }));
      setErrors((current) => ({ ...current, [name]: undefined }));
    },
  });

  /** @param {(data: T) => Promise<void> | void} onValid */
  const handleSubmit = (onValid) => async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    setFormError(null);

    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      applyErrors(issuesToErrors(parsed.error.issues), form);
      return;
    }
    try {
      await onValid(parsed.data);
    } catch (err) {
      if (err?.details?.length)
        applyErrors(
          issuesToErrors(err.details.map(({ path, issue }) => ({ path, message: issue }))),
          form,
        );
      else setFormError(err?.message ?? 'Something went wrong. Please try again.');
    }
  };

  const reset = (next = initialValues) => {
    setValues(next);
    setErrors({});
    setFormError(null);
  };

  return { values, errors, formError, field, handleSubmit, reset, setFormError };
}
