"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@repo/auth/client";

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4001/api").replace(/\/+$/, "");
const authClient = createClient(`${API_URL}/auth`);

type Priority = "LOW" | "MEDIUM" | "HIGH";
type Task = {
  id: string;
  taskTitle: string;
  taskDesc?: string | null;
  priority: Priority;
  createdAt: string;
};
type Schedule = {
  id: string;
  scheduleDate: string;
  completedAt?: string | null;
  task: Pick<Task, "id" | "taskTitle" | "taskDesc" | "priority">;
};
type Dashboard = {
  recentTasks: Task[];
  today: Schedule[];
  history: Schedule[];
};
type CalendarData = {
  date: string;
  studyLogs: Array<{
    id: string;
    title: string;
    description?: string | null;
    priority: Priority;
    loggedAt: string;
  }>;
  scheduled: Schedule[];
  completedRevisions: Schedule[];
  missedRevisions: Schedule[];
  upcomingRevisions: Schedule[];
};

const priorityLabel: Record<Priority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
};

function notifyStudyDataChanged() {
  window.dispatchEvent(new Event("study-data-changed"));
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers,
  });
  const body = (await response.json()) as T & { error?: unknown };
  if (!response.ok) {
    throw new Error(typeof body.error === "string" ? body.error : "Request failed");
  }
  return body;
}

