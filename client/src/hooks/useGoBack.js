import { useLocation, useNavigate } from 'react-router';

/**
 * Goes back like the phone's back gesture when the previous screen is in this app; when the page
 * was opened directly (a link, a reload), goes to `fallback` instead of leaving the app.
 */
export function useGoBack(fallback) {
  const navigate = useNavigate();
  const location = useLocation();
  return () => {
    if (location.key !== 'default') navigate(-1);
    else navigate(fallback, { replace: true });
  };
}
