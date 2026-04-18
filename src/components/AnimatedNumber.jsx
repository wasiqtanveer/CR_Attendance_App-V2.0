import { motion, useSpring, useTransform } from 'framer-motion';
import { useEffect } from 'react';

export default function AnimatedNumber({ value }) {
  // Fast, natural settling spring physics
  const spring = useSpring(0, { mass: 0.7, stiffness: 60, damping: 14 });
  const display = useTransform(spring, (current) => Math.round(current));

  useEffect(() => {
    spring.set(value);
  }, [spring, value]);

  // tabular-nums guarantees that characters take up identical monospaced width, 
  // ensuring the container and surrounding text doesn't 'shake' during the animation.
  return <motion.span className="tabular-nums">{display}</motion.span>;
}
