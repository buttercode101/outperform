import { useEffect, useState } from "react";
import { authClient } from "./lib/auth-client.js";

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

function AuthScreen() {
  const [mode, setMode] = useState("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = mode === "signup"
        ? await authClient.signUp.email({ name: name.trim(), email: email.trim(), password })
        : await authClient.signIn.email({ email: email.trim(), password });
      if (result.error) throw new Error(result.error.message || "Authentication failed.");
    } catch (e) {
      setError(e.message || "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-screen">
      <a className="brand auth-brand" href="/"><Mark /><span>OUTPERFORM</span></a>
      <section className="auth-panel">
        <span className="section-kicker">PRIVATE WORKSPACE</span>
        <h1>{mode === "signup" ? "Create your workspace." : "Welcome back."}</h1>
        <p>Better work starts with a clear objective. Sign in to continue.</p>
        <form onSubmit={submit}>
          {mode === "signup" && <><label htmlFor="auth-name">Your name</label><input id="auth-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required /></>}
          <label htmlFor="auth-email">Email address</label>
          <input id="auth-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          <label htmlFor="auth-password">Password</label>
          <input id="auth-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={10} required />
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button auth-submit" disabled={busy}>{busy ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"} <Icon name="arrow" /></button>
        </form>
        <p className="auth-switch">{mode === "signup" ? "Already have an account?" : "New to OUTPERFORM?"} <button onClick={() => { setMode(mode === "signup" ? "signin" : "signup"); setError(""); }}>{mode === "signup" ? "Sign in" : "Create an account"}</button></p>
        <p className="auth-footnote">Private by default. Your work is not published or shared.</p>
      </section>
    </main>
  );
}

function Status({ value }) {
  const labels = {
    CREATED: "Not started", UNDERSTANDING: "Understanding", BASELINING: "Capturing baseline",
    EXECUTING: "Working", CHALLENGING: "Challenging", EVALUATING: "Evaluating",
    IMPROVING: "Improving", VERIFYING: "Verifying", AWAITING_APPROVAL: "Ready to review",
    BLOCKED: "Needs setup", COMPLETED: "Completed", FAILED: "Failed", CANCELLED: "Cancelled"
  };
  return <span className={`session-status status-${value?.toLowerCase()}`}><i />{labels[value] || value}</span>;
}


function GuestWorkspace({ onSignIn }) {
  const [items, setItems] = useState(() => {
    try { return JSON.parse(localStorage.getItem("outperform_guest_work") || "[]"); }
    catch { return []; }
  });
  const [objective, setObjective] = useState("");
  const [taskType, setTaskType] = useState("CODE");
  const [context, setContext] = useState("");
  const [requirements, setRequirements] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    try { localStorage.setItem("outperform_guest_work", JSON.stringify(items)); }
    catch { setNotice("This browser could not save locally. Export your brief to keep a copy."); }
  }, [items]);

  function createBrief(event) {
    event.preventDefault();
    if (!objective.trim()) return;
    const item = {
      id: crypto.randomUUID(), taskType, objective: objective.trim(),
      context: context.trim(),
      requirements: requirements.split("\\n").map(x => x.trim()).filter(Boolean),
      createdAt: new Date().toISOString()
    };
    setItems(current => [item, ...current]);
    setObjective(""); setContext(""); setRequirements("");
    setNotice("Your work brief is saved in this browser. Nothing has been uploaded.");
  }

  function exportBrief(item) {
    const markdown = [
      "# OUTPERFORM — Work brief", "",
      "**Type:** " + item.taskType, "**Created:** " + new Date(item.createdAt).toLocaleString(), "",
      "## Objective", item.objective, "",
      "## Success criteria", ...(item.requirements.length ? item.requirements.map(x => "- " + x) : ["- Define measurable success criteria."]), "",
      "## Existing work and context", item.context || "No additional context supplied.", "",
      "## Next steps", "- Establish the baseline and preserve the original.", "- Identify assumptions, risks and missing information.", "- Produce an improved candidate.", "- Verify each success criterion with evidence.", "",
      "_Guest workspace export. AI execution, durable workflow, cloud history and review are available after creating a free account._"
    ].join("\\n");
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = "outperform-work-brief.md"; link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="guest-screen">
      <header className="guest-header">
        <a className="brand" href="/"><Mark /><span>OUTPERFORM</span></a>
        <div className="guest-actions"><span className="guest-label">GUEST MODE · SAVED ON THIS DEVICE</span><button className="secondary-button" onClick={onSignIn}>Sign in / Create account</button></div>
      </header>
      <section className="guest-hero">
        <span className="eyebrow"><span className="eyebrow-line" /> THE WORK IMPROVEMENT ENGINE</span>
        <h1>Start with the work.<br/>No account required.</h1>
        <p>Shape an idea, draft or project into a clear work brief. Save it in this browser and export it whenever you like. Create an account only when you want OUTPERFORM to run the AI improvement workflow and keep your work in the cloud.</p>
      </section>
      <section className="guest-grid">
        <form className="guest-composer" onSubmit={createBrief}>
          <div className="section-heading"><div><span className="section-kicker">FREE · NO SIGN-UP</span><h2>Build a work brief</h2></div></div>
          <label htmlFor="guest-type">Type of work</label>
          <select id="guest-type" value={taskType} onChange={e => setTaskType(e.target.value)}>{taskTypes.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
          <label htmlFor="guest-objective">What are you trying to achieve?</label>
          <textarea id="guest-objective" rows={3} required value={objective} onChange={e => setObjective(e.target.value)} placeholder="Describe the outcome you want to improve…" />
          <label htmlFor="guest-requirements">What does success look like? <span>One per line · optional</span></label>
          <textarea id="guest-requirements" rows={3} value={requirements} onChange={e => setRequirements(e.target.value)} placeholder={"Clear, measurable outcome\nPreserve what already works\nEvidence for important claims"} />
          <label htmlFor="guest-context">Existing work or context <span>Optional</span></label>
          <textarea id="guest-context" rows={4} value={context} onChange={e => setContext(e.target.value)} placeholder="Paste notes, a draft, requirements or background…" />
          {notice && <p className="notice" role="status">{notice}</p>}
          <button className="primary-button" type="submit" disabled={!objective.trim()}><Icon name="plus" /> Save work brief <Icon name="arrow" /></button>
          <p className="composer-note">Your brief stays in this browser. It is not sent to OUTPERFORM servers.</p>
        </form>
        <section className="guest-library">
          <div className="section-heading"><div><span className="section-kicker">YOUR DEVICE</span><h2>Saved briefs</h2></div><span className="empty-count">{items.length}</span></div>
          {items.length === 0 ? <div className="empty-state"><div className="empty-symbol"><Mark /></div><h3>Your work, your starting point.</h3><p>Create a brief. It will be saved locally on this device, without registration.</p></div> :
            <div className="session-list">{items.map(item => <article className="session-row" key={item.id}><div className="session-main"><span className="session-type">{item.taskType}</span><h3>{item.objective}</h3><span className="session-date">{new Date(item.createdAt).toLocaleString()}</span></div><div className="session-actions"><button className="small-action" onClick={() => exportBrief(item)}>Export <Icon name="arrow" /></button></div></article>)}</div>}
        </section>
      </section>
      <section className="guest-upgrade">
        <div><span className="section-kicker">WHEN YOU NEED MORE</span><h2>Keep going with an account.</h2><p>Free account registration unlocks cloud-saved sessions, the AI execution and challenge workflow, candidate comparisons, final reviews and decisions across devices.</p></div>
        <button className="primary-button" onClick={onSignIn}>Create a free account <Icon name="arrow" /></button>
      </section>
      <footer className="footer"><span>OUTPERFORM</span><span>Better work. Backed by evidence.</span></footer>
    </main>
  );
}

