# Yourcipe Design System — Enforcement Guide

## Overview
This guide maps all UI components to Design System classes. All new and existing components MUST use these patterns authoritatively.

## Component Mapping & Implementation

### BUTTONS

#### Primary Button (Default/Most Used)
**Old pattern:** `style="background:var(--brand-700);color:#F4F2F1;..."` or custom inline styles
**New pattern:** `class="ds-btn ds-btn-primary"`

```html
<!-- ✅ Correct -->
<button class="ds-btn ds-btn-primary">Save Recipe</button>
<button class="ds-btn ds-btn-primary ds-btn-lg">Large Action</button>
<button class="ds-btn ds-btn-primary ds-btn-sm">Small Action</button>

<!-- ❌ Never use inline styles -->
<button style="background:var(--brand-700);...">Wrong</button>
```

#### Secondary Button
**New pattern:** `class="ds-btn ds-btn-secondary"`
```html
<button class="ds-btn ds-btn-secondary">Cancel</button>
```

#### Ghost Button
**New pattern:** `class="ds-btn ds-btn-ghost"`
```html
<button class="ds-btn ds-btn-ghost">Learn More</button>
```

#### Danger Button
**New pattern:** `class="ds-btn ds-btn-danger"`
```html
<button class="ds-btn ds-btn-danger">Delete</button>
```

---

### FORM CONTROLS

#### Text Input
**Old pattern:** `<input style="border:1px solid var(--border-default);...">`
**New pattern:** `<input class="ds-input" type="text">`

```html
<!-- ✅ Correct -->
<div>
  <label class="ds-input-label">Recipe Name</label>
  <input class="ds-input" type="text" placeholder="Enter name">
  <span class="ds-input-helper">Max 100 characters</span>
</div>

<!-- With error state -->
<div>
  <label class="ds-input-label">Email</label>
  <input class="ds-input is-error" type="email" value="invalid">
  <span class="ds-input-error">Invalid email address</span>
</div>
```

#### Select Dropdown
**Old pattern:** Custom styled select or dropdown
**New pattern:** `<select class="ds-select">`

```html
<!-- ✅ Correct -->
<label class="ds-input-label">Category</label>
<select class="ds-select">
  <option value="">Choose...</option>
  <option value="appetizer">Appetizer</option>
  <option value="main">Main Course</option>
  <option value="dessert">Dessert</option>
</select>
```

#### Checkbox
**Old pattern:** `.yc-checkbox` with manual checkmark logic
**New pattern:** `.ds-checkbox` with semantic HTML

```html
<!-- ✅ Correct -->
<label class="ds-checkbox">
  <input type="checkbox" checked>
  <span class="ds-checkbox-control">✓</span>
  <span>Gluten-free</span>
</label>

<label class="ds-checkbox is-disabled">
  <input type="checkbox" disabled>
  <span class="ds-checkbox-control"></span>
  <span>Archived (disabled)</span>
</label>
```

#### Radio Button
**New pattern:** `.ds-radio`

```html
<!-- ✅ Correct -->
<label class="ds-radio">
  <input type="radio" name="difficulty" value="easy">
  <span class="ds-radio-control"></span>
  <span>Easy</span>
</label>

<label class="ds-radio">
  <input type="radio" name="difficulty" value="medium">
  <span class="ds-radio-control"></span>
  <span>Medium</span>
</label>
```

---

### CARDS & CONTAINERS

#### Card
**Old pattern:** Inline div with border and shadow
**New pattern:** `class="ds-card"`

```html
<!-- ✅ Correct -->
<article class="ds-card">
  <img src="recipe.jpg" class="ds-card-image" alt="Recipe">
  <h3 class="ds-card-title">Weeknight Ramen</h3>
  <p class="ds-card-subtitle">Quick & hearty</p>
  <p class="ds-card-meta">30 minutes</p>
</article>
```

#### Badge
**New pattern:** `class="ds-badge"`

```html
<!-- ✅ Correct -->
<span class="ds-badge">New</span>
<span class="ds-badge is-success">In Stock</span>
<span class="ds-badge is-danger">Out of Stock</span>
<span class="ds-badge is-info">Popular</span>
```

#### Tag/Chip
**New pattern:** `class="ds-tag"`

```html
<!-- ✅ Correct -->
<span class="ds-tag">Vegan</span>
<span class="ds-tag">Spicy</span>
<span class="ds-tag is-removable">Remove me ✕</span>
```

---

### TYPOGRAPHY

**NEVER use inline `style="font-size:..."` or hardcoded pixel values!**

