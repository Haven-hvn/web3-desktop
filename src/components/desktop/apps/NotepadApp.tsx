import { useEffect, useState } from "react";

const STORAGE_KEY = "haven-os:notepad:v1";

export default function NotepadApp() {
  const [text, setText] = useState(() => {
    try {
      return (
        localStorage.getItem(STORAGE_KEY) ??
        "Haven OS 98 Scratchpad\n\nPaste Arkiv entity keys, Filecoin CIDs, or token gate addresses here.\nSaved automatically to localStorage."
      );
    } catch {
      return "";
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, text);
    } catch {
      // ignore
    }
  }, [text]);

  return (
    <div className="app-shell">
      <textarea
        className="w98-field mono"
        style={{ flex: 1, resize: "none", border: "none", padding: 8, outline: "none" }}
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-label="Notepad text"
      />
      <div className="app-statusbar">
        <span>Saved locally</span>
        <span className="mono">{text.length} chars</span>
      </div>
    </div>
  );
}
