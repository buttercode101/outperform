import { useEffect, useRef, useState } from "react";
import { authClient } from "./lib/auth-client.js";
import { assessBriefCompleteness } from "./domain/brief-readiness.js";
import { buildGuestPrompt } from "./domain/guest-prompt.js";
import { buildFollowUpContext } from "./domain/follow-up.js";
import { buildLineDiff } from "./domain/line-diff.js";

const taskTypes = [
  { value: "CODE", label: "Software & code" },
  { value: "RESEARCH", label: "Research & analysis" },
  { value: "DOCUMENT", label: "Documents & writing" },
  { value: "BUSINESS", label: "Business & strategy" },
  { value: "CREATIVE", label: "Creative work" },
  { value: "OTHER", label: "Something else" }
];

function useThemePreference() {
  const [theme, setTheme] = useState(() => {
    let stored = null;
    try { stored = window.localStorage.getItem("outperform_theme"); } catch {}
    const selected = stored === "light" || stored === "dark"
      ? stored
      : (window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light");
    document.documentElement.dataset.theme = selected;
    return selected;
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.setAttribute("content", theme === "dark" ? "#111712" : "#f4f3ef");
    try { window.localStorage.setItem("outperform_theme", theme); } catch {}
  }, [theme]);

  return [theme, () => setTheme((current) => current === "dark" ? "light" : "dark")];
}

function useDialogAccessibility(isOpen, onClose) {
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const previousFocus = document.activeElement;
    const dialog = dialogRef.current;
    const getFocusable = () => Array.from(dialog?.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    ) || []).filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");

    const focusable = getFocusable();
    (focusable[0] || dialog)?.focus();

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current?.();
        return;
      }
      if (event.key !== "Tab") return;

      const current = getFocusable();
      if (!current.length) {
        event.preventDefault();
        dialog?.focus();
        return;
      }

      const first = current[0];
      const last = current[current.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialog?.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog?.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus?.();
    };
  }, [isOpen]);

  return dialogRef;
}

function downloadTextFile(filename, text, mimeType = "text/markdown;charset=utf-8") {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.hidden = true;
  document.body.appendChild(link);
  link.click();
  // Keep the object URL alive long enough for mobile browsers to begin the download.
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
    link.remove();
  }, 1000);
}

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
    book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 0 4 22V5.5Z" /><path d="M4 17a2.5 2.5 0 0 1 2.5-2.5H20" /></>,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" /></>,
    moon: <path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.804a6.5 6.5 0 0 0 8.27 8.27c.344-.215.826-.003.801.398Z" />
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function ThemeToggle({ theme, onToggle, className = "" }) {
  const nextTheme = theme === "dark" ? "light" : "dark";
  return (
    <button
      className={`theme-toggle ${className}`.trim()}
      type="button"
      onClick={onToggle}
      aria-label={`Switch to ${nextTheme} mode`}
      title={`Switch to ${nextTheme} mode`}
    >
      <Icon name={theme === "dark" ? "sun" : "moon"} />
    </button>
  );
}

