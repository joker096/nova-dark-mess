import React, { useCallback } from 'react';

export type HapticType = 'light' | 'medium' | 'heavy' | 'selection' | 'success' | 'warning' | 'error';

export const hapticLight = () => triggerHaptic('light');
export const hapticMedium = () => triggerHaptic('medium');
export const hapticHeavy = () => triggerHaptic('heavy');
export const hapticSelection = () => triggerHaptic('selection');
export const hapticSuccess = () => triggerHaptic('success');
export const hapticWarning = () => triggerHaptic('warning');
export const hapticError = () => triggerHaptic('error');

export function triggerHaptic(type: HapticType = 'light'): void {
  if (typeof navigator === 'undefined') return;
  
  if (!navigator.vibrate) return;
  
  const patterns: Record<HapticType, number | number[]> = {
    light: 10,
    medium: 20,
    heavy: 40,
    selection: 5,
    success: [10, 50, 10],
    warning: [20, 100, 20],
    error: [50, 50, 50, 50, 50],
  };
  
  try {
    navigator.vibrate(patterns[type]);
  } catch {
    // Ignore haptic errors
  }
}

export function useHaptic(): (type?: HapticType) => void {
  return useCallback(triggerHaptic, []);
}

// For React components that need haptic feedback on click
export const withHaptic = <T extends React.ComponentType<any>>(
  Component: T,
  hapticType: HapticType = 'light'
): T => {
  return ((props: any) => {
    const handleClick = (e: React.MouseEvent | React.TouchEvent) => {
      triggerHaptic(hapticType);
      props.onClick?.(e);
    };
    
    return React.createElement(Component, { ...props, onClick: handleClick });
  }) as T;
};