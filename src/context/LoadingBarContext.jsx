import { createContext, useContext, useState, useCallback, useRef } from 'react';

const LoadingBarContext = createContext(null);

export function LoadingBarProvider({ children }) {
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);

  const timeoutRefs = useRef([]);

  const start = useCallback(() => {
    // Clear any existing timeouts to prevent ghost jumps
    timeoutRefs.current.forEach(clearTimeout);
    timeoutRefs.current = [];

    setVisible(true);
    setProgress(15);
    
    // Simulate incremental progress
    const bumps = [30, 50, 70, 85];
    bumps.forEach((p, i) => {
      const timerId = setTimeout(() => {
        setProgress(p);
      }, (i + 1) * 350);
      timeoutRefs.current.push(timerId);
    });
  }, []);

  const done = useCallback(() => {
    // Stop all pending increments
    timeoutRefs.current.forEach(clearTimeout);
    timeoutRefs.current = [];
    
    setProgress(100);
    setTimeout(() => {
      setVisible(false);
      // Wait for fade out animation to finish before resetting width to 0
      setTimeout(() => setProgress(0), 400);
    }, 400);
  }, []);

  return (
    <LoadingBarContext.Provider value={{ start, done, progress, visible }}>
      {children}
    </LoadingBarContext.Provider>
  );
}

export function useLoadingBar() {
  return useContext(LoadingBarContext);
}
