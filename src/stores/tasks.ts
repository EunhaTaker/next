import { defineStore } from "pinia";
import { ref, computed } from "vue";
import Database from "@tauri-apps/plugin-sql";
import { emit, listen } from "@tauri-apps/api/event";
import type { UnlistenFn } from "@tauri-apps/api/event";

export type Level = 1 | 2 | 3; // 1=低 2=中 3=高

export interface ShortcutConfig {
  toggleFloat:   string | null; // 隐藏/显示悬浮窗
  openMain:      string | null; // 打开/关闭主界面
  timer:         string | null; // 开始/暂停计时
  switchDesktop: string | null; // 切换到对应桌面
}

export const DEFAULT_SHORTCUTS: ShortcutConfig = {
  toggleFloat:   "CommandOrControl+Alt+H",
  openMain:      "CommandOrControl+Alt+M",
  timer:         "CommandOrControl+Alt+Space",
  switchDesktop: "CommandOrControl+Alt+D",
};

export interface TimeSession {
  start: string; // ISO 8601
  end?: string;  // undefined 表示正在计时
}

export interface SubTask {
  id: string;
  title: string;
  description?: string;
  dueDate?: string;
  importance: Level;
  urgency: Level;
  desktopId?: number;
  completed: boolean;
  createdAt: string;
  timeSessions?: TimeSession[];
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  dueDate?: string;
  importance: Level;
  urgency: Level;
  desktopId?: number;
  createdAt: string;
  completed: boolean;
  subtasks?: SubTask[];
  timeSessions?: TimeSession[];
}

export interface DesktopInfo {
  index: number;
  name: string;
  is_current: boolean;
}

// ── DB 行类型 ──
interface TaskRow {
  id: string;
  parent_id: string | null;
  title: string;
  description: string | null;
  due_date: string | null;
  importance: number;
  urgency: number;
  desktop_id: number | null;
  created_at: string;
  completed: number;
  sort_order: number;
}

interface SessionRow {
  id: number;
  task_id: string;
  start: string;
  end: string | null;
}

interface FocusRow {
  focus_id: string;
  sort_order: number;
}

// ── DDL ──
const DDL = `
CREATE TABLE IF NOT EXISTS tasks (
  id          TEXT PRIMARY KEY,
  parent_id   TEXT REFERENCES tasks(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT,
  due_date    TEXT,
  importance  INTEGER NOT NULL DEFAULT 2,
  urgency     INTEGER NOT NULL DEFAULT 2,
  desktop_id  INTEGER,
  created_at  TEXT NOT NULL,
  completed   INTEGER NOT NULL DEFAULT 0,
  sort_order  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_tasks_parent    ON tasks(parent_id);
CREATE INDEX IF NOT EXISTS idx_tasks_completed ON tasks(completed);

CREATE TABLE IF NOT EXISTS time_sessions (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  start   TEXT NOT NULL,
  end     TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_task_id ON time_sessions(task_id);
CREATE INDEX IF NOT EXISTS idx_sessions_start   ON time_sessions(start);
CREATE INDEX IF NOT EXISTS idx_sessions_end     ON time_sessions(end);

CREATE TABLE IF NOT EXISTS focus_order (
  focus_id   TEXT PRIMARY KEY,
  sort_order INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shortcuts (
  key   TEXT PRIMARY KEY,
  value TEXT
);
`;