#### Headings
```html
<!-- ✅ Correct -->
<h1 class="ds-heading-h1">Welcome to Yourcipe</h1>
<h2 class="ds-heading-h2">Popular Recipes</h2>
<h3 class="ds-heading-h3">Today's Specials</h3>
<h4 class="ds-heading-h4">Section Title</h4>
<h5 class="ds-heading-h5">Subsection</h5>
<h6 class="ds-heading-h6">Minor Heading</h6>

<!-- Display sizes for hero sections -->
<h1 class="ds-display-large">Epic Dishes Await</h1>
<h2 class="ds-display-medium">Discover New Flavors</h2>
<h3 class="ds-display-small">Trending Now</h3>
```

#### Body Text
```html
<!-- ✅ Correct -->
<p class="ds-body-lg-regular">Large regular text</p>
<p class="ds-body-lg-medium">Large medium text</p>
<p class="ds-body-md-regular">Standard text (default)</p>
<p class="ds-body-md-medium">Standard medium text</p>
<p class="ds-body-sm-regular">Small text</p>
<p class="ds-body-sm-medium">Small medium text</p>
```

#### Labels & Captions
```html
<!-- ✅ Correct -->
<span class="ds-label-lg">Large label</span>
<span class="ds-label-md">Standard label</span>
<span class="ds-label-sm">Small label</span>
<span class="ds-caption">Caption text</span>
<span class="ds-caption-medium">Caption medium</span>
<span class="ds-overline">SECTION LABEL</span>
```

---

### TABS & NAVIGATION

#### Tabs
**New pattern:** `.ds-tabs` + `.ds-tab`

```html
<!-- ✅ Correct -->
<div class="ds-tabs" role="tablist">
  <button class="ds-tab is-active" role="tab">Recipes</button>
  <button class="ds-tab" role="tab">Favorites</button>
  <button class="ds-tab" role="tab">Shared</button>
</div>
```

---

### DIALOGS & MODALS

#### Dialog/Modal
**New pattern:** `.ds-dialog-overlay` + `.ds-dialog`

```html
<!-- ✅ Correct -->
<div class="ds-dialog-overlay">
  <dialog class="ds-dialog">
    <h2 class="ds-dialog-title">Confirm Delete</h2>
    <div class="ds-dialog-content">
      Are you sure you want to delete this recipe?
    </div>
    <div class="ds-dialog-actions">
      <button class="ds-btn ds-btn-secondary">Cancel</button>
      <button class="ds-btn ds-btn-danger">Delete</button>
    </div>
  </dialog>
</div>
```

---

### ALERTS & NOTIFICATIONS

#### Toast
**New pattern:** `.ds-toast`

```html
<!-- ✅ Correct -->
<div class="ds-toast is-success">
  <p class="ds-toast-content">Recipe saved successfully!</p>
</div>

<div class="ds-toast is-error">
  <p class="ds-toast-content">Failed to save recipe. Try again.</p>
</div>

<div class="ds-toast is-info">
  <p class="ds-toast-content">Recipe has been shared.</p>
</div>
```

---

### SPACING & LAYOUT

**Use spacing tokens for all spacing, never hardcoded px values!**

```html
<!-- ✅ Correct - Using DS gap tokens -->
<div style="display: flex; gap: var(--space-4);">
  <button class="ds-btn ds-btn-primary">Save</button>
  <button class="ds-btn ds-btn-secondary">Cancel</button>
</div>

<!-- ✅ Alternative - Using gap utility -->
<div style="display: flex;" class="ds-gap-4">
  <!-- ... -->
</div>

<!-- ✅ Using space utilities for padding -->
<div class="ds-space-4">
  Content with padding
</div>
```

**Spacing values:**
- `--space-1`: 4px
- `--space-2`: 8px
- `--space-3`: 12px
- `--space-4`: 16px
- `--space-5`: 24px
- `--space-6`: 32px
- `--space-7`: 48px
- `--space-8`: 64px

---

### COLORS

**NEVER use hardcoded hex values in inline styles!**

#### Text Colors
```html
<!-- ✅ Correct -->
<span style="color: var(--text-primary);">Primary text</span>
<span style="color: var(--text-secondary);">Secondary text</span>
<span style="color: var(--text-tertiary);">Tertiary text</span>
<span style="color: var(--text-strong);">Strong/Bold text</span>
<span style="color: var(--text-disabled);">Disabled text</span>
<span style="color: var(--text-brand);">Brand colored text</span>
<span style="color: var(--text-danger);">Error text</span>
<span style="color: var(--text-success);">Success text</span>
<span style="color: var(--text-info);">Info text</span>
```

#### Background Colors
```html
<!-- ✅ Correct -->
<div style="background: var(--surface-primary);">Primary surface</div>
<div style="background: var(--surface-secondary);">Secondary surface</div>
<div style="background: var(--surface-tertiary);">Tertiary surface</div>
<div style="background: var(--surface-selected);">Selected state</div>
<div style="background: var(--surface-disabled);">Disabled state</div>
```

