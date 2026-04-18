import { useEffect, useRef } from 'react';

export default function CustomCursor() {
  const dotRef = useRef(null);
  const ringRef = useRef(null);

  const targetPos = useRef({ x: -100, y: -100 });
  const currentPos = useRef({ x: -100, y: -100 });

  useEffect(() => {
    // Initial off-screen position
    if (dotRef.current) {
      dotRef.current.style.transform = `translate(calc(-100px - 50%), calc(-100px - 50%))`;
    }
    if (ringRef.current) {
      ringRef.current.style.transform = `translate(calc(-100px - 50%), calc(-100px - 50%))`;
    }

    const handleMouseMove = (e) => {
      targetPos.current.x = e.clientX;
      targetPos.current.y = e.clientY;
      
      if (dotRef.current) {
        dotRef.current.style.transform = `translate(calc(${e.clientX}px - 50%), calc(${e.clientY}px - 50%))`;
      }
    };

    window.addEventListener('mousemove', handleMouseMove);

    let animationFrameId;
    const render = () => {
      currentPos.current.x += (targetPos.current.x - currentPos.current.x) * 0.1;
      currentPos.current.y += (targetPos.current.y - currentPos.current.y) * 0.1;

      if (ringRef.current) {
        ringRef.current.style.transform = `translate(calc(${currentPos.current.x}px - 50%), calc(${currentPos.current.y}px - 50%))`;
      }

      animationFrameId = requestAnimationFrame(render);
    };
    render();

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <>
      <div 
        ref={dotRef}
        className="fixed top-0 left-0 pointer-events-none z-[9999] w-2.5 h-2.5 bg-[#b9ff66] border border-black rounded-full"
      />
      <div 
        ref={ringRef}
        className="fixed top-0 left-0 pointer-events-none z-[9999] w-7 h-7 border-2 border-black dark:border-white rounded-full"
      />
    </>
  );
}