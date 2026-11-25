import { useLayoutEffect, type RefObject } from 'react';

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