export const useTaskStore = defineStore("tasks", () => {
  const tasks = ref<Task[]>([]);
  const desktops = ref<DesktopInfo[]>([]);
  const focusIds = ref<string[]>([]);
  const selectedIndex = ref<number | null>(null);
  const pomodoroInterval = ref(25);
  const pomodoroDuration = ref(5);
  const shortcuts = ref<ShortcutConfig>({ ...DEFAULT_SHORTCUTS });

  let db: Database | null = null;
  let _unlistenSync: UnlistenFn | null = null;

  // ── 初始化 ──
  async function init() {
    if (!db) {
      db = await Database.load("sqlite:next.db");
      // 建表（幂等）
      for (const stmt of DDL.split(";").map(s => s.trim()).filter(Boolean)) {
        await db.execute(stmt + ";");
      }
      // 首次迁移旧 JSON 数据
      await migrateFromJson();
    }
    await reload();

    if (!_unlistenSync) {
      _unlistenSync = await listen<void>("tasks-updated", async () => {
        await reload();
      });
    }

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      desktops.value = await invoke<DesktopInfo[]>("get_desktops");
    } catch { /* 首次加载桌面失败忽略 */ }
  }

  // ── 从旧 JSON 迁移 ──
  async function migrateFromJson() {
    if (!db) return;
    // 检查是否已有数据（已迁移则跳过）
    const existing = await db.select<{ cnt: number }[]>("SELECT COUNT(*) as cnt FROM tasks");
    if (existing[0]?.cnt > 0) return;

    try {
      const { load } = await import("@tauri-apps/plugin-store");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const oldStore = await (load as any)("next-tasks.json");
      const oldTasks = await oldStore.get("tasks") as Task[] | null;
      const oldFocus = await oldStore.get("focusIds") as string[] | null;
      const oldPomodoro = await oldStore.get("pomodoro") as { interval: number; duration: number } | null;

      if (!oldTasks?.length) return;

      // 迁移设置
      if (oldPomodoro) {
        await db.execute(
          "INSERT OR REPLACE INTO settings(key, value) VALUES ('pomodoro_interval', ?), ('pomodoro_duration', ?)",
          [String(oldPomodoro.interval), String(oldPomodoro.duration)]
        );
      }

      // 迁移任务（顶级）
      for (let i = 0; i < oldTasks.length; i++) {
        const t = oldTasks[i];
        await db.execute(
          `INSERT OR IGNORE INTO tasks(id, parent_id, title, description, due_date, importance, urgency, desktop_id, created_at, completed, sort_order)
           VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [t.id, t.title, t.description ?? null, t.dueDate ?? null,
           t.importance, t.urgency, t.desktopId ?? null,
           t.createdAt, t.completed ? 1 : 0, i]
        );
        // 计时记录
        for (const s of t.timeSessions ?? []) {
          await db.execute(
            "INSERT INTO time_sessions(task_id, start, end) VALUES (?, ?, ?)",
            [t.id, s.start, s.end ?? null]
          );
        }
        // 子任务
        for (let j = 0; j < (t.subtasks ?? []).length; j++) {
          const sub = t.subtasks![j];
          await db.execute(
            `INSERT OR IGNORE INTO tasks(id, parent_id, title, description, due_date, importance, urgency, desktop_id, created_at, completed, sort_order)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [sub.id, t.id, sub.title, sub.description ?? null, sub.dueDate ?? null,
             sub.importance, sub.urgency, sub.desktopId ?? null,
             sub.createdAt, sub.completed ? 1 : 0, j]
          );
          for (const s of sub.timeSessions ?? []) {
            await db.execute(
              "INSERT INTO time_sessions(task_id, start, end) VALUES (?, ?, ?)",
              [sub.id, s.start, s.end ?? null]
            );
          }
        }
      }

      // 迁移专注顺序
      for (let i = 0; i < (oldFocus ?? []).length; i++) {
        await db.execute(
          "INSERT OR REPLACE INTO focus_order(focus_id, sort_order) VALUES (?, ?)",
          [oldFocus![i], i]
        );
      }

      console.log("✅ 数据已从 next-tasks.json 迁移到 SQLite");
    } catch (e) {
      console.warn("旧数据迁移跳过:", e);
    }
  }

  // ── 从 DB 重新加载所有数据到内存 ──
  async function reload() {
    if (!db) return;

    // 加载所有任务行
    const rows = await db.select<TaskRow[]>(
      "SELECT * FROM tasks ORDER BY sort_order ASC, created_at ASC"
    );
    // 加载所有计时记录
    const sessions = await db.select<SessionRow[]>(
      "SELECT * FROM time_sessions ORDER BY start ASC"
    );

    // 按 task_id 分组 sessions
    const sessionMap = new Map<string, TimeSession[]>();
    for (const s of sessions) {
      const arr = sessionMap.get(s.task_id) ?? [];
      arr.push({ start: s.start, end: s.end ?? undefined });
      sessionMap.set(s.task_id, arr);
    }

    // 构建 Task 树
    const topLevel: Task[] = [];
    const taskMap = new Map<string, Task & { _subtaskRows: TaskRow[] }>();

    // 先建顶级任务
    for (const row of rows.filter(r => r.parent_id === null)) {
      const t: Task & { _subtaskRows: TaskRow[] } = {
        id: row.id,
        title: row.title,
        description: row.description ?? undefined,
        dueDate: row.due_date ?? undefined,
        importance: row.importance as Level,
        urgency: row.urgency as Level,
        desktopId: row.desktop_id ?? undefined,
        createdAt: row.created_at,
        completed: row.completed === 1,
        subtasks: [],
        timeSessions: sessionMap.get(row.id) ?? [],
        _subtaskRows: [],
      };
      taskMap.set(row.id, t);
      topLevel.push(t);
    }

    // 挂载子任务
    for (const row of rows.filter(r => r.parent_id !== null)) {
      const parent = taskMap.get(row.parent_id!);
      if (!parent) continue;
      const sub: SubTask = {
        id: row.id,
        title: row.title,
        description: row.description ?? undefined,
        dueDate: row.due_date ?? undefined,
        importance: row.importance as Level,
        urgency: row.urgency as Level,
        desktopId: row.desktop_id ?? undefined,
        createdAt: row.created_at,
        completed: row.completed === 1,
        timeSessions: sessionMap.get(row.id) ?? [],
      };
      parent.subtasks!.push(sub);
    }

    tasks.value = topLevel;

    // 专注顺序
    const focusRows = await db.select<FocusRow[]>(
      "SELECT focus_id FROM focus_order ORDER BY sort_order ASC"
    );
    focusIds.value = focusRows.map(r => r.focus_id);

    // 番茄钟设置
    const settings = await db.select<{ key: string; value: string }[]>(
      "SELECT key, value FROM settings"
    );
    for (const s of settings) {
      if (s.key === "pomodoro_interval") pomodoroInterval.value = Number(s.value);
      if (s.key === "pomodoro_duration") pomodoroDuration.value = Number(s.value);
    }

    // 快捷键（独立表，每项一行）
    const scRows = await db.select<{ key: string; value: string | null }[]>(
      "SELECT key, value FROM shortcuts"
    );
    if (scRows.length > 0) {
      const merged: Partial<ShortcutConfig> = {};
      for (const r of scRows) {
        (merged as Record<string, string | null>)[r.key] = r.value;
      }
      shortcuts.value = { ...DEFAULT_SHORTCUTS, ...merged };
    }
  }

  // ── 通知其他窗口同步 ──
  function notifyOthers() {
    emit("tasks-updated").catch(() => {});
  }

  // ── 任务 CRUD ──
  async function addTask(partial: Omit<Task, "id" | "createdAt" | "completed">) {
    if (!db) return;
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    await db.execute(
      `INSERT INTO tasks(id, parent_id, title, description, due_date, importance, urgency, desktop_id, created_at, completed, sort_order)
       VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, 0, 0)`,
      [id, partial.title, partial.description ?? null, partial.dueDate ?? null,
       partial.importance, partial.urgency, partial.desktopId ?? null, createdAt]
    );
    await reload();
    notifyOthers();
  }

  async function updateTask(id: string, patch: Partial<Omit<Task, "id">>) {
    if (!db) return;
    const fields: string[] = [];
    const vals: unknown[] = [];
    if (patch.title !== undefined)       { fields.push("title = ?");       vals.push(patch.title); }
    if (patch.description !== undefined) { fields.push("description = ?"); vals.push(patch.description ?? null); }
    if (patch.dueDate !== undefined)     { fields.push("due_date = ?");    vals.push(patch.dueDate ?? null); }
    if (patch.importance !== undefined)  { fields.push("importance = ?");  vals.push(patch.importance); }
    if (patch.urgency !== undefined)     { fields.push("urgency = ?");     vals.push(patch.urgency); }
    if (patch.desktopId !== undefined)   { fields.push("desktop_id = ?");  vals.push(patch.desktopId ?? null); }
    if (patch.completed !== undefined)   { fields.push("completed = ?");   vals.push(patch.completed ? 1 : 0); }
    if (!fields.length) return;
    vals.push(id);
    await db.execute(`UPDATE tasks SET ${fields.join(", ")} WHERE id = ?`, vals);
    await reload();
    notifyOthers();
  }

  async function deleteTask(id: string) {
    if (!db) return;
    // 清理子任务在 focus_order 中的引用
    const task = tasks.value.find(t => t.id === id);
    for (const sub of task?.subtasks ?? []) {
      await db.execute("DELETE FROM focus_order WHERE focus_id = ?", [`${id}/${sub.id}`]);
    }
    await db.execute("DELETE FROM focus_order WHERE focus_id = ?", [id]);
    await db.execute("DELETE FROM tasks WHERE id = ?", [id]); // CASCADE 删子任务和 sessions
    await reload();
    notifyOthers();
  }

  async function toggleComplete(id: string) {
    if (!db) return;
    const t = tasks.value.find(t => t.id === id);
    if (!t) return;
    const newVal = t.completed ? 0 : 1;
    await db.execute("UPDATE tasks SET completed = ? WHERE id = ?", [newVal, id]);
    if (newVal === 1) {
      // 完成后从专注列表移除（包括子任务）
      await db.execute("DELETE FROM focus_order WHERE focus_id = ? OR focus_id LIKE ?", [id, `${id}/%`]);
    }
    await reload();
    notifyOthers();
  }

  // ── 子任务 CRUD ──
  async function addSubTask(parentId: string, partial: Omit<SubTask, "id" | "createdAt" | "completed">) {
    if (!db) return;
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const parent = tasks.value.find(t => t.id === parentId);
    const sortOrder = (parent?.subtasks?.length ?? 0);
    await db.execute(
      `INSERT INTO tasks(id, parent_id, title, description, due_date, importance, urgency, desktop_id, created_at, completed, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      [id, parentId, partial.title, partial.description ?? null, partial.dueDate ?? null,
       partial.importance, partial.urgency, partial.desktopId ?? null, createdAt, sortOrder]
    );
    await reload();
    notifyOthers();
  }

  async function updateSubTask(_parentId: string, subId: string, patch: Partial<Omit<SubTask, "id" | "createdAt">>) {
    if (!db) return;
    // 复用 updateTask 逻辑（子任务也在 tasks 表）
    await updateTask(subId, patch);
  }

  async function deleteSubTask(parentId: string, subId: string) {
    if (!db) return;
    await db.execute("DELETE FROM focus_order WHERE focus_id = ?", [`${parentId}/${subId}`]);
    await db.execute("DELETE FROM tasks WHERE id = ?", [subId]);
    await reload();
    notifyOthers();
  }

  async function moveSubTask(parentId: string, subId: string, direction: "up" | "down") {
    if (!db) return;
    const parent = tasks.value.find(t => t.id === parentId);
    if (!parent?.subtasks) return;
    // 只在活跃（未完成）子任务范围内排序，已完成的保持原位置
    const activeSubs = parent.subtasks.filter(s => !s.completed);
    const idx = activeSubs.findIndex(s => s.id === subId);
    if (idx < 0) return;
    if (direction === "up" && idx === 0) return;
    if (direction === "down" && idx === activeSubs.length - 1) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    [activeSubs[idx], activeSubs[swapIdx]] = [activeSubs[swapIdx], activeSubs[idx]];
    // 重建顺序：活跃子任务按新顺序排在前，已完成的追加在后
    const completedSubs = parent.subtasks.filter(s => s.completed);
    const newOrder = [...activeSubs, ...completedSubs];
    for (let i = 0; i < newOrder.length; i++) {
      await db.execute("UPDATE tasks SET sort_order = ? WHERE id = ?", [i, newOrder[i].id]);
    }
    await reload();
    notifyOthers();
  }

  async function pinSubTaskToTop(parentId: string, subId: string) {
    if (!db) return;
    const parent = tasks.value.find(t => t.id === parentId);
    if (!parent?.subtasks) return;
    // 只在活跃子任务范围内置顶，已完成的追加在后
    const activeSubs = parent.subtasks.filter(s => !s.completed);
    const completedSubs = parent.subtasks.filter(s => s.completed);
    const newActive = [subId, ...activeSubs.filter(s => s.id !== subId).map(s => s.id)];
    const newOrder = [...newActive, ...completedSubs.map(s => s.id)];
    for (let i = 0; i < newOrder.length; i++) {
      await db.execute("UPDATE tasks SET sort_order = ? WHERE id = ?", [i, newOrder[i]]);
    }
    await reload();
    notifyOthers();
  }

  async function toggleSubTaskComplete(parentId: string, subId: string) {
    if (!db) return;
    const parent = tasks.value.find(t => t.id === parentId);
    const sub = parent?.subtasks?.find(s => s.id === subId);
    if (!sub) return;
    const newVal = sub.completed ? 0 : 1;
    await db.execute("UPDATE tasks SET completed = ? WHERE id = ?", [newVal, subId]);
    if (newVal === 1) {
      await db.execute("DELETE FROM focus_order WHERE focus_id = ?", [`${parentId}/${subId}`]);
    }
    await reload();
    notifyOthers();
  }

  // ── 专注列表管理 ──
  async function addToFocus(id: string) {
    if (!db || focusIds.value.includes(id)) return;
    // 插入到最前（sort_order = -1，然后重新归一化）
    const newIds = [id, ...focusIds.value];
    await persistFocusOrder(newIds);
    await reload();
    notifyOthers();
  }

  async function removeFromFocus(id: string) {
    if (!db) return;
    await db.execute("DELETE FROM focus_order WHERE focus_id = ?", [id]);
    await reload();
    notifyOthers();
  }

  async function moveFocus(id: string, direction: "up" | "down") {
    const idx = focusIds.value.indexOf(id);
    const newIds = [...focusIds.value];
    if (direction === "up" && idx > 0) {
      [newIds[idx - 1], newIds[idx]] = [newIds[idx], newIds[idx - 1]];
    } else if (direction === "down" && idx < newIds.length - 1) {
      [newIds[idx], newIds[idx + 1]] = [newIds[idx + 1], newIds[idx]];
    } else return;
    await persistFocusOrder(newIds);
    await reload();
    notifyOthers();
  }

  async function pinToTop(id: string) {
    const newIds = [id, ...focusIds.value.filter(fid => fid !== id)];
    await persistFocusOrder(newIds);
    await reload();
    notifyOthers();
  }

  async function reorderFocus(newIds: string[]) {
    await persistFocusOrder(newIds);
    await reload();
    notifyOthers();
  }

  async function persistFocusOrder(ids: string[]) {
    if (!db) return;
    await db.execute("DELETE FROM focus_order");
    for (let i = 0; i < ids.length; i++) {
      await db.execute(
        "INSERT INTO focus_order(focus_id, sort_order) VALUES (?, ?)",
        [ids[i], i]
      );
    }
  }

  function setSelectedIndex(index: number | null) {
    if (index === null) { selectedIndex.value = null; return; }
    if (focusIds.value.length === 0) { selectedIndex.value = null; return; }
    selectedIndex.value = Math.max(0, Math.min(index, focusIds.value.length - 1));
  }

  function getDesktopName(id?: number): string {
    if (id === undefined) return "";
    const d = desktops.value.find(x => x.index === id);
    return d ? d.name : `桌面 ${id}`;
  }

  async function savePomodoroSettings(interval: number, duration: number) {
    if (!db) return;
    pomodoroInterval.value = interval;
    pomodoroDuration.value = duration;
    await db.execute(
      "INSERT OR REPLACE INTO settings(key, value) VALUES ('pomodoro_interval', ?), ('pomodoro_duration', ?)",
      [String(interval), String(duration)]
    );
    notifyOthers();
  }

  async function saveShortcuts(sc: ShortcutConfig) {
    if (!db) return;
    shortcuts.value = { ...sc };
    // 每项快捷键写入独立的 shortcuts 表（value 为 null 表示已清除）
    const entries = Object.entries(sc) as [string, string | null][];
    for (const [key, value] of entries) {
      await db.execute(
        "INSERT OR REPLACE INTO shortcuts(key, value) VALUES (?, ?)",
        [key, value]
      );
    }

    emit("shortcuts-changed").catch(() => {});
    notifyOthers();
  }

  // ── 计时功能（同步从内存读，DB 写通过 toggleTimer）──
  function isTimerRunning(focusId: string): boolean {
    const sessions = getTimeSessions(focusId);
    return sessions.length > 0 && !sessions[sessions.length - 1].end;
  }

  function getTimeSessions(focusId: string): TimeSession[] {
    if (focusId.includes("/")) {
      const [parentId, subId] = focusId.split("/");
      const parent = tasks.value.find(t => t.id === parentId);
      const sub = parent?.subtasks?.find(s => s.id === subId);
      return sub?.timeSessions ?? [];
    }
    const task = tasks.value.find(t => t.id === focusId);
    return task?.timeSessions ?? [];
  }

  async function toggleTimer(focusId: string) {
    if (!db) return;
    const taskId = focusId.includes("/") ? focusId.split("/")[1] : focusId;
    // 查找未关闭的 session
    const openRows = await db.select<SessionRow[]>(
      "SELECT * FROM time_sessions WHERE task_id = ? AND end IS NULL ORDER BY start DESC LIMIT 1",
      [taskId]
    );
    if (openRows.length > 0) {
      // 关闭计时
      await db.execute(
        "UPDATE time_sessions SET end = ? WHERE id = ?",
        [new Date().toISOString(), openRows[0].id]
      );
    } else {
      // 开始计时
      await db.execute(
        "INSERT INTO time_sessions(task_id, start) VALUES (?, ?)",
        [taskId, new Date().toISOString()]
      );
    }
    await reload();
    notifyOthers();
  }

  // ── 解析 focusId ──
  function resolveFocusId(focusId: string): { task: Task | null; subtask: SubTask | null; desktopId?: number } {
    if (focusId.includes("/")) {
      const [parentId, subId] = focusId.split("/");
      const parent = tasks.value.find(t => t.id === parentId) ?? null;
      const sub = parent?.subtasks?.find(s => s.id === subId) ?? null;
      return { task: parent, subtask: sub, desktopId: sub?.desktopId ?? parent?.desktopId };
    }
    const task = tasks.value.find(t => t.id === focusId) ?? null;
    return { task, subtask: null, desktopId: task?.desktopId };
  }

  // ── 计算属性 ──
  const pendingTasks = computed(() => tasks.value.filter(t => !t.completed));

  const focusTasks = computed(() =>
    focusIds.value
      .map(fid => {
        if (fid.includes("/")) {
          const [parentId, subId] = fid.split("/");
          const parent = tasks.value.find(t => t.id === parentId);
          const sub = parent?.subtasks?.find(s => s.id === subId);
          if (!sub) return null;
          return {
            ...sub,
            focusId: fid,
            isSubTask: true as const,
            parentId,
            parentTitle: parent?.title ?? "",
            desktopId: sub.desktopId ?? parent?.desktopId,
          };
        }
        const task = tasks.value.find(t => t.id === fid);
        if (!task) return null;
        return { ...task, focusId: fid, isSubTask: false as const, parentId: undefined, parentTitle: undefined };
      })
      .filter(Boolean) as Array<
        (Task & { focusId: string; isSubTask: false; parentId: undefined; parentTitle: undefined }) |
        (SubTask & { focusId: string; isSubTask: true; parentId: string; parentTitle: string; desktopId?: number })
      >
  );

  const notFocusTasks = computed(() =>
    tasks.value.filter(t => !t.completed && !focusIds.value.includes(t.id))
  );

  const quadrants = computed(() => {
    const pending = pendingTasks.value;
    return {
      urgentImportant:    pending.filter(t => t.urgency >= 2 && t.importance >= 2),
      urgentNotImportant: pending.filter(t => t.urgency >= 2 && t.importance === 1),
      notUrgentImportant: pending.filter(t => t.urgency === 1 && t.importance >= 2),
      neither:            pending.filter(t => t.urgency === 1 && t.importance === 1),
    };
  });

  return {
    tasks,
    focusIds,
    pendingTasks,
    focusTasks,
    notFocusTasks,
    quadrants,
    init,
    addTask,
    updateTask,
    deleteTask,
    toggleComplete,
    addSubTask,
    updateSubTask,
    deleteSubTask,
    toggleSubTaskComplete,
    moveSubTask,
    pinSubTaskToTop,
    addToFocus,
    removeFromFocus,
    moveFocus,
    pinToTop,
    reorderFocus,
    selectedIndex,
    setSelectedIndex,
    desktops,
    getDesktopName,
    pomodoroInterval,
    pomodoroDuration,
    savePomodoroSettings,
    shortcuts,
    saveShortcuts,
    reload,
    resolveFocusId,
    isTimerRunning,
    getTimeSessions,
    toggleTimer,
  };
});
