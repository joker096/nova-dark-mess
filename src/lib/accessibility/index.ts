// Accessibility exports

// Core a11y utilities
export * from './a11y';

// React hooks - explicitly re-export to avoid ambiguity
export {
  useAnnounce,
  useFocusTrap,
  useAutoFocus,
  useFocusRestore,
  usePrefersReducedMotion,
  useAnimationDuration,
  useArrowNavigation,
  useSkipLink,
  useHeadingStructure,
  useInitAccessibility,
  useFocusVisible,
} from './useA11y';

export * from './useKeyboardNavigation';

// Components
export { FocusTrap } from './FocusTrap';
export { LiveRegion, LiveRegionProvider, useLiveRegion } from './LiveRegion';

// Styles
import './a11y.css';