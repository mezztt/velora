import { useEffect, useRef, useState } from "react";

// Fecha con formato dd/mm/aaaa (el input type="date" nativo muestra mm/dd/yyyy según el idioma del navegador).
// value / onChange trabajan con "YYYY-MM-DD" (o "" si está vacío), igual que el input nativo.

function toText(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

function toIso(text: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (!m) return null;
  const d = Number(m[1]), mo = Number(m[2]), y = Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function mask(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

interface Props {
  value: string;
  onChange: (e: { target: { value: string } }) => void;
  min?: string;
  max?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}

export default function DateField({ value, onChange, min, max, disabled, className, ...rest }: Props) {
  const [text, setText] = useState(toText(value));
  const native = useRef<HTMLInputElement | null>(null);

  useEffect(() => { setText(toText(value)); }, [value]);

  function typed(raw: string) {
    const t = mask(raw);
    setText(t);
    if (t === "") { onChange({ target: { value: "" } }); return; }
    const iso = toIso(t);
    if (iso && (!min || iso >= min) && (!max || iso <= max)) onChange({ target: { value: iso } });
  }

  return (
    <span className={`vl-date ${className || ""}`}>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="dd/mm/aaaa"
        maxLength={10}
        value={text}
        disabled={disabled}
        aria-label={rest["aria-label"]}
        onChange={(e) => typed(e.target.value)}
        onBlur={() => setText(toText(value))}
      />
      <button
        type="button"
        className="vl-date-btn"
        disabled={disabled}
        aria-label="Elegir fecha en el calendario"
        onClick={() => { try { native.current?.showPicker(); } catch { native.current?.focus(); } }}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
      </button>
      <input
        ref={native}
        className="vl-date-native"
        type="date"
        lang="es-AR"
        tabIndex={-1}
        aria-hidden="true"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange({ target: { value: e.target.value } })}
      />
    </span>
  );
}
