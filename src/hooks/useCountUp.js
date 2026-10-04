import { useState, useEffect, useRef } from 'react';

export function useCountUp(target, duration = 600) {
  const [value, setValue] = useState(0);
  const current = useRef(0);
  const raf = useRef(null);

  useEffect(() => {
    const end = Number(target) || 0;
    // Start from what is on screen, so a cancelled run (StrictMode, fast
    // re-renders) resumes instead of getting stuck.
    const start = current.current;
    if (end === start) return;

    const startTime = performance.now();

    const tick = (now) => {
      const progress = Math.min((now - startTime) / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      current.current = progress < 1 ? Math.round(start + (end - start) * eased) : end;
      setValue(current.current);
      if (progress < 1) raf.current = requestAnimationFrame(tick);
    };

    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration]);

  return value;
}
