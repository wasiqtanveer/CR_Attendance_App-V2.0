import { motion } from 'framer-motion';

export default function DoodleBackground() {
  const shapes = [
    { id: 1, type: 'star4', top: '8%', left: '5%', duration: 5, delay: 0 },
    { id: 2, type: 'circle', top: '20%', right: '8%', duration: 6, delay: 0.5 },
    { id: 3, type: 'plus', bottom: '15%', left: '12%', duration: 4.5, delay: 1 },
    { id: 4, type: 'arrow', top: '40%', left: '15%', duration: 7, delay: 0.2 },
    { id: 5, type: 'dots', bottom: '25%', right: '10%', duration: 5.5, delay: 0.8 },
    { id: 6, type: 'star6', top: '10%', right: '25%', duration: 6.5, delay: 1.2 },
    { id: 7, type: 'circle', bottom: '10%', right: '30%', duration: 4, delay: 0.3 },
    { id: 8, type: 'plus', top: '60%', right: '5%', duration: 5.2, delay: 0.7 },
    { id: 9, type: 'arrow', bottom: '40%', left: '5%', duration: 6.2, delay: 1.5 },
  ];

  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden z-0">
      {shapes.map((shape) => (
        <motion.div
          key={shape.id}
          className="absolute"
          style={{ top: shape.top, left: shape.left, right: shape.right, bottom: shape.bottom }}
          animate={{ y: [0, -12, 0], rotate: [0, 8, 0] }}
          transition={{ duration: shape.duration, repeat: Infinity, ease: 'easeInOut', delay: shape.delay }}
        >
          <svg width="40" height="40" viewBox="0 0 40 40" className="stroke-black dark:stroke-white opacity-10 dark:opacity-10 fill-none stroke-[2px]">
            {shape.type === 'star4' && <path d="M20 0 L23 17 L40 20 L23 23 L20 40 L17 23 L0 20 L17 17 Z" strokeLinejoin="round" />}
            {shape.type === 'star6' && <path d="M20 0 L25 15 L40 10 L30 25 L40 40 L25 35 L20 50 L15 35 L0 40 L10 25 L0 10 L15 15 Z" strokeLinejoin="round" />}
            {shape.type === 'circle' && <circle cx="20" cy="20" r="16" />}
            {shape.type === 'plus' && <path d="M20 0 L20 40 M0 20 L40 20" strokeLinecap="round" />}
            {shape.type === 'arrow' && <path d="M5 35 L35 5 M20 5 L35 5 L35 20" strokeLinecap="round" strokeLinejoin="round" />}
            {shape.type === 'dots' && (
              <>
                <circle cx="10" cy="10" r="2" className="fill-black dark:fill-white" stroke="none" />
                <circle cx="30" cy="10" r="2" className="fill-black dark:fill-white" stroke="none" />
                <circle cx="10" cy="30" r="2" className="fill-black dark:fill-white" stroke="none" />
                <circle cx="30" cy="30" r="2" className="fill-black dark:fill-white" stroke="none" />
                <circle cx="20" cy="20" r="2" className="fill-black dark:fill-white" stroke="none" />
              </>
            )}
          </svg>
        </motion.div>
      ))}
    </div>
  );
}