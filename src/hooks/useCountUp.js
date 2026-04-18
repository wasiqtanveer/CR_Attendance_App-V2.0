import { useState, useEffect, useRef } from 'react';

export function useCountUp(target, duration = 600) {
  const [value, setValue] = useState(0);
  const prevTarget = useRef(0);
  const raf = useRef(null);

  useEffect(() => {
    const end = Number(target) || 0;
    if (end === prevTarget.current) {
        setValue(end);
        return;
    }
    const start = prevTarget.current;
    prevTarget.current = end;

    const startTime = performance.now();

    const tick = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(start + (end - start) * eased));
      
      if (progress < 1) {
          raf.current = requestAnimationFrame(tick);
      } else {
          setValue(end);
      }
    };

    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration]);

  return value;
}