#### Border Colors
```html
<!-- ✅ Correct -->
<div style="border: 1px solid var(--border-subtle);">Subtle border</div>
<div style="border: 1px solid var(--border-default);">Default border</div>
<div style="border: 1px solid var(--border-strong);">Strong border</div>
<div style="border: 1px solid var(--border-focus);">Focus border</div>
<div style="border: 1px solid var(--border-brand);">Brand border</div>
<div style="border: 1px solid var(--border-danger);">Danger border</div>
```

---

### RADIUS & SHADOWS

#### Border Radius
```html
<!-- ✅ Correct -->
<div class="ds-radius-sm">Slightly rounded (8px)</div>
<div class="ds-radius-md">Medium rounded (12px)</div>
<div class="ds-radius-lg">Rounded (16px)</div>
<div class="ds-radius-xl">Very rounded (24px)</div>
<div class="ds-radius-full">Fully rounded (999px / pill)</div>

<!-- Or inline style -->
<div style="border-radius: var(--radius-md);">Rounded</div>
```

#### Shadows
```html
<!-- ✅ Correct -->
<div class="ds-shadow-sm">Subtle shadow</div>
<div class="ds-shadow-md">Medium shadow</div>
<div class="ds-shadow-lg">Large shadow</div>

<!-- Or inline style -->
<div style="box-shadow: var(--shadow-md);">Shadowed</div>
```

---

## Migration Checklist

### Phase 1: Import DS Styles
- [x] Add `ds-enforce.css` to `index.html`
- [x] Update version numbers in all JS files
- [ ] Test that DS tokens are available

### Phase 2: Button Components (High Priority)
- [ ] Replace all button inline styles with `.ds-btn` classes
- [ ] Verify hover, active, and disabled states
- [ ] Check all button variants (primary, secondary, ghost, danger)

### Phase 3: Form Controls
- [ ] Convert all inputs to `.ds-input`
- [ ] Convert all selects to `.ds-select`
- [ ] Convert all checkboxes to `.ds-checkbox`
- [ ] Convert all radio buttons to `.ds-radio`
- [ ] Add labels and helper text with proper classes

### Phase 4: Typography
- [ ] Replace all inline `font-size` styles with classes
- [ ] Update all headings with appropriate `.ds-heading-*` classes
- [ ] Update body text with `.ds-body-*` classes
- [ ] Update labels with `.ds-label-*` classes

### Phase 5: Cards & Data Displays
- [ ] Update all cards with `.ds-card` and sub-classes
- [ ] Update badges with `.ds-badge`
- [ ] Update tags with `.ds-tag`
- [ ] Update tabs with `.ds-tabs` and `.ds-tab`

### Phase 6: Dialogs & Overlays
- [ ] Convert modals to use `.ds-dialog`
- [ ] Convert overlays to use `.ds-dialog-overlay`
- [ ] Update toasts to use `.ds-toast`

### Phase 7: Layout & Spacing
- [ ] Replace all hardcoded spacing with `--space-*` tokens
- [ ] Replace all hardcoded colors with semantic tokens
- [ ] Replace all hardcoded radius values with `--radius-*` tokens
- [ ] Replace all hardcoded shadow values with `--shadow-*` tokens

---

## Enforcement Rules

### ✅ DO
- Always use DS classes for components
- Always use semantic color tokens
- Always use spacing tokens
- Always use typography classes
- Use border-radius and shadow tokens
- Test hover, focus, and active states
- Keep HTML semantic (use proper tags)

### ❌ DON'T
- Don't use inline color values (hardcoded #hex)
- Don't use inline font-size values
- Don't hardcode spacing (px, em, rem)
- Don't hardcode border-radius
- Don't hardcode shadows
- Don't mix old `.yc-*` classes with new `.ds-*` classes
- Don't create custom component styles outside of ds-enforce.css

---

## Testing Checklist

For each component:
- [ ] Default state displays correctly
- [ ] Hover state works on desktop
- [ ] Focus state is visible (blue outline)
- [ ] Active/pressed state works
- [ ] Disabled state appears correctly
- [ ] Dark mode (**` .yc-dark`**) works properly
- [ ] Mobile responsive (fits 320px+)
- [ ] Keyboard navigation works
- [ ] Screen reader announces correctly

---

## Reference

### Design System Files
- `ds-enforce.css` — All design system tokens and components
- `ds-tokens/` — Source token definitions
- `ds-components/` — Reference implementations (React)

### Token Structure
- **Colors**: Brand, Neutral, Feedback (Blue, Green, Yellow, Red)
- **Semantic Tokens**: Text, Surface, Border, Button
- **Typography**: Display, Heading, Body, Label, Caption
- **Spacing**: 4px-64px scale
- **Radius**: 8px-24px + full
- **Shadows**: Small, Medium, Large
- **Motion**: Fast (120ms), Base (180ms), Slow (260ms)
