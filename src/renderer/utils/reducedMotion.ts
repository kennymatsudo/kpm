/**
 * Reduced-motion checks for the places CSS cannot reach.
 *
 * The `prefers-reduced-motion` block in index.css collapses transitions and
 * animations, but an explicit `behavior: 'smooth'` passed to scrollTo or
 * scrollIntoView from JavaScript wins over `scroll-behavior: auto !important`.
 * Any programmatic scroll has to ask for itself.
 */

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** The scroll behavior to pass when you would otherwise hardcode `'smooth'`. */
export function scrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? 'auto' : 'smooth';
}