function AuthScreen({ theme, onToggleTheme }) {
  const [mode, setMode] = useState(new URLSearchParams(window.location.search).get("mode") === "signup" ? "signup" : "signin");
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
      <ThemeToggle theme={theme} onToggle={onToggleTheme} className="auth-theme-toggle" />
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
        <p className="auth-switch"><button onClick={() => window.location.replace("/")}>Continue without an account</button></p>
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


function GuestWorkspace({ onSignIn, theme, onToggleTheme }) {
  const [items, setItems] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("outperform_guest_work") || "[]");
      return Array.isArray(stored)
        ? stored.filter((item) => item && typeof item === "object" && typeof item.id === "string").map((item) => ({
            ...item,
            taskType: typeof item.taskType === "string" ? item.taskType : "OTHER",
            objective: typeof item.objective === "string" ? item.objective : "",
            context: typeof item.context === "string" ? item.context : "",
            requirements: Array.isArray(item.requirements) ? item.requirements.filter((value) => typeof value === "string") : [],
            createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString()
          }))
        : [];
    } catch { return []; }
  });
  const [objective, setObjective] = useState("");
  const [taskType, setTaskType] = useState("CODE");
  const [context, setContext] = useState("");
  const [requirements, setRequirements] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [notice, setNotice] = useState("");
  const readiness = assessBriefCompleteness({
    objective,
    context,
    requirements: requirements.split("\n").map((item) => item.trim()).filter(Boolean)
  });
  const guestPlaybooks = [
    { value: "CODE", name: "Engineering hardening", objective: "Improve this software deliverable while preserving existing behaviour, security boundaries and maintainability.", criteria: ["Preserve working functionality","Identify correctness, security, performance and accessibility risks","Propose concrete changes and trade-offs","Define tests that would demonstrate correctness","List what still needs execution or human verification"] },
    { value: "RESEARCH", name: "Evidence-led research", objective: "Produce a decision-ready research brief with traceable claims, counter-evidence and explicit uncertainty.", criteria: ["Separate facts, estimates, assumptions and opinions","Identify credible primary sources and dates","Test the strongest counterargument","Resolve contradictions between sources","List remaining evidence gaps"] },
    { value: "DOCUMENT", name: "Document excellence", objective: "Improve this document for its intended audience while preserving its meaning and required details.", criteria: ["Preserve material facts and commitments","Improve structure, clarity and readability","Remove ambiguity and unsupported claims","Check consistency of names, dates and numbers","Explain material changes and unresolved ambiguities"] },
    { value: "BUSINESS", name: "Business decision stress-test", objective: "Stress-test this business decision and produce a stronger, evidence-aware action plan.", criteria: ["Clarify the decision and assumptions","Identify customer, market, operational and financial risks","Challenge assumptions with counter-scenarios","Compare alternatives and opportunity costs","Define indicators, stop conditions and next actions"] },
    { value: "CREATIVE", name: "Creative concept challenger", objective: "Develop a distinctive creative direction that fulfils the brief and is meaningfully stronger than conventional alternatives.", criteria: ["Stay faithful to the audience and constraints","Generate meaningfully different directions","Explain the distinctive idea and intended effect","Identify clichés and execution risks","Recommend one direction and next steps"] }
  ];

  useEffect(() => {
    try { localStorage.setItem("outperform_guest_work", JSON.stringify(items)); }
    catch { setNotice("This browser could not save locally. Export your brief to keep a copy."); }
  }, [items]);

  function createBrief(event) {
    event.preventDefault();
    if (!objective.trim()) return;
    if (editingId) {
      const updated = {
        id: editingId, taskType, objective: objective.trim(),
        context: context.trim(),
        requirements: requirements.split("\n").map(x => x.trim()).filter(Boolean),
        createdAt: items.find((item) => item.id === editingId)?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      setItems(current => current.map(item => item.id === editingId ? updated : item));
      setNotice("Your brief has been updated and saved on this device.");
    } else {
      const item = {
        id: crypto.randomUUID(), taskType, objective: objective.trim(),
        context: context.trim(),
        requirements: requirements.split("\n").map(x => x.trim()).filter(Boolean),
        createdAt: new Date().toISOString()
      };
      setItems(current => [item, ...current]);
      setNotice("Your work brief is saved in this browser. Nothing has been uploaded.");
    }
    setEditingId(null); setObjective(""); setContext(""); setRequirements("");
  }

  function editBrief(item) {
    setEditingId(item.id);
    setTaskType(item.taskType || "OTHER");
    setObjective(item.objective || "");
    setContext(item.context || "");
    setRequirements((item.requirements || []).join("\n"));
    setNotice("Editing a local brief. Save changes when ready.");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function deleteBrief(id) {
    if (!window.confirm("Delete this local brief? This cannot be undone.")) return;
    setItems(current => current.filter((item) => item.id !== id));
    if (editingId === id) { setEditingId(null); setObjective(""); setContext(""); setRequirements(""); }
    setNotice("The local brief was deleted from this browser.");
  }

  function cancelEdit() {
    setEditingId(null); setObjective(""); setContext(""); setRequirements("");
    setNotice("Changes discarded.");
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
    ].join("\n");
    downloadTextFile("outperform-work-brief.md", markdown);
  }

  function exportPrompt(item) {
    const markdown = buildGuestPrompt(item);
    downloadTextFile("outperform-ready-to-use-prompt.md", markdown);
    setNotice("Your reusable improvement prompt was exported. It was generated locally and has not been uploaded.");
  }

  return (
    <main className="guest-screen">
      <header className="guest-header">
        <a className="brand" href="/"><Mark /><span>OUTPERFORM</span></a>
        <div className="guest-actions"><span className="guest-label">GUEST MODE · SAVED ON THIS DEVICE</span><ThemeToggle theme={theme} onToggle={onToggleTheme} /><button className="secondary-button" onClick={onSignIn}>Sign in / Create account</button></div>
      </header>
      <section className="guest-hero">
        <span className="eyebrow"><span className="eyebrow-line" /> THE WORK IMPROVEMENT & PROOF ENGINE</span>
        <h1>Start with the work.<br/>No account required.</h1>
        <p>Shape an idea, draft or project into a work brief. Get live completeness guidance, save it on this device, then export the brief or a reusable AI prompt for any model. No account is needed for these tools. Create a free account only when you want OUTPERFORM’s cloud AI workflow, iterative improvement passes and cross-device history.</p>
      </section>
      <section className="guest-grid">
        <form className="guest-composer" onSubmit={createBrief}>
          <div className="section-heading"><div><span className="section-kicker">FREE · NO SIGN-UP</span><h2>Build a work brief</h2></div></div>
          <section className="brief-completeness" aria-live="polite">
            <div className="brief-completeness-top"><div><span className="section-kicker">LOCAL CHECK · NO UPLOAD</span><strong>Brief completeness</strong></div><span className="brief-completeness-count">{readiness.completed}/{readiness.total}</span></div>
            <div className="brief-completeness-track" role="progressbar" aria-label="Brief completeness" aria-valuemin={0} aria-valuemax={100} aria-valuenow={readiness.percentage}><span style={{ width: readiness.percentage + "%" }} /></div>
            <ul>{readiness.checks.map((check) => <li key={check.id} className={check.complete ? "complete" : ""}><span aria-hidden="true">{check.complete ? "✓" : "○"}</span><span>{check.label}</span><small>{check.complete ? "Included" : check.guidance}</small></li>)}</ul>
            <p>{readiness.note}</p>
          </section>
          <label htmlFor="guest-type">Type of work</label>
          <select id="guest-type" value={taskType} onChange={e => setTaskType(e.target.value)}>{taskTypes.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
          <label htmlFor="guest-playbook">Start from a playbook <span>Optional · edit the brief freely</span></label>
          <select id="guest-playbook" defaultValue="" onChange={(e) => { const template = guestPlaybooks.find((item) => item.value === e.target.value); if (template) { setTaskType(template.value); setObjective(template.objective); setRequirements(template.criteria.join("\n")); setNotice(template.name + " loaded. Edit the objective and criteria before saving."); } e.target.value = ""; }}><option value="">Blank brief</option>{guestPlaybooks.map((item) => <option key={item.value} value={item.value}>{item.name}</option>)}</select>
          <label htmlFor="guest-objective">What are you trying to achieve?</label>
          <textarea id="guest-objective" rows={3} required value={objective} onChange={e => setObjective(e.target.value)} placeholder="Describe the outcome you want to improve…" />
          <label htmlFor="guest-requirements">What does success look like? <span>One per line · optional</span></label>
          <textarea id="guest-requirements" rows={3} value={requirements} onChange={e => setRequirements(e.target.value)} placeholder={"Clear, measurable outcome\nPreserve what already works\nEvidence for important claims"} />
          <label htmlFor="guest-context">Existing work or context <span>Optional · paste or import a text file up to 100 KB</span></label>
          <input className="file-input" type="file" accept=".txt,.md,.markdown,.json,.csv,.html,.xml,.yaml,.yml" aria-label="Import a text file" onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; if (file.size > 100000) { setNotice("This file is larger than 100 KB. Paste a smaller excerpt instead."); e.target.value = ""; return; } try { setContext(await file.text()); setNotice("Loaded " + file.name + " into the brief. It remains local until you export it."); } catch { setNotice("Could not read that file. Try a plain-text, Markdown, JSON or CSV file."); } e.target.value = ""; }} />
          <textarea id="guest-context" rows={4} value={context} onChange={e => setContext(e.target.value)} placeholder="Paste notes, a draft, requirements or background…" />
          {notice && <p className="notice" role="status">{notice}</p>}
          <div className="guest-form-actions">{editingId && <button className="secondary-button" type="button" onClick={cancelEdit}>Cancel edit</button>}<button className="primary-button" type="submit" disabled={!objective.trim()}><Icon name="plus" /> {editingId ? "Save changes" : "Save work brief"} <Icon name="arrow" /></button></div>
          <p className="composer-note">Your brief stays in this browser. It is not sent to OUTPERFORM servers.</p>
        </form>
        <section className="guest-library">
          <div className="section-heading"><div><span className="section-kicker">YOUR DEVICE</span><h2>Saved briefs</h2></div><span className="empty-count">{items.length}</span></div>
          {items.length === 0 ? <div className="empty-state"><div className="empty-symbol"><Mark /></div><h3>Your work, your starting point.</h3><p>Create a brief. It will be saved locally on this device, without registration.</p></div> :
            <div className="session-list">{items.map(item => <article className="session-row" key={item.id}><div className="session-main"><span className="session-type">{item.taskType}</span><h3>{item.objective}</h3><span className="session-date">{new Date(item.createdAt).toLocaleString()}</span></div><div className="session-actions"><button className="small-action" onClick={() => editBrief(item)}>Edit</button><button className="small-action" onClick={() => exportBrief(item)}>Export brief</button><button className="small-action" onClick={() => exportPrompt(item)}>Export AI prompt <Icon name="arrow" /></button><button className="small-action danger-action" onClick={() => deleteBrief(item.id)}>Delete</button></div></article>)}</div>}
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
  const [theme, toggleTheme] = useThemePreference();
  const { data: authSession, isPending: authPending } = authClient.useSession();
  const [health, setHealth] = useState("checking");
  const [sessions, setSessions] = useState([]);
  const [usage, setUsage] = useState(null);
  const [accountDeleteBusy, setAccountDeleteBusy] = useState(false);
  const [savedPlaybooks, setSavedPlaybooks] = useState([]);
  const [playbookNotice, setPlaybookNotice] = useState("");
  const [guestBriefs, setGuestBriefs] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("outperform_guest_work") || "[]");
      return Array.isArray(stored) ? stored : [];
    } catch { return []; }
  });
  const [guestImportDismissed, setGuestImportDismissed] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
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
  const [selectedArtifactId, setSelectedArtifactId] = useState("");
  const [artifactContents, setArtifactContents] = useState({});
  const [artifactLoading, setArtifactLoading] = useState(false);
  const [integrityResults, setIntegrityResults] = useState({});
  const [integrityBusyId, setIntegrityBusyId] = useState("");
  const [rerunFeedback, setRerunFeedback] = useState("");
  const [compareMode, setCompareMode] = useState(false);
  const [leftArtifactId, setLeftArtifactId] = useState("");
  const [rightArtifactId, setRightArtifactId] = useState("");
  const [sessionSearch, setSessionSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [taskFilter, setTaskFilter] = useState("ALL");
  const [activeView, setActiveView] = useState("overview");
  const [detailLoading, setDetailLoading] = useState(false);
  const composerDialogRef = useDialogAccessibility(showComposer, () => setShowComposer(false));
  const reviewDialogRef = useDialogAccessibility(Boolean(selected), () => setSelected(null));
  const detailRequestRef = useRef(0);

  useEffect(() => {
    if (!selected) detailRequestRef.current += 1;
  }, [selected]);




  async function deleteAccount() {
    const confirmation = window.prompt("This deletes your live account, sessions, playbooks and stored artifacts. Private disaster-recovery snapshots may retain historical copies. Type DELETE MY ACCOUNT to continue.");
    if (confirmation !== "DELETE MY ACCOUNT" || accountDeleteBusy) return;
    setAccountDeleteBusy(true);
    try {
      const response = await fetch("/api/account", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmation })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Account deletion failed.");
      try { await authClient.signOut(); } catch {}
      window.alert("Your live OUTPERFORM account and stored work have been deleted. Private disaster-recovery snapshots may retain historical copies.");
      window.location.replace("/");
    } catch (e) {
      window.alert(e.message);
    } finally {
      setAccountDeleteBusy(false);
    }
  }

  async function savePlaybook(playbook) {
    try {
      const response = await fetch("/api/playbooks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: playbook.name,
          taskType: playbook.type,
          description: playbook.desc || "",
          objectiveTemplate: playbook.objective,
          requirements: playbook.criteria || [],
          constraints: playbook.constraints || []
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not save playbook.");
      setSavedPlaybooks((current) => [data.playbook, ...current]);
      setPlaybookNotice("Saved to your private playbook library.");
      setNotice("Saved to your private playbook library.");
      return true;
    } catch (e) {
      setPlaybookNotice(e.message);
      setNotice(e.message);
      return false;
    }
  }

  async function saveCurrentPlaybook() {
    if (!objective.trim()) {
      setNotice("Add an objective before saving a reusable playbook.");
      return;
    }
    const suggestedName = taskType.toLowerCase().replaceAll("_", " ") + " playbook";
    const name = window.prompt("Name this reusable playbook:", suggestedName);
    if (!name?.trim()) return;
    const saved = await savePlaybook({
      name: name.trim(),
      type: taskType,
      desc: "Custom playbook saved from a work brief.",
      objective,
      criteria: requirementsText.split("\n").map((item) => item.trim()).filter(Boolean),
      constraints: constraintsText.split("\n").map((item) => item.trim()).filter(Boolean)
    });
    if (saved) setNotice("Your custom playbook has been saved to your private library.");
  }

  function usePlaybook(playbook) {
    setTaskType(playbook.taskType || playbook.type || "OTHER");
    setObjective(playbook.objectiveTemplate || playbook.objective || "");
    setRequirementsText((playbook.requirements || playbook.criteria || []).join("\n"));
    setConstraintsText((playbook.constraints || []).join("\n"));
    setContext("");
    setShowComposer(true);
    setActiveView("overview");
    setNotice("");
  }

  async function deleteSavedPlaybook(playbookId) {
    if (!window.confirm("Delete this saved playbook? This cannot be undone.")) return;
    try {
      const response = await fetch("/api/playbooks/" + playbookId, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not delete playbook.");
      setSavedPlaybooks((current) => current.filter((item) => item.id !== playbookId));
      setPlaybookNotice("Playbook deleted from your private library.");
    } catch (e) {
      setPlaybookNotice(e.message);
    }
  }

  async function importGuestBriefs() {
    if (!guestBriefs.length || importBusy) return;
    setImportBusy(true);
    setNotice("");
    const remaining = [...guestBriefs];
    let imported = 0;
    try {
      while (remaining.length) {
        const brief = remaining[0];
        const response = await fetch("/api/sessions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            taskType: brief.taskType,
            objective: brief.objective,
            context: brief.context || "",
            requirements: (brief.requirements || []).map((description) => ({ description, source: "USER", mandatory: true }))
          })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "Could not import a guest brief.");
        remaining.shift();
        imported += 1;
        localStorage.setItem("outperform_guest_work", JSON.stringify(remaining));
        setGuestBriefs([...remaining]);
      }
      await loadSessions();
      setNotice(imported + " guest brief" + (imported === 1 ? " was" : "s were") + " imported as saved sessions. They have not been run or sent to the AI engine.");
    } catch (e) {
      setNotice(imported + " brief" + (imported === 1 ? " was" : "s were") + " imported; the remaining briefs are still available on this device. " + e.message);
    } finally {
      setImportBusy(false);
    }
  }

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
    fetch("/api/usage").then((response) => response.json()).then((data) => { if (active) setUsage(data); }).catch(() => {});
    fetch("/api/playbooks").then((response) => response.json()).then((data) => { if (active) setSavedPlaybooks(data.playbooks || []); }).catch(() => {});
    const interval = window.setInterval(() => {
      refresh();
      fetch("/api/usage").then((response) => response.json()).then((data) => { if (active) setUsage(data); }).catch(() => {});
    }, 15000);
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
      setActiveView("overview");
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
    const requestId = ++detailRequestRef.current;
    setRerunFeedback("");
    setDetailLoading(true);
    setSelected({ session, detail: null });
    setSelectedContent("");
    try {
      const response = await fetch(`/api/sessions/${session.id}`);
      const detail = await response.json();
      if (!response.ok) throw new Error(detail.message || "Could not load session.");
      const best = detail.artifacts.find((item) => item.id === detail.session.bestArtifactId) || detail.artifacts[0];
      const loaded = {};
      await Promise.all(detail.artifacts.map(async (item) => {
        const artifactResponse = await fetch("/api/sessions/" + session.id + "/artifacts/" + item.id);
        if (!artifactResponse.ok) return;
        const artifact = await artifactResponse.json();
        loaded[item.id] = artifact.content || "";
      }));
      if (requestId !== detailRequestRef.current) return;
      setArtifactContents(loaded);
      const integrity = {};
      for (const event of detail.events || []) {
        if (event.event_type === "ARTIFACT_INTEGRITY_CHECKED" && event.payload?.artifactId) integrity[event.payload.artifactId] = event.payload;
      }
      setIntegrityResults(integrity);
      setSelectedArtifactId(best?.id || "");
      setSelectedContent(best ? (loaded[best.id] || "") : "");
      setLeftArtifactId(detail.artifacts.find((item) => item.created_by === "PRIMARY")?.id || detail.artifacts[0]?.id || "");
      setRightArtifactId(detail.artifacts.find((item) => item.created_by === "CHALLENGER")?.id || detail.artifacts.find((item) => item.created_by === "FINAL")?.id || detail.artifacts.find((item) => item.created_by === "PRIMARY")?.id || "");
      setCompareMode(false);
      setSelected({ session, detail });
    } catch (e) {
      if (requestId === detailRequestRef.current) setNotice(e.message);
    } finally {
      if (requestId === detailRequestRef.current) setDetailLoading(false);
    }
  }


  async function selectArtifact(artifact) {
    if (!selected?.session?.id || !artifact?.id) return;
    setSelectedArtifactId(artifact.id);
    if (Object.prototype.hasOwnProperty.call(artifactContents, artifact.id)) {
      setSelectedContent(artifactContents[artifact.id]);
      return;
    }
    setArtifactLoading(true);
    try {
      const response = await fetch("/api/sessions/" + selected.session.id + "/artifacts/" + artifact.id);
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not retrieve this artifact.");
      const content = data.content || "";
      setArtifactContents((current) => ({ ...current, [artifact.id]: content }));
      setSelectedContent(content);
    } catch (e) {
      setNotice(e.message);
    } finally {
      setArtifactLoading(false);
    }
  }

  function downloadText(filename, content) {
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }


  async function verifyArtifactIntegrity(artifactId) {
    if (!selected?.session?.id || !artifactId || integrityBusyId) return;
    setIntegrityBusyId(artifactId);
    try {
      const response = await fetch("/api/sessions/" + selected.session.id + "/artifacts/" + artifactId + "/verify", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Artifact integrity check failed.");
      setIntegrityResults((current) => ({ ...current, [artifactId]: data.integrity }));
      setSelected((current) => current ? ({
        ...current,
        detail: {
          ...current.detail,
          events: [...current.detail.events, {
            event_type: "ARTIFACT_INTEGRITY_CHECKED",
            payload: data.integrity,
            occurred_at: data.integrity.checkedAt
          }]
        }
      }) : current);
      setNotice(data.integrity.matches ? "Artifact fingerprint verified. The retrieved content matches its stored SHA-256 hash." : "Integrity mismatch detected. Do not rely on this artifact until investigated.");
    } catch (e) {
      setNotice(e.message);
    } finally {
      setIntegrityBusyId("");
    }
  }

  function exportEvidencePassport() {
    if (!selected?.detail) return;
    const detail = selected.detail;
    const events = detail.events || [];
    const artifacts = detail.artifacts || [];
    const finalReview = events.find((event) => event.event_type === "FINAL_REVIEW_COMPLETED")?.payload?.review;
    const evaluationEvent = events.find((event) => event.event_type === "RESULT_READY_FOR_REVIEW");
    const evaluation = evaluationEvent?.payload?.comparativeEvaluation || evaluationEvent?.payload?.evaluation;
    const report = [
      "# OUTPERFORM Evidence Passport", "",
      "**Session:** " + detail.session.id,
      "**Objective:** " + detail.session.objective,
      "**Work type:** " + detail.session.taskType,
      "**Status:** " + detail.session.status,
      "**Generated:** " + new Date().toISOString(), "",
      "> This passport records the work and checks performed. Model-generated evaluations are not independent external verification.", "",
      "## Acceptance criteria",
      ...(detail.requirements?.length ? detail.requirements.map((item) => "- " + (item.mandatory ? "[MUST] " : "[SHOULD] ") + item.description) : ["- No explicit acceptance criteria were supplied."]), "",
      "## Constraints",
      ...(detail.constraints?.length ? detail.constraints.map((item) => "- " + item.description) : ["- No additional constraints supplied."]), "",
      "## Risk and challenge selection",
      ...(events.find((event) => event.event_type === "CHALLENGE_PLAN_SELECTED")?.payload
        ? ["- Challenge strategy: " + events.find((event) => event.event_type === "CHALLENGE_PLAN_SELECTED").payload.strategy,
           "- Planned model calls: " + events.find((event) => event.event_type === "CHALLENGE_PLAN_SELECTED").payload.estimatedModelCalls]
        : ["- No challenge plan was recorded."]),
      ...(events.find((event) => event.event_type === "RISK_ASSESSMENT_COMPLETED")?.payload
        ? ["- Heuristic risk: " + events.find((event) => event.event_type === "RISK_ASSESSMENT_COMPLETED").payload.risk,
           "- Uncertainty estimate: " + events.find((event) => event.event_type === "RISK_ASSESSMENT_COMPLETED").payload.uncertainty,
           "- Signals: " + (events.find((event) => event.event_type === "RISK_ASSESSMENT_COMPLETED").payload.signals || []).join(", ")]
        : ["- No risk assessment was recorded."]), "",
      "## Artifact integrity checks",
      ...(events.filter((event) => event.event_type === "ARTIFACT_INTEGRITY_CHECKED").length
        ? events.filter((event) => event.event_type === "ARTIFACT_INTEGRITY_CHECKED").map((event) => "- " + event.payload.status + " — " + event.payload.artifactId + " — stored " + event.payload.storedHash + " / recomputed " + event.payload.computedHash)
        : ["- No explicit artifact integrity checks have been recorded."]), "",
      "## Model usage",
      ...(events.filter((event) => event.event_type === "MODEL_USAGE_RECORDED").length
        ? events.filter((event) => event.event_type === "MODEL_USAGE_RECORDED").map((event) => "- " + event.payload.stage + ": " + (event.payload.totalTokens ?? "unknown") + " tokens; " + (event.payload.costCredits ?? "cost unavailable") + " credits; model " + event.payload.model)
        : ["- No model usage metadata was recorded."]), "",
      "## Candidate artifacts",
      ...(artifacts.length ? artifacts.map((item) => "- **" + item.created_by + " · v" + item.version + "** — " + item.id + "\n  - Parent artifact: " + (item.parent_artifact_id || "original input") + "\n  - SHA-256: " + item.content_hash) : ["- No artifacts were recorded."]), "",
      "## Deterministic artifact checks",
      ...(events.find((event) => event.event_type === "DETERMINISTIC_QUALITY_GATE_COMPLETED")?.payload?.checks || []).map((check) => "- " + check.status + " — " + check.label + ": " + check.detail),
      "",
      "## Comparative assessment",
      evaluation ? evaluation.rationale : "No comparative assessment was recorded.",
      ...(evaluation?.strengths?.length ? ["", "### Strengths", ...evaluation.strengths.map((item) => "- " + item)] : []),
      ...(evaluation?.risks?.length ? ["", "### Risks", ...evaluation.risks.map((item) => "- " + item)] : []), "",
      "## Final criteria review",
      finalReview?.assessment || "No final criteria review was recorded.",
      ...(finalReview?.criteriaCoverage?.length ? ["", "### Criteria coverage", ...finalReview.criteriaCoverage.map((item) => "- " + (typeof item === "string" ? item : JSON.stringify(item)))] : []),
      ...(finalReview?.remainingRisks?.length ? ["", "### Remaining risks", ...finalReview.remainingRisks.map((item) => "- " + item)] : []),
      ...(finalReview?.unverifiedClaims?.length ? ["", "### Unverified claims", ...finalReview.unverifiedClaims.map((item) => "- " + item)] : []), "",
      "## Immutable artifact references",
      ...artifacts.map((item) => "- " + item.id + ": " + item.content_hash), "",
      "## Event ledger",
      ...events.map((event) => "- " + new Date(event.occurred_at).toISOString() + " — " + event.event_type), "",
      "## Verification boundary",
      "- AI-generated comparative and final reviews are model assessments.",
      "- No external verification, test execution or fact-checking is claimed unless a corresponding evidence record exists.",
      "- This report is a private export generated for the session owner."
    ].join("\n");
    downloadText("outperform-evidence-passport-" + detail.session.id.slice(0, 8) + ".md", report);
  }

  const visibleSessions = sessions.filter((session) => {
    const search = sessionSearch.trim().toLowerCase();
    const matchesSearch = !search || (session.objective + " " + session.task_type + " " + session.id).toLowerCase().includes(search);
    const matchesStatus = statusFilter === "ALL" || session.status === statusFilter;
    const matchesTask = taskFilter === "ALL" || session.task_type === taskFilter;
    return matchesSearch && matchesStatus && matchesTask;
  });
  const completedCount = sessions.filter((item) => item.status === "COMPLETED").length;
  const reviewCount = sessions.filter((item) => item.status === "AWAITING_APPROVAL").length;
  const activeCount = sessions.filter((item) => ["UNDERSTANDING","BASELINING","EXECUTING","CHALLENGING","EVALUATING","IMPROVING","VERIFYING"].includes(item.status)).length;

  async function createFollowUpPass() {
    if (!selected?.detail || !rerunFeedback.trim() || busy) return;
    setBusy(true);
    setNotice("");
    try {
      const followUpContext = buildFollowUpContext({
        originalContext: selected.detail.session.context || "",
        previousCandidate: selectedContent,
        feedback: rerunFeedback
      });
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          taskType: selected.detail.session.taskType,
          objective: selected.detail.session.objective,
          context: followUpContext,
          requirements: (selected.detail.requirements || []).map((item) => ({
            description: item.description,
            source: item.source || "USER",
            mandatory: Boolean(item.mandatory)
          })),
          constraints: (selected.detail.constraints || []).map((item) => ({
            description: item.description,
            type: item.constraint_type || "OTHER"
          }))
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || data.error || "Could not create the follow-up session.");
      const startResponse = await fetch("/api/sessions/" + data.session.id + "/start", { method: "POST" });
      const startData = await startResponse.json();
      await loadSessions();
      setSelected(null);
      setRerunFeedback("");
      if (!startResponse.ok) {
        setNotice("The follow-up session was saved, but could not start: " + (startData.message || startData.error || "Try starting it from your workspace."));
      } else {
        setNotice("A new improvement pass has started with your feedback and the previous candidate preserved as context.");
      }
    } catch (e) {
      setNotice(e.message);
    } finally {
      setBusy(false);
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

  const accountRoute = new URLSearchParams(window.location.search).has("account");
  if (authPending && accountRoute) return <div className="boot-screen"><Mark /><span>Loading your workspace…</span></div>;
  if (authPending && !accountRoute) return <GuestWorkspace onSignIn={() => { window.location.href = "/?account=1&mode=signup"; }} theme={theme} onToggleTheme={toggleTheme} />;
  if (!authSession?.user) return accountRoute ? <AuthScreen theme={theme} onToggleTheme={toggleTheme} /> : <GuestWorkspace onSignIn={() => { window.location.href = "/?account=1&mode=signup"; }} theme={theme} onToggleTheme={toggleTheme} />;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="OUTPERFORM home"><Mark /><span>OUTPERFORM</span></a>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="nav-list" aria-label="Main navigation">
          <button className={"nav-item " + (activeView === "overview" ? "active" : "")} type="button" aria-label="Overview" title="Overview" aria-current={activeView === "overview" ? "page" : undefined} onClick={() => setActiveView("overview")}><Icon name="layers" /> Overview</button>
          <button className="nav-item" type="button" aria-label="New session" title="New session" onClick={() => { setShowComposer(true); setNotice(""); }}><Icon name="plus" /> New session</button>
          <button className={"nav-item " + (activeView === "playbooks" ? "active" : "")} type="button" aria-label="Playbooks" title="Playbooks" aria-current={activeView === "playbooks" ? "page" : undefined} onClick={() => setActiveView("playbooks")}><Icon name="book" /> Playbooks</button>
          <button className={"nav-item " + (activeView === "insights" ? "active" : "")} type="button" aria-label="Performance" title="Performance" aria-current={activeView === "insights" ? "page" : undefined} onClick={() => setActiveView("insights")}><Icon name="activity" /> Performance</button>
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-status"><span className={health === "ready" ? "status-dot online" : health === "setup" ? "status-dot setup" : "status-dot"} /><span>Engine {health}</span></div>
          <div className="sidebar-version">EARLY ACCESS BUILD · 0.1</div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb"><span className="breadcrumb-root">Workspace</span><span className="breadcrumb-separator">/</span><span className="breadcrumb-current">{activeView === "overview" ? "Overview" : activeView === "playbooks" ? "Playbooks" : "Performance"}</span></div>
          <div className="topbar-right"><ThemeToggle theme={theme} onToggle={toggleTheme} /><span className="private-label"><Icon name="shield" /> Private workspace</span><span className="user-email">{authSession.user.email}</span><button className="delete-account-button" disabled={accountDeleteBusy} onClick={deleteAccount}>{accountDeleteBusy ? "Deleting…" : "Delete account"}</button><button className="signout-button" onClick={async () => { await authClient.signOut(); window.location.replace("/"); }}>Sign out</button><div className="avatar">{(authSession.user.name || "O").slice(0,1).toUpperCase()}</div></div>
        </header>

        {guestBriefs.length > 0 && !guestImportDismissed && <section className="guest-import-banner"><div><span className="section-kicker">LOCAL WORK FOUND</span><strong>{guestBriefs.length} guest brief{guestBriefs.length === 1 ? "" : "s"} available to import</strong><p>Bring your saved device-only briefs into this private workspace. Import creates saved sessions only; it does not run AI or upload anything until you choose.</p></div><div><button className="secondary-button" disabled={importBusy} onClick={() => setGuestImportDismissed(true)}>Keep on this device</button><button className="primary-button" disabled={importBusy} onClick={importGuestBriefs}>{importBusy ? "Importing…" : "Import briefs"} <Icon name="arrow" /></button></div></section>}

        {activeView === "overview" && <>
        <section className="hero">
          <div className="eyebrow"><span className="eyebrow-line" /> THE WORK IMPROVEMENT & PROOF ENGINE</div>
          <h1>Don’t trust the first answer. Challenge it.</h1>
          <p className="hero-copy">Bring real work from any tool. OUTPERFORM preserves the original, creates competing improvements with different models, stress-tests the strongest result and records exactly what was checked, what remains uncertain and what needs your decision.</p>
          <button className="primary-button" onClick={() => { setShowComposer(true); setNotice(""); }}><Icon name="plus" /> Start with your work <Icon name="arrow" /></button>
        </section>

        <section className="principles">
          <article className="principle"><div className="principle-icon"><Icon name="layers" /></div><div><h3>Start anywhere</h3><p>From a rough idea to a finished deliverable. Your context and constraints come first.</p></div></article>
          <article className="principle"><div className="principle-icon"><Icon name="activity" /></div><div><h3>Challenge the result</h3><p>Independent alternatives and targeted challenges expose what a first pass can miss.</p></div></article>
          <article className="principle"><div className="principle-icon"><Icon name="shield" /></div><div><h3>Inspect the proof</h3><p>Keep the original. Compare every version. See what passed, what failed and what still needs a real-world check.</p></div></article>
        </section>

        <section className="method-section">
          <div className="method-heading"><div><span className="section-kicker">THE OUTPERFORM LOOP</span><h2>One deliverable. Six stages of scrutiny.</h2></div><p>Not a chat thread. A controlled improvement process with a record you can inspect.</p></div>
          <div className="method-flow">
            <article><span>01</span><strong>Capture</strong><small>Freeze the original, objective and acceptance criteria.</small></article>
            <article><span>02</span><strong>Compete</strong><small>Generate alternatives with different model families.</small></article>
            <article><span>03</span><strong>Challenge</strong><small>Compare strengths, gaps, risks and constraints.</small></article>
            <article><span>04</span><strong>Improve</strong><small>Produce a stronger final candidate from the review.</small></article>
            <article><span>05</span><strong>Check</strong><small>Run mechanical checks and record what remains unverified.</small></article>
            <article><span>06</span><strong>Decide</strong><small>You approve, reject or request another pass.</small></article>
          </div>
        </section>

        <section className="metrics-strip" aria-label="Workspace metrics">
          <article><span>ALL SESSIONS</span><strong>{sessions.length}</strong><small>Work attempted</small></article>
          <article><span>IN PROGRESS</span><strong>{activeCount}</strong><small>Currently running</small></article>
          <article><span>READY TO REVIEW</span><strong>{reviewCount}</strong><small>Your decision needed</small></article>
          <article><span>APPROVED</span><strong>{completedCount}</strong><small>Completed by you</small></article>
        </section>
        <section className="work-area">
          <div className="section-heading"><div><span className="section-kicker">YOUR WORK</span><h2>Improvement sessions</h2></div><span className="empty-count">{visibleSessions.length} of {sessions.length} shown</span></div>
          <div className="session-filters"><input aria-label="Search sessions" value={sessionSearch} onChange={(e) => setSessionSearch(e.target.value)} placeholder="Search your work…" /><select aria-label="Filter by status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="ALL">All statuses</option>{["CREATED","UNDERSTANDING","BASELINING","EXECUTING","CHALLENGING","EVALUATING","IMPROVING","VERIFYING","AWAITING_APPROVAL","BLOCKED","COMPLETED","FAILED","CANCELLED"].map((value) => <option key={value} value={value}>{value.replaceAll("_"," ")}</option>)}</select><select aria-label="Filter by work type" value={taskFilter} onChange={(e) => setTaskFilter(e.target.value)}><option value="ALL">All work types</option>{taskTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
          {notice && !showComposer && <p className="notice" role="status">{notice}</p>}
          {sessions.length === 0 ? (
            <div className="empty-state"><div className="empty-symbol"><Mark /></div><h3>Your next breakthrough starts here.</h3><p>There are no sessions yet. Start with something you're working on and give it room to get better.</p><button className="text-button" onClick={() => setShowComposer(true)}>Create your first session <Icon name="arrow" /></button></div>
          ) : visibleSessions.length === 0 ? (
            <div className="empty-state compact-empty"><h3>No matching sessions.</h3><p>Try changing the search or filters.</p><button className="text-button" onClick={() => { setSessionSearch(""); setStatusFilter("ALL"); setTaskFilter("ALL"); }}>Clear filters</button></div>
          ) : (
            <div className="session-list">{visibleSessions.map((session) => (
              <article className="session-row" key={session.id}>
                <div className="session-main"><span className="session-type">{session.task_type}</span><h3>{session.objective}</h3><span className="session-date">{new Date(session.updated_at).toLocaleString()}</span></div>
                <div className="session-actions"><Status value={session.status} />{["CREATED","BLOCKED"].includes(session.status) && <button className="small-action" disabled={busy} onClick={() => startSession(session)}>Run <Icon name="arrow" /></button>}{["AWAITING_APPROVAL","COMPLETED","FAILED","CANCELLED"].includes(session.status) && <button className="small-action" onClick={() => openSession(session)}>Review <Icon name="arrow" /></button>}</div>
              </article>
            ))}</div>
          )}
        </section>
        </>}
        {activeView === "playbooks" && <section className="feature-page">
          <div className="hero feature-hero"><div className="eyebrow"><span className="eyebrow-line" /> OUTPERFORM METHODS</div><h1>Start with a sharper approach.</h1><p className="hero-copy">Playbooks turn a vague request into a disciplined improvement brief. Each one gives the engine a sharper objective and measurable acceptance criteria.</p></div>
          <section className="saved-playbook-library">
            <div className="section-heading"><div><span className="section-kicker">YOUR PRIVATE LIBRARY</span><h2>Saved playbooks</h2></div><span className="empty-count">{savedPlaybooks.length} saved</span></div>
            {playbookNotice && <p className="notice" role="status">{playbookNotice}</p>}
            {savedPlaybooks.length ? <div className="saved-playbook-grid">{savedPlaybooks.map((playbook) => <article className="saved-playbook-card" key={playbook.id}><div><span className="section-kicker">{playbook.taskType}</span><h3>{playbook.name}</h3><p>{playbook.description || playbook.objectiveTemplate}</p><small>{playbook.requirements.length} acceptance criteria · {playbook.constraints.length} constraints</small></div><div><button className="primary-button" onClick={() => usePlaybook(playbook)}>Use playbook <Icon name="arrow" /></button><button className="small-action danger-action" onClick={() => deleteSavedPlaybook(playbook.id)}>Delete</button></div></article>)}</div> : <div className="saved-playbook-empty">Save any starter playbook below to build a private library of repeatable methods.</div>}
          </section>
          <div className="playbook-grid">
            {[
              {type:"CODE",name:"Engineering hardening",tag:"SOFTWARE",desc:"Improve an existing feature or codebase without breaking what already works.",objective:"Improve this software deliverable while preserving existing behaviour, security boundaries and maintainability.",criteria:["Identify the current behaviour and preserve working functionality","Find correctness, security, performance and accessibility risks","Propose concrete changes with rationale and trade-offs","Define tests that would demonstrate correctness","List all claims that still require execution or human verification"]},
              {type:"RESEARCH",name:"Evidence-led research",tag:"RESEARCH",desc:"Turn a broad question into a defensible, source-aware decision brief.",objective:"Produce a decision-ready research brief with traceable claims, counter-evidence and explicit uncertainty.",criteria:["Separate verified facts, estimates, assumptions and opinions","Identify credible primary sources and publication dates","Test the strongest counterargument","Resolve contradictions between sources","List gaps that prevent a confident decision"]},
              {type:"DOCUMENT",name:"Document excellence",tag:"WRITING",desc:"Upgrade a document for clarity, completeness, structure and audience impact.",objective:"Improve this document for its intended audience while preserving its meaning and required details.",criteria:["Preserve all material facts, commitments and constraints","Improve structure, clarity and readability","Remove ambiguity, repetition and unsupported claims","Check consistency of names, dates, numbers and terminology","Explain material changes and unresolved ambiguities"]},
              {type:"BUSINESS",name:"Business decision stress-test",tag:"STRATEGY",desc:"Pressure-test a plan, opportunity or operating decision before committing resources.",objective:"Stress-test this business decision and produce a stronger, evidence-aware action plan.",criteria:["Clarify the decision, objective and assumptions","Identify customer, market, operational and financial risks","Challenge the strongest assumptions with counter-scenarios","Compare realistic alternatives and opportunity costs","Define leading indicators, stop conditions and next actions"]},
              {type:"CREATIVE",name:"Creative concept challenger",tag:"CREATIVE",desc:"Push a concept beyond the obvious while protecting the brief and audience fit.",objective:"Develop a distinctive creative direction that fulfils the brief and is meaningfully stronger than conventional alternatives.",criteria:["Stay faithful to the audience, brief and constraints","Generate meaningfully different directions","Explain the distinctive idea and intended effect","Identify clichés, weak assumptions and execution risks","Recommend one direction with a practical next-step plan"]}
            ].map((playbook) => <article className="playbook-card" key={playbook.type}><span className="section-kicker">{playbook.tag}</span><h2>{playbook.name}</h2><p>{playbook.desc}</p><ul>{playbook.criteria.slice(0,3).map((item) => <li key={item}>{item}</li>)}</ul><div className="playbook-card-actions"><button className="primary-button" onClick={() => usePlaybook(playbook)}>Use this playbook <Icon name="arrow" /></button><button className="secondary-button" onClick={() => savePlaybook(playbook)}>Save to my library</button></div></article>)}
          </div>
        </section>}
        {activeView === "insights" && <section className="feature-page">
          <div className="hero feature-hero"><div className="eyebrow"><span className="eyebrow-line" /> OUTCOME INTELLIGENCE</div><h1>See where the work is moving.</h1><p className="hero-copy">A live view of your improvement activity. These are workflow outcomes—not a claim that model-generated scores equal real-world quality.</p></div>
          <div className="metrics-strip insights-metrics"><article><span>AI RUNS LEFT TODAY</span><strong>{usage?.remaining ?? "—"}</strong><small>Of {usage?.dailyLimit ?? 10} allowed · UTC</small></article><article><span>MODEL CALLS TODAY</span><strong>{usage?.modelCalls ?? "—"}</strong><small>Recorded provider requests</small></article><article><span>TOKENS PROCESSED</span><strong>{Number(usage?.totalTokens || 0).toLocaleString()}</strong><small>Input and output tokens</small></article><article><span>PROVIDER COST</span><strong>{usage?.costRecords ? Number(usage.costCredits || 0).toFixed(6) : "—"}</strong><small>OpenRouter credits today</small></article></div>
          <div className="metrics-strip insights-metrics"><article><span>TOTAL WORK</span><strong>{sessions.length}</strong><small>All saved sessions</small></article><article><span>APPROVED</span><strong>{completedCount}</strong><small>Human-approved sessions</small></article><article><span>AWAITING DECISION</span><strong>{reviewCount}</strong><small>Needs your review</small></article><article><span>ACTIVE RUNS</span><strong>{activeCount}</strong><small>Workflow in progress</small></article></div>
          <section className="insights-panel"><h2>What these numbers mean</h2><p>OUTPERFORM currently measures workflow activity and human decisions. It does not yet measure independently verified task success across external tools. That distinction is deliberate: we will not inflate performance claims with AI-generated scores.</p><div className="insight-note"><strong>Next measurement layer</strong><span>Deterministic checks, reusable evaluation datasets, model/provider cost and latency, regression history, and evidence-backed outcome trends are the next product engineering milestones.</span></div></section>
          <button className="text-button" onClick={() => setActiveView("overview")}>Back to overview <Icon name="arrow" /></button>
        </section>}
        <footer className="footer"><span>OUTPERFORM</span><span>Better work. Backed by evidence.</span></footer>
      </main>

      {showComposer && <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowComposer(false); }}>
        <section ref={composerDialogRef} className="composer" role="dialog" aria-modal="true" aria-labelledby="composer-title" tabIndex={-1}>
          <div className="composer-header"><div><span className="section-kicker">NEW WORK SESSION</span><h2 id="composer-title">What are we improving?</h2></div><button className="close-button" onClick={() => setShowComposer(false)} aria-label="Close">×</button></div>
          <form onSubmit={submitSession}>
            <label htmlFor="task-type">What kind of work is this?</label><select id="task-type" value={taskType} onChange={(e) => setTaskType(e.target.value)}>{taskTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
            <label htmlFor="objective">What do you want to achieve?</label><textarea id="objective" value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="Describe the outcome you want—not just the steps you think are needed." rows={3} required />
            <label htmlFor="requirements">What must a successful result achieve? <span>One requirement per line</span></label><textarea id="requirements" value={requirementsText} onChange={(e) => setRequirementsText(e.target.value)} placeholder={"Preserve the original work\nAddress every critical issue\nProvide evidence for factual claims"} rows={3} />
            <label htmlFor="constraints">What must it avoid or respect? <span>Optional · One per line</span></label><textarea id="constraints" value={constraintsText} onChange={(e) => setConstraintsText(e.target.value)} placeholder={"Do not change the public API\nKeep within the existing budget"} rows={2} />
            <label htmlFor="context">Existing work and background <span>Optional · paste or import a text file up to 100 KB</span></label><input className="file-input" type="file" accept=".txt,.md,.markdown,.json,.csv,.html,.xml,.yaml,.yml" aria-label="Import a text file" onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; if (file.size > 100000) { setNotice("This file is larger than 100 KB. Paste a smaller excerpt instead."); e.target.value = ""; return; } try { setContext(await file.text()); setNotice("Loaded " + file.name + " into the work brief."); } catch { setNotice("Could not read that file. Try a plain-text, Markdown, JSON or CSV file."); } e.target.value = ""; }} /><textarea id="context" value={context} onChange={(e) => setContext(e.target.value)} placeholder="Paste an existing draft, code, research, files or relevant background." rows={5} />
            {notice && <p className="notice" role="alert">{notice}</p>}
            <div className="composer-actions"><button type="button" className="secondary-button" onClick={() => setShowComposer(false)}>Cancel</button><button type="button" className="secondary-button" disabled={!objective.trim()} onClick={saveCurrentPlaybook}>Save as playbook</button><button type="submit" className="primary-button" disabled={busy || !objective.trim()}>{busy ? "Creating…" : "Create and run"} <Icon name="arrow" /></button></div>
          </form>
          <p className="composer-note">Your original work will be preserved. AI evaluation is not the same as independent verification. {usage && "Daily fair-use allowance: " + usage.remaining + " of " + usage.dailyLimit + " AI runs remaining (UTC)."}</p>
        </section>
      </div>}

      {selected && <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setSelected(null); }}>
        <section ref={reviewDialogRef} className="review-panel" role="dialog" aria-modal="true" aria-labelledby="review-title" tabIndex={-1}>
          <div className="composer-header"><div><span className="section-kicker">SESSION REVIEW</span><h2 id="review-title">{selected.session.objective}</h2></div><button className="close-button" onClick={() => setSelected(null)} aria-label="Close">×</button></div>
          {detailLoading ? <p>Loading session evidence…</p> : selected.detail && <>
            <div className="review-meta"><Status value={selected.detail.session.status} /><span>{selected.detail.artifacts.length} candidate artifacts</span></div>
            <div className="verification-note"><Icon name="shield" /> AI-selected candidate · Not independently verified</div>
            {(() => {
              const risk = selected.detail.events.find((event) => event.event_type === "RISK_ASSESSMENT_COMPLETED")?.payload;
              const challengePlan = selected.detail.events.find((event) => event.event_type === "CHALLENGE_PLAN_SELECTED")?.payload;
              return risk ? <div className="risk-assessment"><div><span className="section-kicker">WORK RISK PROFILE</span><strong>{risk.risk} RISK</strong></div><span>Uncertainty estimate: {risk.uncertainty}</span><small>Challenge strategy: {challengePlan?.strategy || "Not recorded"} · Heuristic signals: {(risk.signals || []).join(", ") || "No selected high-risk keywords"}. This is a routing aid, not a formal risk assessment.</small></div> : null;
            })()}
            {(() => {
              const challengePlan = selected.detail.events.find((event) => event.event_type === "CHALLENGE_PLAN_SELECTED")?.payload;
              const execution = selected.detail.events.find((event) => event.event_type === "CHALLENGE_EXECUTION_MODE_RECORDED")?.payload;
              const completed = selected.detail.events.some((event) => event.event_type === "CHALLENGE_COMPLETED");
              if (!challengePlan) return null;
              const label = challengePlan.strategy === "NO_CHALLENGE"
                ? "No challenge was run"
                : challengePlan.strategy.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
              return <section className="challenge-report">
                <div className="challenge-report-heading">
                  <div><span className="section-kicker">CHALLENGE REPORT</span><h3>{label}</h3></div>
                  <span className="challenge-report-status">{execution?.executionMode === "MODEL_ONLY" ? "Model-only" : challengePlan.strategy === "NO_CHALLENGE" ? "Not required" : "Legacy run"}</span>
                </div>
                <p>{challengePlan.rationale}</p>
                <div className="challenge-report-details">
                  <span>{execution?.primaryCandidateProvided ? "Primary candidate challenged" : execution ? "Primary candidate withheld" : "Candidate context not recorded"}</span>
                  <span>{execution?.externalSearchPerformed ? "External search performed" : execution ? "No external search" : "Search status not recorded"}</span>
                  <span>{completed ? "Challenger artifact recorded" : "No challenger artifact recorded"}</span>
                </div>
                <small>Model-generated challenge only. This does not represent external research, code execution or human specialist review.</small>
              </section>;
            })()}
            {(() => {
              const usageEvents = selected.detail.events.filter((event) => event.event_type === "MODEL_USAGE_RECORDED");
              if (!usageEvents.length) return null;
              const totalTokens = usageEvents.reduce((sum, event) => sum + (Number(event.payload?.totalTokens) || 0), 0);
              const costRecords = usageEvents.filter((event) => event.payload?.costCredits != null).length;
              const totalCost = usageEvents.reduce((sum, event) => sum + (Number(event.payload?.costCredits) || 0), 0);
              return <section className="model-usage-panel"><div><span className="section-kicker">INFERENCE ACCOUNTING</span><h3>Run cost and usage</h3></div><div className="model-usage-totals"><strong>{totalTokens.toLocaleString()} <small>tokens</small></strong><strong>{costRecords ? totalCost.toFixed(6) : "—"} <small>credits</small></strong><strong>{usageEvents.length} <small>model calls</small></strong></div><ul>{usageEvents.map((event, index) => <li key={index}><span>{event.payload?.stage}</span><span>{event.payload?.totalTokens ?? "?"} tokens</span><span>{event.payload?.costCredits == null ? "Cost unavailable" : Number(event.payload.costCredits).toFixed(5) + " credits"}</span></li>)}</ul><p>Provider-reported usage. Credits are provider accounting, not a charge to the user.</p></section>;
            })()}
            {(() => {
              const gate = selected.detail.events.find((event) => event.event_type === "DETERMINISTIC_QUALITY_GATE_COMPLETED")?.payload;
              return gate ? <section className="quality-gate-panel">
                <div className="quality-gate-heading"><div><span className="section-kicker">DETERMINISTIC CHECKS</span><h3>Artifact quality gate</h3></div><strong>{gate.summary?.outcome === "MECHANICAL_CHECKS_PASSED" ? "Checks passed" : gate.summary?.outcome === "FAILED_CHECKS" ? "Checks failed" : "Review required"}</strong></div>
                <div className="quality-gate-stats"><span>{gate.summary?.passed || 0} passed</span><span>{gate.summary?.flagged || 0} flagged</span><span>{gate.summary?.failed || 0} failed</span><span>{gate.wordCount || 0} words</span></div>
                <ul>{(gate.checks || []).map((check) => <li key={check.id}><span className={"gate-status gate-" + check.status.toLowerCase()}>{check.status}</span><div><strong>{check.label}</strong><small>{check.detail}</small></div></li>)}</ul>
                <p>These checks inspect text structure only. They do not prove factual accuracy, requirement satisfaction, code correctness or real-world usefulness.</p>
              </section> : null;
            })()}
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
            <section className="artifact-library">
              <div className="artifact-library-head"><div><span className="section-kicker">VERSIONED OUTPUTS</span><h3>Work artifacts</h3></div><button className="secondary-button" onClick={exportEvidencePassport}>Export evidence passport</button></div>
              <div className="artifact-tabs">{selected.detail.artifacts.map((artifact) => <button key={artifact.id} className={"artifact-tab " + (selectedArtifactId === artifact.id ? "active" : "")} onClick={() => selectArtifact(artifact)}><strong>{artifact.created_by}</strong><span>Version {artifact.version}</span><small>SHA-256 · {artifact.content_hash?.slice(0,12)}…</small></button>)}</div>
              <div className="artifact-toolbar"><span>{selected.detail.artifacts.find((item) => item.id === selectedArtifactId)?.content_hash ? "Content fingerprint: " + selected.detail.artifacts.find((item) => item.id === selectedArtifactId).content_hash : "No artifact selected"}</span><div><button className="small-action" disabled={!selectedArtifactId || integrityBusyId === selectedArtifactId} onClick={() => verifyArtifactIntegrity(selectedArtifactId)}>{integrityBusyId === selectedArtifactId ? "Checking…" : "Verify fingerprint"}</button><button className="small-action" onClick={() => setCompareMode((value) => !value)} disabled={new Set(selected.detail.artifacts.filter((item) => item.created_by !== "BASELINE").map((item) => item.id)).size < 2}>{compareMode ? "Close comparison" : "Compare candidates"}</button><button className="small-action" disabled={!selectedContent} onClick={() => downloadText("outperform-artifact-" + (selectedArtifactId || "export") + ".md", selectedContent)}>Download artifact</button></div></div>{integrityResults[selectedArtifactId] && <div className={"integrity-result " + (integrityResults[selectedArtifactId].matches ? "integrity-pass" : "integrity-fail")}><strong>{integrityResults[selectedArtifactId].matches ? "Fingerprint verified" : "Integrity mismatch"}</strong><span>{integrityResults[selectedArtifactId].method}</span></div>}
              {compareMode && <div className="artifact-comparison"><div className="comparison-heading"><strong>Candidate comparison</strong><span>Read both complete outputs before choosing a direction.</span></div><div className="comparison-selectors"><label>Candidate A<select value={leftArtifactId} onChange={(e) => { const next = e.target.value; setLeftArtifactId(next); if (rightArtifactId === next) setRightArtifactId(selected.detail.artifacts.find((item) => item.created_by !== "BASELINE" && item.id !== next)?.id || ""); }}>{selected.detail.artifacts.filter((item) => item.created_by !== "BASELINE").map((item) => <option key={item.id} value={item.id}>{item.created_by} · v{item.version}</option>)}</select></label><label>Candidate B<select value={rightArtifactId} onChange={(e) => setRightArtifactId(e.target.value)}>{selected.detail.artifacts.filter((item) => item.created_by !== "BASELINE" && item.id !== leftArtifactId).map((item) => <option key={item.id} value={item.id}>{item.created_by} · v{item.version}</option>)}</select></label></div>{(() => { const diff = buildLineDiff(artifactContents[leftArtifactId] || "", artifactContents[rightArtifactId] || ""); return <section className="comparison-diff" aria-label="Line-by-line candidate changes"><div className="comparison-diff-header"><strong>Change map</strong><span>{diff.mode === "diff" ? "+" + diff.added + " additions · −" + diff.removed + " removals" : "Large-file fallback"}</span></div><pre>{diff.rows.map((row, index) => <span key={index} className={"diff-line diff-" + row.type}>{row.type === "added" ? "+ " : row.type === "removed" ? "− " : row.type === "context" ? "  " : ""}<span className="diff-line-numbers">{row.lineA ?? "·"}:{row.lineB ?? "·"}</span> {row.text || " "}</span>)}</pre></section>; })()}<div className="comparison-columns">{[leftArtifactId,rightArtifactId].map((id,index) => <article key={id + "-" + index}><h4>{selected.detail.artifacts.find((item) => item.id === id)?.created_by || "Candidate"} · {index ? "B" : "A"}</h4><pre>{artifactContents[id] || "Artifact not loaded."}</pre></article>)}</div></div>}
              {!compareMode && <pre className="artifact-content">{artifactLoading ? "Loading artifact…" : selectedContent || "No selected artifact is available yet."}</pre>}
            </section>
            {["AWAITING_APPROVAL","COMPLETED","CANCELLED","FAILED","BLOCKED"].includes(selected.detail.session.status) && <section className="follow-up-panel">
              <span className="section-kicker">ITERATE WITH INTENT</span>
              <h3>Make the next pass better.</h3>
              <p>OUTPERFORM will carry forward the original brief, constraints and selected candidate. Tell it what to change, preserve or investigate.</p>
              <label htmlFor="follow-up-feedback">Your direction for the next pass</label>
              <textarea id="follow-up-feedback" rows={3} value={rerunFeedback} onChange={(event) => setRerunFeedback(event.target.value)} placeholder="What was missing? What should be different? What must not change?" />
              <button className="primary-button" disabled={busy || !rerunFeedback.trim() || artifactLoading || !selectedContent.trim()} onClick={createFollowUpPass}>{busy ? "Starting next pass…" : "Run another improvement pass"} <Icon name="arrow" /></button>
            </section>}
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