function AuthForm({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result =
        mode === "login"
          ? await authClient.signIn.email({ email, password })
          : await authClient.signUp.email({ name, email, password });
      if (result.error) throw new Error(result.error.message ?? "Authentication failed");
      onAuthenticated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Authentication failed");
    } finally {
      setBusy(false);
    }

  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">CYCLIC STUDY</p>
        <h1>Make today count.</h1>
        <p className="muted">Capture what you learned and let your revision cycle stay visible.</p>
        <div className="tabs">
          <button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>Sign in</button>
          <button className={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")}>Create account</button>
        </div>
        <form onSubmit={submit} className="stack">
          {mode === "signup" && <label>Name<input value={name} onChange={(event) => setName(event.target.value)} required /></label>}
          <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          <label>Password<input type="password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
          {error && <p className="error">{error}</p>}
          <button className="primary" disabled={busy}>{busy ? "Please wait..." : mode === "login" ? "Sign in" : "Create account"}</button>
        </form>
      </section>
    </main>
  );
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function Calendar() {
  const todayKey = dateKey(new Date());
  const [month, setMonth] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [data, setData] = useState<CalendarData | null>(null);
  const [error, setError] = useState("");
  const [editingLog, setEditingLog] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPriority, setEditPriority] = useState<Priority>("MEDIUM");
  const [updatingSchedule, setUpdatingSchedule] = useState<string | null>(null);

  const loadCalendar = useCallback(async () => {
    setError("");
    try {
      setData(await api<CalendarData>(`/calendar?date=${selectedDate}`));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load calendar");
    }
  }, [selectedDate]);
  useEffect(() => {
    void loadCalendar();
  }, [loadCalendar]);
  useEffect(() => {
    const refresh = () => void loadCalendar();
    window.addEventListener("study-data-changed", refresh);
    return () => window.removeEventListener("study-data-changed", refresh);
  }, [loadCalendar]);

  const days = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
    const leading = (first.getDay() + 6) % 7;
    return Array.from({ length: leading + last.getDate() }, (_, index) => {
      if (index < leading) return null;
      return new Date(month.getFullYear(), month.getMonth(), index - leading + 1);
    });
  }, [month]);

  const selectedIsToday = selectedDate === todayKey;
  const selectedIsPast = selectedDate < todayKey;
  async function saveLog(id: string) {
    await api(`/study-logs/${id}`, { method: "PUT", body: JSON.stringify({ title: editTitle, description: editDescription, priority: editPriority }) });
    setEditingLog(null);
    notifyStudyDataChanged();
    await loadCalendar();
  }
  async function deleteLog(id: string) {
    if (!window.confirm("Delete this study log and its revision cycle?")) return;
    await api(`/study-logs/${id}`, { method: "DELETE" });
    notifyStudyDataChanged();
    await loadCalendar();
  }
  async function toggleSchedule(schedule: Schedule) {
    if (updatingSchedule) return;
    setUpdatingSchedule(schedule.id);
    setError("");
    try {
      await api(`/schedules/${schedule.id}/${schedule.completedAt ? "uncomplete" : "complete"}`, { method: "PATCH" });
      notifyStudyDataChanged();
      await loadCalendar();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update revision");
    } finally {
      setUpdatingSchedule(null);
    }
  }
  return (
    <section className="calendar-panel panel">
      <div className="panel-heading">
        <div><h2>Study calendar</h2><p className="muted">Choose a date to see your cycle.</p></div>
        <div className="calendar-nav"><button className="ghost" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button><strong>{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</strong><button className="ghost" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button></div>
      </div>
      <label className="date-picker">View date<input type="date" value={selectedDate} onChange={(event) => { setSelectedDate(event.target.value); setMonth(new Date(`${event.target.value}T12:00:00`)); }} /></label>
      <div className="calendar-grid weekdays">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <span key={day}>{day}</span>)}</div>
      <div className="calendar-grid">{days.map((day, index) => day ? <button key={day.toISOString()} className={`calendar-day ${dateKey(day) === selectedDate ? "selected" : ""} ${dateKey(day) === todayKey ? "today" : ""}`} onClick={() => setSelectedDate(dateKey(day))}><span>{day.getDate()}</span></button> : <span className="calendar-empty" key={`empty-${index}`} />)}</div>
      <div className="calendar-results">
        <h3>{selectedIsToday ? "Today at a glance" : selectedIsPast ? "Activity and missed revisions" : "Planned revisions"}</h3>
        {error && <p className="error">{error}</p>}
        {data && data.studyLogs.length > 0 && <h4 className="section-label">Learning logged</h4>}
        {data && data.studyLogs.map((log) => editingLog === log.id ? <div className="edit-card" key={`log-${log.id}`}><input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} /><textarea rows={2} value={editDescription} onChange={(event) => setEditDescription(event.target.value)} /><select value={editPriority} onChange={(event) => setEditPriority(event.target.value as Priority)}>{Object.entries(priorityLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><div className="actions"><button className="primary compact" onClick={() => void saveLog(log.id)}>Save</button><button className="ghost compact" onClick={() => setEditingLog(null)}>Cancel</button></div></div> : <article className="calendar-item" key={`log-${log.id}`}><span className="check">✓</span><div><strong>{log.title}</strong><p className="muted">{log.description || "Study log"}</p></div><span className="status-chip completed">Logged</span><button className="icon-button" onClick={() => { setEditingLog(log.id); setEditTitle(log.title); setEditDescription(log.description ?? ""); setEditPriority(log.priority); }}>Edit</button><button className="icon-button danger" onClick={() => void deleteLog(log.id)}>Delete</button></article>)}
        {data && data.completedRevisions.length > 0 && <h4 className="section-label">Revisions completed</h4>}
        {data && data.completedRevisions.map((item) => <article className="calendar-item" key={`completed-${item.id}`}><button type="button" className="calendar-check check" disabled={updatingSchedule !== null} onClick={() => void toggleSchedule(item)} aria-label={`Undo ${item.task.taskTitle}`}>✓</button><div><strong>{item.task.taskTitle}</strong><p className="muted">Completed revision</p></div><span className="status-chip completed">Done</span></article>)}
        {data && data.missedRevisions.length > 0 && <h4 className="section-label missed-heading">Revisions missed</h4>}
        {data && data.missedRevisions.map((item) => <article className="calendar-item missed-item" key={`missed-${item.id}`}><button type="button" className="calendar-check check empty-check" disabled={updatingSchedule !== null} onClick={() => void toggleSchedule(item)} aria-label={`Complete ${item.task.taskTitle}`}>!</button><div><strong>{item.task.taskTitle}</strong><p className="muted">Was scheduled for this date</p></div><span className="status-chip missed">Missed</span></article>)}
        {data && data.upcomingRevisions.length > 0 && <h4 className="section-label">Revisions scheduled</h4>}
        {data && data.upcomingRevisions.map((item) => <article className="calendar-item" key={`upcoming-${item.id}`}><button type="button" className="calendar-check check empty-check" disabled={updatingSchedule !== null} onClick={() => void toggleSchedule(item)} aria-label={`Complete ${item.task.taskTitle}`}></button><div><strong>{item.task.taskTitle}</strong><p className="muted">{updatingSchedule === item.id ? "Updating..." : "Revision scheduled"}</p></div><span className="status-chip upcoming">Due</span></article>)}
        {data && !data.studyLogs.length && !data.completedRevisions.length && !data.missedRevisions.length && !data.upcomingRevisions.length && <p className="muted">Nothing recorded or scheduled for this date.</p>}
      </div>
    </section>
  );
}

