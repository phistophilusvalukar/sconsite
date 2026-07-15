import { useContext } from 'react';
import { PageVisibilityContext } from './PageVisibilityContext';

export function usePageVisibility() {
  const context = useContext(PageVisibilityContext);
  if (!context) {
    throw new Error('usePageVisibility must be used within a PageVisibilityProvider');
  }
  return context;
}
