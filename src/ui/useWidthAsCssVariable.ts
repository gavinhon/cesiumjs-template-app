import { useLayoutEffect, type RefObject } from 'react';

/**
 * Publishes an element's rendered width as a CSS custom property on the
 * document root, kept current as the element resizes.
 *
 * For layout that depends on how wide something *turned out*, which CSS
 * alone can't express. The case it exists for: the right rail wraps into a
 * second column on short screens, and the right-hand panel has to sit
 * clear of however many columns there are. A media query could guess the
 * height at which that happens, but the guess would go stale the moment
 * someone adds a tool to the rail; measuring can't.
 *
 * A layout effect, so the variable is set before the first paint and the
 * panel never flashes in the wrong place.
 */
export function useWidthAsCssVariable(ref: RefObject<HTMLElement | null>, variable: `--${string}`) {
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const root = document.documentElement;
    const publish = () => root.style.setProperty(variable, `${element.offsetWidth}px`);

    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(element);
    return () => {
      observer.disconnect();
      root.style.removeProperty(variable);
    };
  }, [ref, variable]);
}