function Dashboard({ onSignOut }: { onSignOut: () => void }) {
  const [data, setData] = useState<Dashboard | null>(null);
  const [history, setHistory] = useState<Schedule[]>([]);
  const [historySearch, setHistorySearch] = useState("");
  const [historyStatus, setHistoryStatus] = useState<"all" | "completed" | "missed">("all");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("MEDIUM");
  const [loggedDate, setLoggedDate] = useState(() => dateKey(new Date()));
  const [editingTask, setEditingTask] = useState<string | null>(null);
  const [editTaskTitle, setEditTaskTitle] = useState("");
  const [editTaskDesc, setEditTaskDesc] = useState("");
  const [editTaskPriority, setEditTaskPriority] = useState<Priority>("MEDIUM");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [togglingSchedule, setTogglingSchedule] = useState<string | null>(null);

  async function load() {
    try {
      setData(await api<Dashboard>("/tasks/dashboard"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load dashboard");
    }
  }
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void api<{ schedules: Schedule[] }>(`/tasks/history?status=${historyStatus}&search=${encodeURIComponent(historySearch)}`)
        .then((result) => setHistory(result.schedules))
        .catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load history"));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [historySearch, historyStatus]);

  async function addTask(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api("/study-logs", { method: "POST", body: JSON.stringify({ title, description: description || undefined, priority, loggedAt: `${loggedDate}T12:00:00` }) });
      setTitle("");
      setDescription("");
      setPriority("MEDIUM");
      setLoggedDate(dateKey(new Date()));
      notifyStudyDataChanged();
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save task");
    } finally {
      setSaving(false);
    }
  }

  async function toggle(schedule: Schedule) {
    if (togglingSchedule) return;
    setTogglingSchedule(schedule.id);
    setError("");
    try {
      await api(`/schedules/${schedule.id}/${schedule.completedAt ? "uncomplete" : "complete"}`, { method: "PATCH" });
      notifyStudyDataChanged();
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update task completion");
    } finally {
      setTogglingSchedule(null);
    }
  }

  async function saveTask(id: string) {
    await api(`/tasks/${id}`, { method: "PUT", body: JSON.stringify({ taskTitle: editTaskTitle, taskDesc: editTaskDesc, priority: editTaskPriority }) });
    setEditingTask(null);
    notifyStudyDataChanged();
    await load();
  }

  async function deleteTask(id: string) {
    if (!window.confirm("Delete this task and its revision schedule?")) return;
    await api(`/tasks/${id}`, { method: "DELETE" });
    notifyStudyDataChanged();
    await load();
  }

  const groupedHistory = useMemo(() => {
    const groups = new Map<string, Schedule[]>();
    for (const item of history) {
      const entries = groups.get(item.task.id) ?? [];
      entries.push(item);
      groups.set(item.task.id, entries);
    }
    return Array.from(groups.values());
  }, [history]);

  const greeting = useMemo(() => new Intl.DateTimeFormat(undefined, { dateStyle: "full" }).format(new Date()), []);
  if (!data) return <main className="loading">Loading your study space...</main>;

  return (
    <main className="dashboard">
      <header className="topbar"><div><p className="eyebrow">CYCLIC STUDY</p><h1>Your study space</h1><p className="muted">{greeting}</p></div><button className="ghost" onClick={async () => { await authClient.signOut(); onSignOut(); }}>Sign out</button></header>
      {error && <p className="error banner">{error}</p>}
      <div className="panes">
        <section className="panel"><div className="panel-heading"><h2>Recent focus</h2><span>{data.recentTasks.length}</span></div><div className="list">{data.recentTasks.map((task) => editingTask === task.id ? <div className="edit-card" key={task.id}><input value={editTaskTitle} onChange={(event) => setEditTaskTitle(event.target.value)} /><textarea rows={2} value={editTaskDesc} onChange={(event) => setEditTaskDesc(event.target.value)} /><select value={editTaskPriority} onChange={(event) => setEditTaskPriority(event.target.value as Priority)}>{Object.entries(priorityLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><div className="actions"><button className="primary compact" onClick={() => void saveTask(task.id)}>Save</button><button className="ghost compact" onClick={() => setEditingTask(null)}>Cancel</button></div></div> : <article className="item" key={task.id}><div><strong>{task.taskTitle}</strong>{task.taskDesc && <p className="muted">{task.taskDesc}</p>}<div className="actions"><button className="icon-button" onClick={() => { setEditingTask(task.id); setEditTaskTitle(task.taskTitle); setEditTaskDesc(task.taskDesc ?? ""); setEditTaskPriority(task.priority); }}>Edit</button><button className="icon-button danger" onClick={() => void deleteTask(task.id)}>Delete</button></div></div><span className={`priority ${task.priority.toLowerCase()}`}>{priorityLabel[task.priority]}</span></article>)}{data.recentTasks.length === 0 && <p className="muted">Your captured work will appear here.</p>}</div></section>
        <section className="panel"><div className="panel-heading"><div><h2>Log study work</h2><p className="muted">Use the calendar below to manage each date.</p></div></div><form onSubmit={addTask} className="stack"><label>Topic or task<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. React server components" required /></label><label>Notes<textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What did you understand?" rows={3} /></label><label>Done date<input type="date" value={loggedDate} max={dateKey(new Date())} onChange={(event) => setLoggedDate(event.target.value)} required /></label><label>Priority<select value={priority} onChange={(event) => setPriority(event.target.value as Priority)}>{Object.entries(priorityLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><button type="submit" className="primary" disabled={saving}>{saving ? "Saving..." : "Add to cycle"}</button></form><p className="muted calendar-hint">Select a date in the Study calendar to view, edit, complete, or undo that day’s revisions.</p></section>
        <section className="panel"><div className="panel-heading"><div><h2>Past revision history</h2><p className="muted">Today is managed from the calendar.</p></div><span>{history.length}</span></div><div className="history-controls"><input value={historySearch} onChange={(event) => setHistorySearch(event.target.value)} placeholder="Search a task..." /><select value={historyStatus} onChange={(event) => setHistoryStatus(event.target.value as typeof historyStatus)}><option value="all">All past activity</option><option value="completed">Completed</option><option value="missed">Missed</option></select></div><div className="list">{groupedHistory.map((group) => <article className="history-group" key={group[0]!.task.id}><div className="history-group-heading"><div><strong>{group[0]!.task.taskTitle}</strong><p className="muted">{group.length} revision record{group.length === 1 ? "" : "s"}</p></div><span className={`priority ${group[0]!.task.priority.toLowerCase()}`}>{priorityLabel[group[0]!.task.priority]}</span></div>{group.map((item) => <div className="history-record" key={item.id}><span>{item.completedAt ? "✓" : "!"}</span><span>{new Date(item.scheduleDate).toLocaleDateString()}</span><span className={item.completedAt ? "status-text completed-text" : "status-text missed-text"}>{item.completedAt ? `Completed ${new Date(item.completedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Missed"}</span></div>)}</article>)}{history.length === 0 && <p className="muted">No past revision records match this view.</p>}</div></section>
      </div>
      <Calendar />
    </main>
  );
}

export default function Home() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  useEffect(() => { void api("/users/me").then(() => setAuthenticated(true)).catch(() => setAuthenticated(false)); }, []);
  if (authenticated === null) return <main className="loading">Preparing your study space...</main>;
  return authenticated ? <Dashboard onSignOut={() => setAuthenticated(false)} /> : <AuthForm onAuthenticated={() => setAuthenticated(true)} />;
}
