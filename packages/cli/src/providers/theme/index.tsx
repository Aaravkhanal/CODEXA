import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createContext, useContext, useState, useCallback } from "react";
import type { ReactNode } from "react";
import { type ThemeColors, type Theme, THEMES, DEFAULT_THEME } from "../../theme"; 
import { getCodexaDir } from "../../lib/global-config";

function preferencesPath(): string {
    return join(getCodexaDir(), "preferences.json");
}

type ThemePreferences = {
    themeName: string;
}

function getInitialTheme(): Theme {
    try {
       const preferences = JSON.parse(
        readFileSync(preferencesPath(), "utf-8"),
       ) as Partial<ThemePreferences>;
       const savedTheme = THEMES.find((theme) => theme.name === preferences.themeName);
       return savedTheme ?? DEFAULT_THEME;
    } catch {
       return DEFAULT_THEME;
    }
};

function persistTheme(theme: Theme) {
    try {
        mkdirSync(getCodexaDir(), { recursive: true, mode: 0o700 });
        writeFileSync(
            preferencesPath(),
            JSON.stringify({ themeName: theme.name } satisfies ThemePreferences, null, 2),
            "utf8",
        );
    } catch {
        // Ignore preference write failures so theme switching still works for this session.
    }
};

type ThemeContextValue = {
    colors: ThemeColors;
    currentTheme: Theme;
    setTheme: (theme: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
    const value = useContext(ThemeContext);
    if (!value) {
        throw new Error("useTheme must be used within a ThemeProvider");
    }
    return value;
}

type ThemeProviderProps = {
    children: ReactNode;
};

export function ThemeProvider({ children }: ThemeProviderProps) {
    const [currentTheme, setCurrentTheme] = useState<Theme>(getInitialTheme);

    const setTheme = useCallback((theme: Theme) => {
        setCurrentTheme(theme);
        persistTheme(theme);
    }, []);

    return (
        <ThemeContext.Provider value={{ colors: currentTheme.colors, currentTheme, setTheme }}>
            {children}
        </ThemeContext.Provider>
    );
};
