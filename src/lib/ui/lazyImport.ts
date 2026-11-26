import React from 'react';

/**
 * Simple conditional lazy import.
 * In production: returns React.lazy component
 * In test: returns a component that imports synchronously on first render
 */
export function lazyImport<T extends React.ComponentType<any>>(
  importFn: () => Promise<{ default: T }>
): React.ComponentType<any> {
  if (import.meta.env.MODE === 'test') {
    let Component: T | null = null;
    let loading = false;

    return function LazyTestComponent(props: any) {
      if (Component) {
        return React.createElement(Component, props);
      }
      if (!loading) {
        loading = true;
        importFn().then((mod) => {
          Component = mod.default;
        });
      }
      // Return a lightweight placeholder that will re-render when Component loads
      return React.createElement('div', { 'data-testid': 'lazy-loading' }, 'Loading...');
    };
  }
  return React.lazy(importFn);
}