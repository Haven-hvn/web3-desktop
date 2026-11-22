import { useEffect, useRef, useState } from "react";
import { START_MENU_CATEGORIES, type AppCategory } from "../../../config/apps";
import { useDesktop } from "../../../context/DesktopContext";
import { useHavenKernel } from "../../../context/HavenKernelContext";
import { shortAddress } from "../../../kernel/protocol";

interface StartMenuProps {
  onClose: () => void;
}

function categoryGlyph(category: AppCategory): string {
  switch (category) {
    case "Haven Core":
      return "🪐";
    case "Social & Boards":
      return "🍀";
    case "Media & Gaming":
      return "🎵";
    case "Observatory & Tools":
      return "⚙️";
    case "Awesome Haven":
      return "📦";
    default:
      return "📁";
  }
}

export function StartMenu({ onClose }: StartMenuProps) {
  const { apps, windowManager, isInstalled } = useDesktop();
  const { wallet } = useHavenKernel();
  const [openCategory, setOpenCategory] = useState<AppCategory | null>("Haven Core");
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [onClose]);

  const categoryApps = (cat: AppCategory) => apps.filter((a) => a.category === cat);

  return (
    <div ref={menuRef} className="w98-menu start-menu" role="menu" aria-label="Start Menu">
      <div className="start-menu-sidebar" aria-hidden="true">
        <div className="sideways-text">
          <strong>Haven OS 98</strong>
          <small>L7 Web3 Edition</small>
        </div>
      </div>

      <div className="start-menu-content">
        <div>
          {START_MENU_CATEGORIES.map((category) => {
            const catApps = categoryApps(category);
            const isOpen = openCategory === category;
            return (
              <div key={category} className="start-menu-category">
                <button
                  type="button"
                  className="w98-menu-item"
                  role="menuitem"
                  aria-expanded={isOpen}
                  onClick={() => setOpenCategory(isOpen ? null : category)}
                >
                  <span className="menu-glyph" aria-hidden="true">
                    {categoryGlyph(category)}
                  </span>
                  <span>{category}</span>
                  <span className="submenu-arrow" aria-hidden="true">
                    ▶
                  </span>
                </button>
                {isOpen && (
                  <div className="start-submenu w98-menu" role="menu">
                    {catApps.map((app) => (
                      <button
                        key={app.id}
                        type="button"
                        className="w98-menu-item"
                        role="menuitem"
                        onClick={() => {
                          windowManager.openApp(app.id);
                          onClose();
                        }}
                      >
                        <span className="menu-glyph" aria-hidden="true">
                          {app.glyph}
                        </span>
                        <span>{app.name}</span>
                        {!isInstalled(app.id) && (
                          <span style={{ marginLeft: "auto", fontSize: 10, opacity: 0.65 }}>
                            install
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="w98-menu-separator" style={{ marginTop: "auto" }} />

        <button
          type="button"
          className="w98-menu-item"
          onClick={() => {
            windowManager.openSideBySide("fairhaven", "redhaven");
            onClose();
          }}
        >
          <span className="menu-glyph">🪟</span>
          <span>Tile Fairhaven + Redhaven (Side-by-Side)</span>
        </button>

        <button
          type="button"
          className="w98-menu-item"
          onClick={() => {
            windowManager.openApp("settings");
            onClose();
          }}
        >
          <span className="menu-glyph">⚙️</span>
          <span>Control Panel / Settings</span>
        </button>

        <button
          type="button"
          className="w98-menu-item"
          onClick={() => {
            windowManager.openApp("wallet");
            onClose();
          }}
        >
          <span className="menu-glyph">🔑</span>
          <span>
            Wallet ({wallet.address ? shortAddress(wallet.address) : "Sign In / Guest"})
          </span>
        </button>

        <button
          type="button"
          className="w98-menu-item"
          onClick={() => {
            windowManager.openApp("about");
            onClose();
          }}
        >
          <span className="menu-glyph">🏛️</span>
          <span>About Haven OS 98</span>
        </button>

        <button
          type="button"
          className="w98-menu-item"
          onClick={() => {
            windowManager.openApp("shutdown", { centered: true });
            onClose();
          }}
        >
          <span className="menu-glyph" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            <svg
              width="13"
              height="13"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <line x1="8" y1="2" x2="8" y2="8" />
              <path d="M4.2 4.6a5.2 5.2 0 1 0 7.6 0" />
            </svg>
          </span>
          <span>Shut Down…</span>
        </button>
      </div>
    </div>
  );
}
