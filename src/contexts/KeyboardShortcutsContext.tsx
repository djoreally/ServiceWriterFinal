/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarPlus, LayoutDashboard, Search } from "lucide-react";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from "@/components/ui/command";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";

type Shortcut = { id: string; keys: string; description: string; run: () => void };
type ShortcutContext = { registerShortcut: (shortcut: Shortcut) => () => void; openPalette: () => void };

const Context = createContext<ShortcutContext | null>(null);

const isEditableTarget = (target: EventTarget | null) => {
  const el = target as HTMLElement | null;
  return typeof el?.closest === "function" && !!el.closest('input, textarea, select, [contenteditable="true"]');
};

export const KeyboardShortcutsProvider = ({ children }: { children: React.ReactNode }) => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [shortcuts, setShortcuts] = useState<Shortcut[]>([]);

  const registerShortcut = useCallback((shortcut: Shortcut) => {
    setShortcuts((current) => [...current.filter((item) => item.id !== shortcut.id), shortcut]);
    return () => setShortcuts((current) => current.filter((item) => item.id !== shortcut.id));
  }, []);

  const defaults = useMemo<Shortcut[]>(() => [
    { id: "dashboard", keys: "⌘D", description: "Open dashboard", run: () => navigate("/dashboard") },
    { id: "new-appointment", keys: "⌘N", description: "Create new appointment", run: () => navigate("/appointments?new=1") },
    { id: "search", keys: "⌘K", description: "Open command palette", run: () => setOpen(true) },
  ], [navigate]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (!mod || isEditableTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (key === "k") { event.preventDefault(); setOpen((value) => !value); }
      if (key === "n") { event.preventDefault(); navigate("/appointments?new=1"); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate]);

  const allShortcuts = [...defaults, ...shortcuts];

  return (
    <Context.Provider value={{ registerShortcut, openPalette: () => setOpen(true) }}>
      {children}
      <CommandDialog open={open} onOpenChange={setOpen}>
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <DialogDescription className="sr-only">Search commands, pages, and quick actions.</DialogDescription>
        <CommandInput placeholder="Search commands, pages, and quick actions..." />
        <CommandList>
          <CommandEmpty>No command found.</CommandEmpty>
          <CommandGroup heading="Quick actions">
            {allShortcuts.map((shortcut) => (
              <CommandItem key={shortcut.id} onSelect={() => { shortcut.run(); setOpen(false); }}>
                {shortcut.id === "new-appointment" ? <CalendarPlus className="mr-2 h-4 w-4" /> : shortcut.id === "dashboard" ? <LayoutDashboard className="mr-2 h-4 w-4" /> : <Search className="mr-2 h-4 w-4" />}
                {shortcut.description}
                <CommandShortcut>{shortcut.keys}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </Context.Provider>
  );
};

export const useKeyboardShortcuts = () => {
  const context = useContext(Context);
  if (!context) throw new Error("useKeyboardShortcuts must be used within KeyboardShortcutsProvider");
  return context;
};

