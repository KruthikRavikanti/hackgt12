"use client";

import { Check, Copy, Download } from "lucide-react";
import { useState } from "react";
import { twMerge } from "tailwind-merge";

interface Props {
  language: string;
  value: string;
  showHeader?: boolean;
  className?: string;
  onChange?: (newValue: string) => void;
}

const CodeBlock = ({
  language,
  value,
  showHeader = true,
  className = "",
  onChange,
}: Props) => {
  const [editableValue, setEditableValue] = useState(value); // Local state for editing

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setEditableValue(newValue);
    if (onChange) onChange(newValue); // Notify parent of changes
  };

  const onCopy = () => {
    navigator.clipboard.writeText(editableValue);
  };

  return (
    <div className={twMerge("codeblock relative w-full font-sans rounded-lg", className)}>
      {showHeader && (
        <div className="flex items-center justify-between rounded-t-lg bg-zinc-700 px-4 py-1">
          <span className="text-xs lowercase text-white">{language}</span>
          <div className="flex items-center gap-2">
            <button
              aria-label="Copy code"
              className="flex items-center gap-1.5 rounded bg-none p-1 text-xs text-white"
              onClick={onCopy}
            >
              <Copy className="w-4 h-4" aria-hidden="true" />
              Copy code
            </button>
          </div>
        </div>
      )}

      <textarea
        value={editableValue}
        onChange={handleInputChange}
        className="w-full bg-black text-white p-4 resize-none focus:outline-none font-mono text-sm rounded-b-lg"
        style={{
          minHeight: "630px",
          width: "100vw",
          maxWidth: "42vw",
          borderBottomLeftRadius: "0.5rem", // Ensures bottom-left corner rounding
        }}
        spellCheck={false}
      />
    </div>
  );
};

export { CodeBlock };
