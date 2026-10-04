import { Check, ClipboardList, TrendingUp } from 'lucide-react';

const highlights = [
  { icon: <ClipboardList size={19} strokeWidth={2.4} />, title: 'Keep every roster together', detail: 'Courses, students, and class records in one place.' },
  { icon: <Check size={19} strokeWidth={2.4} />, title: 'Mark attendance with confidence', detail: 'A clear roll call that works even when you are offline.' },
  { icon: <TrendingUp size={19} strokeWidth={2.4} />, title: 'See the bigger picture', detail: 'Follow trends and spot students who need support.' },
];

export default function AuthShell({ children }) {
  return (
    <main className="auth-shell">
      <div className="auth-mobile-brand">
        <div className="auth-mobile-brand-row">
          <img src="/favicon.svg" alt="" />
          <span>CR Attendance</span>
        </div>
        <p>Every class, under control.</p>
      </div>
      <div className="auth-stage">
        <aside className="auth-story" aria-label="About CR Attendance">
          <div className="auth-story-brand">
            <span className="auth-story-logo"><img src="/favicon.svg" alt="" /></span>
            <span>CR Attendance<span className="auth-story-brand-dot">.</span></span>
          </div>

          <div className="auth-story-content">
            <h2>Every class,<br />under control<span className="auth-story-period">.</span></h2>
            <p>Less time managing lists. More time knowing how your class is doing.</p>
            <div className="auth-story-highlights">
              {highlights.map(({ icon, title, detail }) => (
                <div className="auth-story-highlight" key={title}>
                  <span className="auth-story-highlight-icon">{icon}</span>
                  <div><strong>{title}</strong><span>{detail}</span></div>
                </div>
              ))}
            </div>
          </div>

          <span className="auth-story-footnote">YOUR CLASS. YOUR PACE. ONE SIMPLE PLACE.</span>
        </aside>
        <div className="auth-form-panel">{children}</div>
      </div>
    </main>
  );
}
