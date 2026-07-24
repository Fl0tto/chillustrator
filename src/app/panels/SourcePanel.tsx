/**
 * SourcePanel — read-only SVG source viewer (SRC-001).
 *
 * Serializes the live document and refreshes whenever the committed document
 * changes. Editable source is deferred (Phase 3 SRC-010). Copy button reuses the
 * export clipboard helper.
 */
import { useMemo, useState } from "react";
import { X, Copy, Check } from "lucide-react";
import { useEditorStore } from "@/store/editorStore";
import { usePreferences } from "@/store/selectors";
import { serializeSvg } from "@/importExport/serializeSvg";
import { copyText } from "@/importExport/download";

export function SourcePanel({ onClose }: { onClose: () => void }) {
  const doc = useEditorStore((s) => s.document);
  const prefs = usePreferences();
  const [copied, setCopied] = useState(false);

  const source = useMemo(
    () => serializeSvg(doc, { precision: prefs.exportPrecision, pretty: true }),
    [doc, prefs.exportPrecision],
  );

  const onCopy = async () => {
    const ok = await copyText(source);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    }
  };

  return (
    <div className="chill-source">
      <div className="chill-source-head">
        <span>SVG source</span>
        <span className="spacer" style={{ flex: 1 }} />
        <button className="btn" title="Copy source" onClick={onCopy}>
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
        <button className="btn" title="Close" onClick={onClose}>
          <X size={14} />
        </button>
      </div>
      <textarea className="chill-source-text" readOnly value={source} spellCheck={false} />
    </div>
  );
}
