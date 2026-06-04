import { createContext } from 'react';
import type { ColorScheme } from './colorSchemes';
import type { FontScheme } from './fontSchemes';

export type ThemeContextType = {
  colorScheme: ColorScheme;
  fontScheme: FontScheme;
  setColorScheme: (scheme: ColorScheme) => void;
  setFontScheme: (scheme: FontScheme) => void;
};

export const ThemeContext = createContext<ThemeContextType | null>(null);
