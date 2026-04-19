import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { playClick } from '../lib/sounds';

export default function CustomCursor() {
  const customCursorRef = useRef(null);
  const targetPos = useRef({ x: -100, y: -100 });
  const currentPos = useRef({ x: -100, y: -100 });
  const currentScale = useRef(1); // Track scale directly for smooth interpolation
  
  // Use refs instead of state for hover/click to prevent effect re-triggering (which causes jumps)
  const isHoveringRef = useRef(false);
  const isClickedRef = useRef(false);

  const [isMobile, setIsMobile] = useState(false);
  const [ripples, setRipples] = useState([]);

  useEffect(() => {
    // Check if device supports hover (is not a touch device)
    const checkMobile = () => {
      const match = window.matchMedia('(pointer: coarse)');
      setIsMobile(match.matches);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);

    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (isMobile) return;

    if (customCursorRef.current) {
      customCursorRef.current.style.transform = `translate(-100px, -100px) scale(1)`;
    }

    const handleMouseMove = (e) => {
      targetPos.current.x = e.clientX;
      targetPos.current.y = e.clientY;
    };

    const handleMouseOver = (e) => {
      const isClickable = e.target.closest('a, button, input, textarea, select, [role="button"], [tabindex]:not([tabindex="-1"])');
      if (isClickable) {
        isHoveringRef.current = true;
      }
    };

    const handleMouseOut = (e) => {
      const isClickable = e.target.closest('a, button, input, textarea, select, [role="button"], [tabindex]:not([tabindex="-1"])');
      if (isClickable) {
        isHoveringRef.current = false;
      }
    };

    const handleMouseDown = (e) => {
      isClickedRef.current = true;
      playClick();
      
      const newRipple = { id: Date.now(), x: e.clientX, y: e.clientY };
      setRipples(prev => [...prev, newRipple]);
      setTimeout(() => {
        setRipples(prev => prev.filter(r => r.id !== newRipple.id));
      }, 500);
    };

    const handleMouseUp = () => {
      isClickedRef.current = false;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mouseover', handleMouseOver);
    document.addEventListener('mouseout', handleMouseOut);

    let animationFrameId;
    const render = () => {
      // Smoother, snappier follow
      currentPos.current.x += (targetPos.current.x - currentPos.current.x) * 0.2;
      currentPos.current.y += (targetPos.current.y - currentPos.current.y) * 0.2;

      if (customCursorRef.current) {
        // Calculate the target scale we *want* to be at right now
        const baseTargetScale = isHoveringRef.current ? 1.5 : 1;
        const targetScale = isClickedRef.current ? baseTargetScale * 0.8 : baseTargetScale;

        // Smoothly interpolate the current scale toward the target scale using framerate
        currentScale.current += (targetScale - currentScale.current) * 0.15;

        // Apply immediately
        customCursorRef.current.style.transform = `translate(${currentPos.current.x}px, ${currentPos.current.y}px) scale(${currentScale.current})`;
      }

      animationFrameId = requestAnimationFrame(render);
    };
    render();

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mouseover', handleMouseOver);
      document.removeEventListener('mouseout', handleMouseOut);
      cancelAnimationFrame(animationFrameId);
    };
  }, [isMobile]); // Dependencies removed to prevent effect re-triggering on click/hover

  if (isMobile) return null;

  return (
    <>
      <AnimatePresence>
        {ripples.map(r => (
          <motion.div
            key={r.id}
            initial={{ scale: 0, opacity: 0.8 }}
            animate={{ scale: 3, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="fixed top-0 left-0 pointer-events-none z-[9998] w-6 h-6 rounded-full border-2 border-[#b9ff66]"
            style={{ transform: `translate(calc(${r.x}px - 50%), calc(${r.y}px - 50%))` }}
          />
        ))}
      </AnimatePresence>
      <div 
        ref={customCursorRef}
        className="fixed top-0 left-0 pointer-events-none z-[9999] transition-transform duration-100 ease-out origin-top-left flex items-center justify-center"
      >
        <svg 
          width="48" 
          height="48" 
          viewBox="0 0 24 24" 
          fill="#b9ff66"
          stroke="black"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          className="drop-shadow-lg origin-top-left -rotate-[5deg]"
          style={{ transform: 'scale(0.5)', transformOrigin: 'top left' }}
        >
          <path d="M0 0 L20 8 L10 10 L8 20 Z" />
          <path d="M0 0 L10 10" />
        </svg>
      </div>
    </>
  );
}