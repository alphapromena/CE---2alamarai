import * as React from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

export type I18nValue = { ar?: string; en?: string };

export interface I18nFieldProps {
  /** Field id prefix; ar/en inputs become `${id}-ar` and `${id}-en`. */
  id: string;
  value?: I18nValue;
  onChange?: (next: I18nValue) => void;
  invalid?: { ar?: boolean; en?: boolean };
  multiline?: boolean;
  required?: boolean;
  /** Translated language labels: { ar: 'العربية', en: 'English' }. */
  labels: { ar: string; en: string };
  /** Optional placeholders per language. */
  placeholder?: { ar?: string; en?: string };
  disabled?: boolean;
}

/**
 * I18nField — paired AR + EN inputs that read/write a single JSONB-shaped value
 * { ar: string, en: string } matching the DB schema (D-005).
 *
 * Both inputs are independently labelled; the AR input forces dir="rtl" so
 * Arabic input is correct regardless of the page locale. The EN input forces
 * dir="ltr" for the symmetric case.
 *
 * The component is a controlled wrapper. It does not validate "both required";
 * leave that to the zod schema and surface errors via `invalid`.
 */
export function I18nField({
  id,
  value,
  onChange,
  invalid,
  multiline = false,
  required,
  labels,
  placeholder,
  disabled,
}: I18nFieldProps) {
  function update(lang: 'ar' | 'en', next: string) {
    onChange?.({ ...(value ?? {}), [lang]: next });
  }

  const FieldComp = multiline ? Textarea : Input;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {(['en', 'ar'] as const).map((lang) => {
        const inputId = `${id}-${lang}`;
        return (
          <div key={lang}>
            <label
              htmlFor={inputId}
              className={cn('mb-1.5 block text-xs font-medium text-fg-secondary')}
            >
              {labels[lang]}
              {required ? (
                <span className="ms-0.5 text-danger" aria-hidden>
                  *
                </span>
              ) : null}
            </label>
            <FieldComp
              id={inputId}
              dir={lang === 'ar' ? 'rtl' : 'ltr'}
              lang={lang}
              value={value?.[lang] ?? ''}
              onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                update(lang, e.target.value)
              }
              invalid={invalid?.[lang]}
              placeholder={placeholder?.[lang]}
              disabled={disabled}
              aria-required={required}
            />
          </div>
        );
      })}
    </div>
  );
}
