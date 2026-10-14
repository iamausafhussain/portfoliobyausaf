import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { scrollToChapter } from '../motion/scrollTo';

/**
 * Go to a home-page chapter from anywhere (NV-3, NV-4): scroll there on the home page,
 * otherwise navigate home with the hash; RouteEffects lands on it once it renders.
 */
export function useNavigateToChapter() {
  const location = useLocation();
  const navigate = useNavigate();
  return useCallback(
    (id: string) => {
      if (location.pathname === '/' && scrollToChapter(id)) return;
      navigate(`/#${id}`);
    },
    [location.pathname, navigate],
  );
}