export default function App() {
  const { data: authSession, isPending: authPending } = authClient.useSession();
  const [health, setHealth] = useState("checking");
  const [sessions, setSessions] = useState([]);
  const [showComposer, setShowComposer] = useState(false);
  const [taskType, setTaskType] = useState("CODE");
  const [objective, setObjective] = useState("");
  const [context, setContext] = useState("");
  const [requirementsText, setRequirementsText] = useState("");
  const [constraintsText, setConstraintsText] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState(null);
  const [selectedContent, setSelectedContent] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);

  async function loadSessions() {
    const response = await fetch("/api/sessions");
    if (!response.ok) throw new Error("Could not load sessions.");
    const data = await response.json();
    setSessions(data.sessions || []);
  }

  useEffect(() => {
    let active = true;
    fetch("/api/health").then((r) => r.json()).then((data) => {
      if (active) setHealth(data.ok ? (data.authenticationConfigured && data.modelProviderConfigured ? "ready" : "setup") : "offline");
    }).catch(() => { if (active) setHealth("offline"); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!authSession?.user) return;
    let active = true;
    const refresh = () => loadSessions().catch(() => {});
    refresh();
    const interval = window.setInterval(refresh, 5000);
    return () => { active = false; window.clearInterval(interval); };
  }, [authSession?.user?.id]);

  async function submitSession(event) {
    event.preventDefault();
    if (!objective.trim()) return;
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          taskType, objective, context,
          requirements: requirementsText.split("\n").map((line) => line.trim()).filter(Boolean).map((description) => ({ description, source: "USER", mandatory: true })),
          constraints: constraintsText.split("\n").map((line) => line.trim()).filter(Boolean).map((description) => ({ description, type: "OTHER" }))
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || data.error || "Could not create the session.");
      setShowComposer(false);
      setObjective("");
      setContext("");
      setRequirementsText("");
      setConstraintsText("");
      await loadSessions();
      const startResponse = await fetch(`/api/sessions/${data.session.id}/start`, { method: "POST" });
      if (!startResponse.ok) {
        const startError = await startResponse.json();
        throw new Error(startError.message || startError.error || "Session created but could not be started.");
      }
      await loadSessions();
    } catch (e) {
      setNotice(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function startSession(session) {
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch(`/api/sessions/${session.id}/start`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || data.error || "Could not start session.");
      await loadSessions();
    } catch (e) {
      setNotice(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function openSession(session) {
    setDetailLoading(true);
    setSelected({ session, detail: null });
    setSelectedContent("");
    try {
      const response = await fetch(`/api/sessions/${session.id}`);
      const detail = await response.json();
      if (!response.ok) throw new Error(detail.message || "Could not load session.");
      const best = detail.artifacts.find((item) => item.id === detail.session.bestArtifactId);
      if (best) {
        const artifactResponse = await fetch(`/api/sessions/${session.id}/artifacts/${best.id}`);
        const artifact = await artifactResponse.json();
        if (artifactResponse.ok) setSelectedContent(artifact.content || "");
      }
      setSelected({ session, detail });
    } catch (e) {
      setNotice(e.message);
    } finally {
      setDetailLoading(false);
    }
  }

  async function decideSession(decision) {
    if (!selected?.session?.id) return;
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch(`/api/sessions/${selected.session.id}/decision`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || data.error || "Could not save your decision.");
      setSelected(null);
      await loadSessions();
      setNotice(decision === "APPROVE" ? "You approved this result." : "You rejected this result. The session is closed; start a new session to try a different direction.");
    } catch (e) {
      setNotice(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (authPending) return <div className="boot-screen"><Mark /><span>Loading your workspace…</span></div>;
  if (!authSession?.user) return new URLSearchParams(window.location.search).has("account") ? <AuthScreen /> : <GuestWorkspace onSignIn={() => { window.location.href = "/?account=1"; }} />;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="OUTPERFORM home"><Mark /><span>OUTPERFORM</span></a>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="nav-list" aria-label="Main navigation">
          <button className="nav-item active" type="button"><Icon name="layers" /> Overview</button>
          <button className="nav-item" type="button" onClick={() => { setShowComposer(true); setNotice(""); }}><Icon name="plus" /> New session</button>
          <button className="nav-item" type="button" disabled><Icon name="activity" /> Experiments <span className="nav-soon">SOON</span></button>
          <button className="nav-item" type="button" disabled><Icon name="book" /> Strategy library <span className="nav-soon">SOON</span></button>
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-status"><span className={health === "ready" ? "status-dot online" : health === "setup" ? "status-dot setup" : "status-dot"} /><span>Engine {health}</span></div>
          <div className="sidebar-version">EARLY ACCESS BUILD · 0.1</div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">Workspace <span>/</span> Overview</div>
          <div className="topbar-right"><span className="private-label"><Icon name="shield" /> Private workspace</span><span className="user-email">{authSession.user.email}</span><button className="signout-button" onClick={() => authClient.signOut()}>Sign out</button><div className="avatar">{(authSession.user.name || "O").slice(0,1).toUpperCase()}</div></div>
        </header>

        <section className="hero">
          <div className="eyebrow"><span className="eyebrow-line" /> THE WORK IMPROVEMENT ENGINE</div>
          <h1>Good work is a starting point.</h1>
          <p className="hero-copy">Bring an idea, a draft, a project or finished work. Challenge it, improve it and see exactly what got better.</p>
          <button className="primary-button" onClick={() => { setShowComposer(true); setNotice(""); }}><Icon name="plus" /> Start with your work <Icon name="arrow" /></button>
        </section>

        <section className="principles">
          <article className="principle"><div className="principle-icon"><Icon name="layers" /></div><div><h3>Start anywhere</h3><p>From a rough idea to a finished deliverable. Your context and constraints come first.</p></div></article>
          <article className="principle"><div className="principle-icon"><Icon name="activity" /></div><div><h3>Challenge the result</h3><p>Independent alternatives and targeted challenges expose what a first pass can miss.</p></div></article>
          <article className="principle"><div className="principle-icon"><Icon name="shield" /></div><div><h3>Prove the difference</h3><p>Keep the original. Verify changes. See evidence, regressions and remaining risks.</p></div></article>
        </section>

        <section className="work-area">
          <div className="section-heading"><div><span className="section-kicker">YOUR WORK</span><h2>Improvement sessions</h2></div><span className="empty-count">{sessions.length} {sessions.length === 1 ? "session" : "sessions"}</span></div>
          {notice && <p className="notice" role="status">{notice}</p>}
          {sessions.length === 0 ? (
            <div className="empty-state"><div className="empty-symbol"><Mark /></div><h3>Your next breakthrough starts here.</h3><p>There are no sessions yet. Start with something you're working on and give it room to get better.</p><button className="text-button" onClick={() => setShowComposer(true)}>Create your first session <Icon name="arrow" /></button></div>
          ) : (
            <div className="session-list">{sessions.map((session) => (
              <article className="session-row" key={session.id}>
                <div className="session-main"><span className="session-type">{session.task_type}</span><h3>{session.objective}</h3><span className="session-date">{new Date(session.updated_at).toLocaleString()}</span></div>
                <div className="session-actions"><Status value={session.status} />{["CREATED","BLOCKED"].includes(session.status) && <button className="small-action" disabled={busy} onClick={() => startSession(session)}>Run <Icon name="arrow" /></button>}{["AWAITING_APPROVAL","COMPLETED","FAILED","CANCELLED"].includes(session.status) && <button className="small-action" onClick={() => openSession(session)}>Review <Icon name="arrow" /></button>}</div>
              </article>
            ))}</div>
          )}
        </section>
        <footer className="footer"><span>OUTPERFORM</span><span>Better work. Backed by evidence.</span></footer>
      </main>

      {showComposer && <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowComposer(false); }}>
        <section className="composer" role="dialog" aria-modal="true" aria-labelledby="composer-title">
          <div className="composer-header"><div><span className="section-kicker">NEW WORK SESSION</span><h2 id="composer-title">What are we improving?</h2></div><button className="close-button" onClick={() => setShowComposer(false)} aria-label="Close">×</button></div>
          <form onSubmit={submitSession}>
            <label htmlFor="task-type">What kind of work is this?</label><select id="task-type" value={taskType} onChange={(e) => setTaskType(e.target.value)}>{taskTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
            <label htmlFor="objective">What do you want to achieve?</label><textarea id="objective" value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="Describe the outcome you want—not just the steps you think are needed." rows={3} required />
            <label htmlFor="requirements">What must a successful result achieve? <span>One requirement per line</span></label><textarea id="requirements" value={requirementsText} onChange={(e) => setRequirementsText(e.target.value)} placeholder={"Preserve the original work\nAddress every critical issue\nProvide evidence for factual claims"} rows={3} />
            <label htmlFor="constraints">What must it avoid or respect? <span>Optional · One per line</span></label><textarea id="constraints" value={constraintsText} onChange={(e) => setConstraintsText(e.target.value)} placeholder={"Do not change the public API\nKeep within the existing budget"} rows={2} />
            <label htmlFor="context">Existing work and background <span>Optional</span></label><textarea id="context" value={context} onChange={(e) => setContext(e.target.value)} placeholder="Paste an existing draft, code, research, files or relevant background." rows={5} />
            {notice && <p className="notice" role="alert">{notice}</p>}
            <div className="composer-actions"><button type="button" className="secondary-button" onClick={() => setShowComposer(false)}>Cancel</button><button type="submit" className="primary-button" disabled={busy || !objective.trim()}>{busy ? "Creating…" : "Create and run"} <Icon name="arrow" /></button></div>
          </form>
          <p className="composer-note">Your original work will be preserved. AI evaluation is not the same as independent verification.</p>
        </section>
      </div>}

      {selected && <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setSelected(null); }}>
        <section className="review-panel" role="dialog" aria-modal="true" aria-labelledby="review-title">
          <div className="composer-header"><div><span className="section-kicker">SESSION REVIEW</span><h2 id="review-title">{selected.session.objective}</h2></div><button className="close-button" onClick={() => setSelected(null)} aria-label="Close">×</button></div>
          {detailLoading ? <p>Loading session evidence…</p> : selected.detail && <>
            <div className="review-meta"><Status value={selected.detail.session.status} /><span>{selected.detail.artifacts.length} candidate artifacts</span></div>
            <div className="verification-note"><Icon name="shield" /> AI-selected candidate · Not independently verified</div>
            {(() => {
              const evaluation = selected.detail.events.find((event) => event.event_type === "RESULT_READY_FOR_REVIEW")?.payload?.comparativeEvaluation || selected.detail.events.find((event) => event.event_type === "RESULT_READY_FOR_REVIEW")?.payload?.evaluation;
              return evaluation ? <section className="evaluation-summary">
                <h3>Comparative assessment</h3>
                <p>{evaluation.rationale}</p>
                {evaluation.strengths?.length > 0 && <><strong>Strengths identified</strong><ul>{evaluation.strengths.map((item, i) => <li key={i}>{item}</li>)}</ul></>}
                {evaluation.risks?.length > 0 && <><strong>Risks to consider</strong><ul>{evaluation.risks.map((item, i) => <li key={i}>{item}</li>)}</ul></>}
                <span>Model-generated assessment. Not external fact-checking or independent verification.</span>
              </section> : null;
            })()}
            {(selected.detail.requirements?.length > 0 || selected.detail.constraints?.length > 0) && <section className="criteria-review">
              {selected.detail.requirements?.length > 0 && <><h3>Acceptance criteria</h3><ul>{selected.detail.requirements.map((item) => <li key={item.id}>{item.description}</li>)}</ul></>}
              {selected.detail.constraints?.length > 0 && <><h3>Constraints</h3><ul>{selected.detail.constraints.map((item) => <li key={item.id}>{item.description}</li>)}</ul></>}
            </section>}
            {(() => {
              const finalReview = selected.detail.events.find((event) => event.event_type === "FINAL_REVIEW_COMPLETED")?.payload?.review;
              return finalReview ? <section className="final-review-summary">
                <h3>Final criteria review</h3>
                <p>{finalReview.assessment}</p>
                {finalReview.criteriaCoverage?.length > 0 && <><strong>Criteria coverage</strong><ul>{finalReview.criteriaCoverage.map((item, i) => <li key={i}>{typeof item === "string" ? item : JSON.stringify(item)}</li>)}</ul></>}
                {finalReview.remainingRisks?.length > 0 && <><strong>Remaining risks</strong><ul>{finalReview.remainingRisks.map((item, i) => <li key={i}>{typeof item === "string" ? item : JSON.stringify(item)}</li>)}</ul></>}
                {finalReview.unverifiedClaims?.length > 0 && <><strong>Claims needing verification</strong><ul>{finalReview.unverifiedClaims.map((item, i) => <li key={i}>{typeof item === "string" ? item : JSON.stringify(item)}</li>)}</ul></>}
                <span>AI review only. No external verification has been performed.</span>
              </section> : null;
            })()}
            <h3 className="review-subhead">Selected work</h3>
            <pre className="artifact-content">{selectedContent || "No selected artifact is available yet."}</pre>
            {selected.detail.session.status === "AWAITING_APPROVAL" && <div className="decision-actions">
              <div><strong>Does this meet your objective?</strong><span>Your decision is recorded in the session history.</span></div>
              <button className="secondary-button" disabled={busy} onClick={() => decideSession("REJECT")}>Reject result</button>
              <button className="primary-button" disabled={busy} onClick={() => decideSession("APPROVE")}>{busy ? "Saving…" : "Approve result"} <Icon name="arrow" /></button>
            </div>}
            <h3 className="review-subhead">Session history</h3>
            <div className="event-list">{selected.detail.events.map((event, i) => <div className="event-row" key={i}><span>{event.event_type.replaceAll("_"," ").toLowerCase()}</span><time>{new Date(event.occurred_at).toLocaleString()}</time></div>)}</div>
          </>}
        </section>
      </div>}
    </div>
  );
}
