export type FontScheme = 'system' | 'modern' | 'classic';

export const fontSchemes = {
  system: {
    fontFamily: 'system-ui, sans-serif',
    sizes: {
      h1: '2rem',
      h2: '1.5rem',
      p: '1rem',
      small: '0.875rem',
    },
  },
  modern: {
    fontFamily: "'Inter', sans-serif",
    sizes: {
      h1: '2.25rem',
      h2: '1.75rem',
      p: '1rem',
      small: '0.875rem',
    },
  },
  classic: {
    fontFamily: "'Merriweather', serif",
    sizes: {
      h1: '2.5rem',
      h2: '2rem',
      p: '1.125rem',
      small: '1rem',
    },
  },
};
