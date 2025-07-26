# Design System Guide

This document provides comprehensive guidelines for maintaining consistent design across the application.

## Table of Contents
- [Colors](#colors)
- [Typography](#typography)
- [Spacing](#spacing)
- [Border Radius](#border-radius)
- [Animations](#animations)
- [Gradients](#gradients)
- [Component Guidelines](#component-guidelines)
- [Accessibility](#accessibility)

## Colors

All colors are defined using HSL values for better control over hue, saturation, and lightness.

### Light Mode Palette

| Color | HSL Value | Usage |
|-------|-----------|-------|
| `--background` | `hsl(0 0% 100%)` | Main background color |
| `--foreground` | `hsl(226 33% 8%)` | Primary text color |
| `--primary` | `hsl(220 91% 58%)` | Primary brand color |
| `--primary-foreground` | `hsl(0 0% 100%)` | Text on primary background |
| `--secondary` | `hsl(220 14% 96%)` | Secondary background |
| `--secondary-foreground` | `hsl(220 9% 25%)` | Text on secondary background |
| `--muted` | `hsl(220 14% 96%)` | Muted background |
| `--muted-foreground` | `hsl(220 9% 46%)` | Muted text |
| `--accent` | `hsl(220 14% 96%)` | Accent background |
| `--accent-foreground` | `hsl(220 9% 25%)` | Text on accent background |
| `--destructive` | `hsl(0 84% 60%)` | Error/danger color |
| `--destructive-foreground` | `hsl(0 0% 100%)` | Text on destructive background |
| `--border` | `hsl(220 13% 91%)` | Border color |
| `--input` | `hsl(220 13% 91%)` | Input background |
| `--ring` | `hsl(220 91% 58%)` | Focus ring color |
| `--card` | `hsl(0 0% 100%)` | Card background |
| `--card-foreground` | `hsl(226 33% 8%)` | Card text |
| `--popover` | `hsl(0 0% 100%)` | Popover background |
| `--popover-foreground` | `hsl(226 33% 8%)` | Popover text |

### Dark Mode Palette

| Color | HSL Value | Usage |
|-------|-----------|-------|
| `--background` | `hsl(224 36% 4%)` | Main background color |
| `--foreground` | `hsl(213 31% 91%)` | Primary text color |
| `--primary` | `hsl(220 91% 65%)` | Primary brand color |
| `--primary-foreground` | `hsl(224 36% 4%)` | Text on primary background |
| `--secondary` | `hsl(220 17% 11%)` | Secondary background |
| `--secondary-foreground` | `hsl(213 31% 91%)` | Text on secondary background |
| `--muted` | `hsl(220 17% 11%)` | Muted background |
| `--muted-foreground` | `hsl(215 20% 65%)` | Muted text |
| `--accent` | `hsl(220 17% 14%)` | Accent background |
| `--accent-foreground` | `hsl(213 31% 91%)` | Text on accent background |
| `--destructive` | `hsl(0 63% 51%)` | Error/danger color |
| `--destructive-foreground` | `hsl(213 31% 91%)` | Text on destructive background |
| `--border` | `hsl(220 17% 14%)` | Border color |
| `--input` | `hsl(220 17% 14%)` | Input background |
| `--ring` | `hsl(220 91% 65%)` | Focus ring color |
| `--card` | `hsl(224 36% 6%)` | Card background |
| `--card-foreground` | `hsl(213 31% 91%)` | Card text |
| `--popover` | `hsl(224 36% 6%)` | Popover background |
| `--popover-foreground` | `hsl(213 31% 91%)` | Popover text |

### Sidebar Colors

#### Light Mode
- `--sidebar-background`: `hsl(0 0% 98%)`
- `--sidebar-foreground`: `hsl(240 5.3% 26.1%)`
- `--sidebar-primary`: `hsl(240 5.9% 10%)`
- `--sidebar-primary-foreground`: `hsl(0 0% 98%)`
- `--sidebar-accent`: `hsl(240 4.8% 95.9%)`
- `--sidebar-accent-foreground`: `hsl(240 5.9% 10%)`
- `--sidebar-border`: `hsl(220 13% 91%)`
- `--sidebar-ring`: `hsl(217.2 91.2% 59.8%)`

#### Dark Mode
- `--sidebar-background`: `hsl(240 5.9% 10%)`
- `--sidebar-foreground`: `hsl(240 4.8% 95.9%)`
- `--sidebar-primary`: `hsl(224.3 76.3% 48%)`
- `--sidebar-primary-foreground`: `hsl(0 0% 100%)`
- `--sidebar-accent`: `hsl(240 3.7% 15.9%)`
- `--sidebar-accent-foreground`: `hsl(240 4.8% 95.9%)`
- `--sidebar-border`: `hsl(240 3.7% 15.9%)`
- `--sidebar-ring`: `hsl(217.2 91.2% 59.8%)`

## Typography

### Font Sizes
Use Tailwind's default typography scale for consistent sizing:

| Class | Size | Pixels | Usage |
|-------|------|--------|-------|
| `text-xs` | `0.75rem` | 12px | Captions, labels |
| `text-sm` | `0.875rem` | 14px | Small text, secondary info |
| `text-base` | `1rem` | 16px | Body text, default |
| `text-lg` | `1.125rem` | 18px | Large body text |
| `text-xl` | `1.25rem` | 20px | Subheadings |
| `text-2xl` | `1.5rem` | 24px | Section headings |
| `text-3xl` | `1.875rem` | 30px | Page titles |
| `text-4xl` | `2.25rem` | 36px | Hero titles |
| `text-5xl` | `3rem` | 48px | Large hero titles |
| `text-6xl` | `3.75rem` | 60px | Extra large titles |

### Font Weights
- `font-light`: 300
- `font-normal`: 400
- `font-medium`: 500
- `font-semibold`: 600
- `font-bold`: 700
- `font-extrabold`: 800

### Line Heights
- `leading-none`: 1
- `leading-tight`: 1.25
- `leading-snug`: 1.375
- `leading-normal`: 1.5
- `leading-relaxed`: 1.625
- `leading-loose`: 2

## Spacing

### Container
- **Padding**: `2rem` (32px)
- **Max Width**: `1400px` (2xl breakpoint)
- **Center**: Always centered

### Common Spacing Values
- `p-1`: 0.25rem (4px)
- `p-2`: 0.5rem (8px)
- `p-3`: 0.75rem (12px)
- `p-4`: 1rem (16px)
- `p-6`: 1.5rem (24px)
- `p-8`: 2rem (32px)
- `p-12`: 3rem (48px)
- `p-16`: 4rem (64px)

## Border Radius

| Class | Value | Pixels | Usage |
|-------|-------|--------|-------|
| `rounded-sm` | `0.25rem` | 4px | Small elements |
| `rounded-md` | `0.375rem` | 6px | Medium elements |
| `rounded-lg` | `0.5rem` | 8px | Large elements, default |
| `rounded-xl` | `0.75rem` | 12px | Extra large elements |
| `rounded-2xl` | `1rem` | 16px | Very large elements |
| `rounded-full` | `9999px` | - | Circular elements |

## Animations

### Duration
- `duration-75`: 75ms
- `duration-100`: 100ms
- `duration-150`: 150ms
- `duration-200`: 200ms (default)
- `duration-300`: 300ms
- `duration-500`: 500ms
- `duration-700`: 700ms
- `duration-1000`: 1000ms

### Custom Animations
- `accordion-down`: 0.2s ease-out
- `accordion-up`: 0.2s ease-out
- `fade-in`: 0.6s ease-out

### Easing
- `ease-linear`: linear
- `ease-in`: cubic-bezier(0.4, 0, 1, 1)
- `ease-out`: cubic-bezier(0, 0, 0.2, 1)
- `ease-in-out`: cubic-bezier(0.4, 0, 0.2, 1)

## Gradients

### Light Mode
```css
--gradient-primary: linear-gradient(135deg, hsl(220, 91%, 58%), hsl(260, 85%, 65%))
--gradient-secondary: linear-gradient(135deg, hsl(220, 14%, 96%), hsl(220, 20%, 88%))
--gradient-hero: linear-gradient(135deg, hsl(0, 0%, 100%), hsl(220, 14%, 96%))
```

### Dark Mode
```css
--gradient-primary: linear-gradient(135deg, hsl(220, 91%, 65%), hsl(260, 85%, 70%))
--gradient-secondary: linear-gradient(135deg, hsl(224, 36%, 6%), hsl(224, 40%, 8%))
--gradient-hero: linear-gradient(135deg, hsl(224, 36%, 4%), hsl(220, 30%, 8%))
```

## Component Guidelines

### Buttons
- **Primary**: Use `bg-primary text-primary-foreground`
- **Secondary**: Use `bg-secondary text-secondary-foreground`
- **Destructive**: Use `bg-destructive text-destructive-foreground`
- **Outline**: Use `border border-input bg-background`
- **Ghost**: Use `hover:bg-accent hover:text-accent-foreground`

### Cards
- **Background**: `bg-card`
- **Text**: `text-card-foreground`
- **Border**: `border border-border`
- **Padding**: `p-6` (24px)

### Forms
- **Input Background**: `bg-background`
- **Input Border**: `border border-input`
- **Focus Ring**: `ring-2 ring-ring ring-offset-2`
- **Label**: `text-sm font-medium text-foreground`

### Navigation
- **Active State**: `bg-accent text-accent-foreground`
- **Hover State**: `hover:bg-accent hover:text-accent-foreground`
- **Inactive**: `text-muted-foreground`

### Sidebar
- **Background**: `bg-sidebar`
- **Text**: `text-sidebar-foreground`
- **Border**: `border-sidebar-border`
- **Active Item**: `bg-sidebar-accent text-sidebar-accent-foreground`

## Accessibility

### Color Contrast
- All color combinations meet WCAG AA standards
- Primary text has minimum 4.5:1 contrast ratio
- Large text has minimum 3:1 contrast ratio

### Focus States
- Always use visible focus indicators
- Use `ring-2 ring-ring ring-offset-2` for focus rings
- Ensure focus is keyboard accessible

### Dark Mode
- Automatically adapts to user preference
- Maintains proper contrast ratios
- Provides alternative color schemes

### Screen Readers
- Use semantic HTML elements
- Provide proper ARIA labels
- Ensure proper heading hierarchy

## Best Practices

### Color Usage
1. **Primary**: Use for main actions, branding, and important elements
2. **Secondary**: Use for supporting elements and secondary actions
3. **Destructive**: Use only for dangerous actions and error states
4. **Muted**: Use for subtle text and backgrounds
5. **Accent**: Use for highlighting and interactive elements

### Spacing
1. Use consistent spacing scale
2. Prefer `p-4`, `p-6`, `p-8` for component padding
3. Use `gap-4` for flex/grid layouts
4. Maintain visual hierarchy with spacing

### Typography
1. Use semantic heading hierarchy (h1 → h6)
2. Limit line length to 60-80 characters
3. Use appropriate font weights for emphasis
4. Ensure sufficient line height for readability

### Responsive Design
1. Design mobile-first
2. Use Tailwind's responsive prefixes
3. Test on multiple screen sizes
4. Ensure touch targets are at least 44px

## Implementation Notes

### CSS Variables
All colors are defined as CSS custom properties in `src/index.css`:
```css
:root {
  --primary: 220 91% 58%;
  --background: 0 0% 100%;
  /* ... other variables */
}
```

### Tailwind Integration
Colors are mapped in `tailwind.config.ts`:
```typescript
colors: {
  primary: {
    DEFAULT: 'hsl(var(--primary))',
    foreground: 'hsl(var(--primary-foreground))'
  }
}
```

### Usage in Components
```tsx
// Good
<button className="bg-primary text-primary-foreground px-4 py-2 rounded-lg">
  Click me
</button>

// Avoid
<button className="bg-blue-500 text-white px-4 py-2 rounded-lg">
  Click me
</button>
```

---

**Last Updated**: [Current Date]
**Version**: 1.0.0 