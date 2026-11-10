import { useEffect, useState } from "react";

const taskTypes = [
  { value: "CODE", label: "Software & code" },
  { value: "RESEARCH", label: "Research & analysis" },
  { value: "DOCUMENT", label: "Documents & writing" },
  { value: "BUSINESS", label: "Business & strategy" },
  { value: "CREATIVE", label: "Creative work" },
  { value: "OTHER", label: "Something else" }
];

function Mark() {
  return <span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>;
}

function Icon({ name }) {
  const paths = {
    plus: <><path d="M12 5v14M5 12h14" /></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
    layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></>,
    shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" /><path d="m9 12 2 2 4-4" /></>,
    activity: <><path d="M3 12h4l3-8 4 16 3-8h4" /></>,
    book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 0 4 22V5.5Z" /><path d="M4 17a2.5 2.5 0 0 1 2.5-2.5H20" /></>
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export default function App() {
  const [health, setHealth] = useState("checking");
  const [showComposer, setShowComposer] = useState(false);
  const [taskType, setTaskType] = useState("CODE");
  const [objective, setObjective] = useState("");
  const [context, setContext] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/health")
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("API unavailable")))
      .then((data) => { if (active) setHealth(data.ok ? "online" : "offline"); })
      .catch(() => { if (active) setHealth("offline"); });
    return () => { active = false; };
  }, []);

  function prepareSession(event) {
    event.preventDefault();
    if (!objective.trim()) return;
    setNotice("Your task brief is ready. Account sign-in and durable session creation are the next integration milestone.");
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="OUTPERFORM home">
          <Mark />
          <span>OUTPERFORM</span>
        </a>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="nav-list" aria-label="Main navigation">
          <button className="nav-item active" type="button"><Icon name="layers" /> Overview</button>
          <button className="nav-item" type="button" onClick={() => setShowComposer(true)}><Icon name="plus" /> New session</button>
          <button className="nav-item" type="button" disabled><Icon name="activity" /> Experiments <span className="nav-soon">SOON</span></button>
          <button className="nav-item" type="button" disabled><Icon name="book" /> Strategy library <span className="nav-soon">SOON</span></button>
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-status">
            <span className={health === "online" ? "status-dot online" : "status-dot"} />
            <span>Engine {health === "checking" ? "checking" : health}</span>
          </div>
          <div className="sidebar-version">EARLY ACCESS BUILD · 0.1</div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">Workspace <span>/</span> Overview</div>
          <div className="topbar-right"><span className="private-label"><Icon name="shield" /> Private workspace</span><div className="avatar">O</div></div>
        </header>

        <section className="hero">
          <div className="eyebrow"><span className="eyebrow-line" /> THE WORK IMPROVEMENT ENGINE</div>
          <h1>Good work is a starting point.</h1>
          <p className="hero-copy">Bring an idea, a draft, a project or finished work. Challenge it, improve it and see exactly what got better.</p>
          <button className="primary-button" onClick={() => { setShowComposer(true); setNotice(""); }}>
            <Icon name="plus" /> Start with your work <Icon name="arrow" />
          </button>
        </section>

        <section className="principles">
          <article className="principle">
            <div className="principle-icon"><Icon name="layers" /></div>
            <div><h3>Start anywhere</h3><p>From a rough idea to a finished deliverable. Your context and constraints come first.</p></div>
          </article>
          <article className="principle">
            <div className="principle-icon"><Icon name="activity" /></div>
            <div><h3>Challenge the result</h3><p>Independent alternatives and targeted challenges expose what a first pass can miss.</p></div>
          </article>
          <article className="principle">
            <div className="principle-icon"><Icon name="shield" /></div>
            <div><h3>Prove the difference</h3><p>Keep the original. Verify changes. See evidence, regressions and remaining risks.</p></div>
          </article>
        </section>

        <section className="work-area">
          <div className="section-heading"><div><span className="section-kicker">YOUR WORK</span><h2>Improvement sessions</h2></div><span className="empty-count">0 sessions</span></div>
          <div className="empty-state">
            <div className="empty-symbol"><Mark /></div>
            <h3>Your next breakthrough starts here.</h3>
            <p>There are no sessions yet. Start with something you're working on and give it room to get better.</p>
            <button className="text-button" onClick={() => { setShowComposer(true); setNotice(""); }}>Create your first session <Icon name="arrow" /></button>
          </div>
        </section>

        <footer className="footer"><span>OUTPERFORM</span><span>Better work. Backed by evidence.</span></footer>
      </main>

      {showComposer && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowComposer(false); }}>
          <section className="composer" role="dialog" aria-modal="true" aria-labelledby="composer-title">
            <div className="composer-header"><div><span className="section-kicker">NEW WORK SESSION</span><h2 id="composer-title">What are we improving?</h2></div><button className="close-button" onClick={() => setShowComposer(false)} aria-label="Close">×</button></div>
            <form onSubmit={prepareSession}>
              <label htmlFor="task-type">What kind of work is this?</label>
              <select id="task-type" value={taskType} onChange={(event) => setTaskType(event.target.value)}>{taskTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
              <label htmlFor="objective">What do you want to achieve?</label>
              <textarea id="objective" value={objective} onChange={(event) => setObjective(event.target.value)} placeholder="Describe the outcome you want—not just the steps you think are needed." rows={3} required />
              <label htmlFor="context">What should we know? <span>Optional</span></label>
              <textarea id="context" value={context} onChange={(event) => setContext(event.target.value)} placeholder="Paste existing work, context, constraints, links or known problems." rows={5} />
              {notice && <p className="notice" role="status">{notice}</p>}
              <div className="composer-actions"><button type="button" className="secondary-button" onClick={() => setShowComposer(false)}>Cancel</button><button type="submit" className="primary-button" disabled={!objective.trim()}>Prepare session <Icon name="arrow" /></button></div>
            </form>
            <p className="composer-note">Your original work will be preserved. No changes are applied without your approval.</p>
          </section>
        </div>
      )}
    </div>
  );
}
