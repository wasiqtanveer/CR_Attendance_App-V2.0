import { NavLink, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function CourseNav({ courseId }) {
  const links = [
    ['attendance', 'Roll call'],
    ['students', 'Students'],
    ['history', 'History'],
  ];
  return (
    <nav aria-label="Course sections" className="hidden w-fit grid-cols-3 gap-1 rounded-2xl border-2 border-black bg-white p-1 dark:border-white/85 dark:bg-[#111] md:grid">
      {links.map(([path, label]) => (
        <NavLink key={path} to={`/courses/${courseId}/${path}`}
          className={({ isActive }) => `rounded-xl px-5 py-2 text-center text-sm font-bold transition-colors ${isActive
            ? 'bg-[#b9ff66] text-black'
            : 'text-gray-600 hover:bg-black/5 hover:text-black dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white'}`}>
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

// Shared top of every course page: course name as the heading, a one-line
// summary, optional actions, and the section switcher on larger screens.
export function CourseHeader({ courseId, courseName, summary, actions, onBack }) {
  return (
    <div className="mb-5 md:mb-8">
      <div className="mb-4 hidden md:block">
        {onBack ? (
          <button type="button" onClick={onBack}
            className="inline-flex items-center gap-1.5 text-sm font-bold text-gray-600 transition-colors hover:text-black dark:text-gray-400 dark:hover:text-white">
            <ArrowLeft size={16} /> All courses
          </button>
        ) : (
          <Link to="/dashboard"
            className="inline-flex items-center gap-1.5 text-sm font-bold text-gray-600 transition-colors hover:text-black dark:text-gray-400 dark:hover:text-white">
            <ArrowLeft size={16} /> All courses
          </Link>
        )}
      </div>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1">
          <h1 className="break-words text-[1.75rem] font-extrabold leading-[1.1] text-gray-900 dark:text-white sm:text-4xl">
            {courseName || <span className="inline-block h-8 w-48 animate-pulse rounded-lg bg-black/10 align-middle dark:bg-white/10" />}
          </h1>
          {summary && <p className="mt-1.5 text-sm font-medium text-gray-600 dark:text-gray-400">{summary}</p>}
        </div>
        {actions && <div className="flex flex-none items-center gap-2">{actions}</div>}
      </div>
      <div className="mt-5 hidden md:block"><CourseNav courseId={courseId} /></div>
    </div>
  );
}
