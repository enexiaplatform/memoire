import type { CSSProperties, ElementType } from 'react';

type BrandWordmarkProps = {
  as?: ElementType;
  variant?: 'gradient' | 'navy' | 'white';
  className?: string;
};

export function BrandWordmark({
  as: Component = 'span',
  variant = 'gradient',
  className = '',
}: BrandWordmarkProps) {
  const variantClass = {
    gradient: 'brand-gradient-text',
    navy: 'text-navy',
    white: 'text-white',
  }[variant];
  const gradientStyle: CSSProperties | undefined = variant === 'gradient'
    ? {
        backgroundImage: 'linear-gradient(135deg, #43A047, #00ACC1, #1976D2, #3949AB, #7B1FA2, #C2185B, #FF5722)',
        backgroundClip: 'text',
        WebkitBackgroundClip: 'text',
        color: 'transparent',
        WebkitTextFillColor: 'transparent',
      }
    : undefined;

  return (
    <Component
      style={gradientStyle}
      className={`inline-block pr-[0.08em] font-display font-extrabold tracking-[-0.02em] ${variantClass} ${className}`}
    >
      Memoire
    </Component>
  );
}
