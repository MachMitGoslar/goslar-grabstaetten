import React, { useEffect, useState } from 'react';
import { ThemeContext } from './ThemeContext';
import { colorSchemes, type ColorScheme } from './colorSchemes.ts';
import { fontSchemes, type FontScheme } from './fontSchemes.ts';

type Props = {
  children: React.ReactNode;
};

export const ThemeProvider = ({ children }: Props) => {
  const [colorScheme, setColorScheme] = useState<ColorScheme>('light');
  const [fontScheme, setFontScheme] = useState<FontScheme>('system');

  // Sync CSS variables
  useEffect(() => {
    const colors = colorSchemes[colorScheme];
    const fonts = fontSchemes[fontScheme];

    const root = document.documentElement;

    (Object.entries(colors) as [keyof typeof colors, string][]).forEach(([key, value]) => {
      root.style.setProperty(`--color-${key}`, value);
    });

    // Set CSS variables
    root.style.setProperty('--font-family', fonts.fontFamily);
    Object.entries(fonts.sizes).forEach(([key, value]) => {
      root.style.setProperty(`--font-${key}`, value);
    });
  }, [colorScheme, fontScheme]);

  return (
    <ThemeContext.Provider value={{ colorScheme, fontScheme, setColorScheme, setFontScheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
