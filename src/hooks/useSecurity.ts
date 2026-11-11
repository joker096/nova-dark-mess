import { useContext } from 'react';
import { SecurityContext, SecurityContextType } from '../context/SecurityContext';

export function useSecurity(): SecurityContextType {
  const context = useContext(SecurityContext);
  if (!context) {
    throw new Error('useSecurity must be used within a SecurityProvider');
  }
  return context;
}
