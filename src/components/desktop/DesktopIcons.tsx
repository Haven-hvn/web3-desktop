import { memo, type PointerEvent as ReactPointerEvent } from "react";
import type { AppDefinition } from "../../config/apps";

interface DesktopIconsProps {
  apps: AppDefinition[];
  columns: number;
  selection: Set<string>;
  onToggleSelect: (id: string, additive: boolean) => void;
  onOpen: (app: AppDefinition) => void;
}

export const DesktopIcons = memo(function DesktopIcons({
  apps,
  columns,
  selection,
  onToggleSelect,
  onOpen,
}: DesktopIconsProps) {
  const cellW = 86;
  const cellH = 84;

  const handlePointerDown = (e: ReactPointerEvent<HTMLButtonElement>, app: AppDefinition) => {
    e.stopPropagation();
    onToggleSelect(app.id, e.ctrlKey || e.metaKey);
  };

  return (
    <>
      {apps.map((app, index) => {
        const col = Math.floor(index / columns);
        const row = index % columns;
        return (
          <button
            key={app.id}
            id={`icon-${app.id}`}
            data-icon-id={app.id}
            type="button"
            className="w98-desktop-icon"
            data-selected={selection.has(app.id)}
            style={{
              position: "absolute",
              left: 6 + col * cellW,
              top: 6 + row * cellH,
              zIndex: 1,
            }}
            onPointerDown={(e) => handlePointerDown(e, app)}
            onDoubleClick={() => onOpen(app)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onOpen(app);
            }}
            title={app.description}
            aria-label={app.name}
          >
            {app.isExe && <span className="exe-label">L7</span>}
            <span className="icon-img" role="img" aria-hidden="true">
              {app.glyph}
            </span>
            <span className="icon-label">{app.name}</span>
          </button>
        );
      })}
    </>
  );
});
