import { useEffect, useId, useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyButton({ value, label, className = "button button-secondary", disabled = false }: { value: string; label: string; className?: string; disabled?: boolean }) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");
  const fallbackId = useId();
  useEffect(() => {
    if (status !== "copied") return;
    const timer = setTimeout(() => setStatus("idle"), 2400);
    return () => clearTimeout(timer);
  }, [status]);
  useEffect(() => { setStatus("idle"); }, [value]);
  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(value);
      setStatus("copied");
    } catch {
      setStatus("error");
    }
  };
  return (
    <span className="copy-control">
      <button type="button" className={className} onClick={() => void copy()} disabled={disabled} aria-describedby={status === "error" ? fallbackId : undefined}>{status === "copied" ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}<span>{status === "copied" ? "Copied" : label}</span></button>
      <span className="sr-only" role="status">{status === "copied" ? `${label} copied to clipboard.` : ""}</span>
      {status === "error" && <span className="copy-fallback" id={fallbackId}><span role="alert">Clipboard unavailable. Select and copy below.</span><textarea readOnly value={value} rows={value.includes("\n") ? 5 : 2} aria-label={`Copy manually: ${label}`} onFocus={event => event.currentTarget.select()} /></span>}
    </span>
  );
}
