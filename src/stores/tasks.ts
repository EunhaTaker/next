import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { load } from "@tauri-apps/plugin-store";
import { emit, listen } from "@tauri-apps/api/event";
import type { UnlistenFn } from "@tauri-apps/api/event";

export type Level = 1 | 2 | 3; // 1=低 2=中 3=高

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
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  dueDate?: string; // ISO 8601 date string
  importance: Level;
  urgency: Level;
  desktopId?: number;
  createdAt: string;
  completed: boolean;
  subtasks?: SubTask[];
}

export interface DesktopInfo {
  index: number;
  name: string;
  is_current: boolean;
}

export const useTaskStore = defineStore("tasks", () => {
  const tasks = ref<Task[]>([]);
  const desktops = ref<DesktopInfo[]>([]);
  const focusIds = ref<string[]>([]); // 专注任务 id 列表（有序），可包含子任务 id（格式: "parentId/subtaskId"）
  const selectedIndex = ref<number | null>(null); // 当前高亮选中的任务索引
  const pomodoroInterval = ref(25); // 默认25分钟
  const pomodoroDuration = ref(5);  // 默认5秒
  let storeInstance: Awaited<ReturnType<typeof load>> | null = null;
  let _unlistenSync: UnlistenFn | null = null;

  // ── 初始化（从磁盘加载 + 监听跨窗口更新事件）──
  async function init() {
    if (!storeInstance) {
      storeInstance = await load("next-tasks.json", { autoSave: false });
    }
    await reload();

    // 监听其他窗口的数据变更通知（只注册一次）
    if (!_unlistenSync) {
      _unlistenSync = await listen<void>("tasks-updated", async () => {
        await reload();
      });
    }

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      desktops.value = await invoke<DesktopInfo[]>("get_desktops");
    } catch {
      // 首次加载桌面失败忽略
    }
  }

  async function reload() {
    if (!storeInstance) return;
    const savedTasks = await storeInstance.get<Task[]>("tasks");
    const savedFocus = await storeInstance.get<string[]>("focusIds");
    const savedPomodoro = await storeInstance.get<{ interval: number; duration: number }>("pomodoro");
    if (savedTasks) tasks.value = savedTasks;
    if (savedFocus) focusIds.value = savedFocus;
    if (savedPomodoro) {
      pomodoroInterval.value = savedPomodoro.interval;
      pomodoroDuration.value = savedPomodoro.duration;
    }
  }

  async function persist() {
    if (!storeInstance) return;
    await storeInstance.set("tasks", tasks.value);
    await storeInstance.set("focusIds", focusIds.value);
    await storeInstance.set("pomodoro", { interval: pomodoroInterval.value, duration: pomodoroDuration.value });
    await storeInstance.save();
    // 通知所有窗口数据已更新
    emit("tasks-updated").catch(() => {});
  }

  // ── 任务 CRUD ──
  function addTask(partial: Omit<Task, "id" | "createdAt" | "completed">) {
    const task: Task = {
      ...partial,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      completed: false,
      subtasks: [],
    };
    tasks.value.unshift(task);
    persist();
    return task;
  }

  function updateTask(id: string, patch: Partial<Omit<Task, "id">>) {
    const idx = tasks.value.findIndex((t) => t.id === id);
    if (idx < 0) return;
    tasks.value[idx] = { ...tasks.value[idx], ...patch };
    persist();
  }

  function deleteTask(id: string) {
    // 删除任务时，同时清理其子任务在 focusIds 中的引用
    const task = tasks.value.find(t => t.id === id);
    if (task?.subtasks) {
      for (const sub of task.subtasks) {
        focusIds.value = focusIds.value.filter(fid => fid !== `${id}/${sub.id}`);
      }
    }
    tasks.value = tasks.value.filter((t) => t.id !== id);
    focusIds.value = focusIds.value.filter((fid) => fid !== id);
    persist();
  }

  function toggleComplete(id: string) {
    const t = tasks.value.find((t) => t.id === id);
    if (t) {
      t.completed = !t.completed;
      // 任务完成后从专注列表移除（包括其子任务）
      if (t.completed) {
        focusIds.value = focusIds.value.filter((fid) => fid !== id && !fid.startsWith(`${id}/`));
      }
    }
    persist();
  }

  // ── 子任务 CRUD ──
  function addSubTask(parentId: string, partial: Omit<SubTask, "id" | "createdAt" | "completed">) {
    const parent = tasks.value.find(t => t.id === parentId);
    if (!parent) return;
    if (!parent.subtasks) parent.subtasks = [];
    const sub: SubTask = {
      ...partial,
      id: crypto.randomUUID(),
      completed: false,
      createdAt: new Date().toISOString(),
    };
    parent.subtasks.push(sub);
    persist();
    return sub;
  }

  function updateSubTask(parentId: string, subId: string, patch: Partial<Omit<SubTask, "id" | "createdAt">>) {
    const parent = tasks.value.find(t => t.id === parentId);
    if (!parent?.subtasks) return;
    const idx = parent.subtasks.findIndex(s => s.id === subId);
    if (idx < 0) return;
    parent.subtasks[idx] = { ...parent.subtasks[idx], ...patch };
    persist();
  }

  function deleteSubTask(parentId: string, subId: string) {
    const parent = tasks.value.find(t => t.id === parentId);
    if (!parent?.subtasks) return;
    parent.subtasks = parent.subtasks.filter(s => s.id !== subId);
    focusIds.value = focusIds.value.filter(fid => fid !== `${parentId}/${subId}`);
    persist();
  }

  function toggleSubTaskComplete(parentId: string, subId: string) {
    const parent = tasks.value.find(t => t.id === parentId);
    if (!parent?.subtasks) return;
    const sub = parent.subtasks.find(s => s.id === subId);
    if (sub) {
      sub.completed = !sub.completed;
      // 子任务完成后从专注列表移除
      if (sub.completed) {
        focusIds.value = focusIds.value.filter(fid => fid !== `${parentId}/${subId}`);
      }
    }
    persist();
  }

  // ── 专注列表管理 ──
  function addToFocus(id: string) {
    if (!focusIds.value.includes(id)) {
      focusIds.value.unshift(id);
      persist();
    }
  }

  function removeFromFocus(id: string) {
    focusIds.value = focusIds.value.filter((fid) => fid !== id);
    persist();
  }

  function moveFocus(id: string, direction: "up" | "down") {
    const idx = focusIds.value.indexOf(id);
    if (direction === "up" && idx > 0) {
      [focusIds.value[idx - 1], focusIds.value[idx]] = [
        focusIds.value[idx],
        focusIds.value[idx - 1],
      ];
    } else if (direction === "down" && idx < focusIds.value.length - 1) {
      [focusIds.value[idx], focusIds.value[idx + 1]] = [
        focusIds.value[idx + 1],
        focusIds.value[idx],
      ];
    }
    persist();
  }

  function pinToTop(id: string) {
    focusIds.value = focusIds.value.filter((fid) => fid !== id);
    focusIds.value.unshift(id);
    persist();
  }

  function reorderFocus(newIds: string[]) {
    focusIds.value = newIds;
    persist();
  }

  function setSelectedIndex(index: number | null) {
    if (index === null) {
      selectedIndex.value = null;
      return;
    }
    if (focusIds.value.length === 0) {
      selectedIndex.value = null;
      return;
    }
    const max = focusIds.value.length - 1;
    selectedIndex.value = Math.max(0, Math.min(index, max));
  }

  function getDesktopName(id?: number): string {
    if (id === undefined) return "";
    const d = desktops.value.find(x => x.index === id);
    return d ? d.name : `桌面 ${id}`;
  }

  async function savePomodoroSettings(interval: number, duration: number) {
    pomodoroInterval.value = interval;
    pomodoroDuration.value = duration;
    await persist();
  }

  // ── 解析 focusId（支持子任务格式 "parentId/subId"）──
  function resolveFocusId(focusId: string): { task: Task | null; subtask: SubTask | null; desktopId?: number } {
    if (focusId.includes("/")) {
      const [parentId, subId] = focusId.split("/");
      const parent = tasks.value.find(t => t.id === parentId) ?? null;
      const sub = parent?.subtasks?.find(s => s.id === subId) ?? null;
      const desktopId = sub?.desktopId ?? parent?.desktopId;
      return { task: parent, subtask: sub, desktopId };
    }
    const task = tasks.value.find(t => t.id === focusId) ?? null;
    return { task, subtask: null, desktopId: task?.desktopId };
  }

  // ── 计算属性 ──
  const pendingTasks = computed(() =>
    tasks.value.filter((t) => !t.completed)
  );

  // focusTasks: 将 focusIds 中的每一个 id 解析为一个展示对象
  // 用于悬浮窗列表渲染，包含 isSubTask 标记
  const focusTasks = computed(() =>
    focusIds.value
      .map((fid) => {
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
    tasks.value.filter((t) => !t.completed && !focusIds.value.includes(t.id))
  );

  const quadrants = computed(() => {
    const pending = pendingTasks.value;
    return {
      urgentImportant: pending.filter(
        (t) => t.urgency >= 2 && t.importance >= 2
      ),
      urgentNotImportant: pending.filter(
        (t) => t.urgency >= 2 && t.importance === 1
      ),
      notUrgentImportant: pending.filter(
        (t) => t.urgency === 1 && t.importance >= 2
      ),
      neither: pending.filter(
        (t) => t.urgency === 1 && t.importance === 1
      ),
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
    resolveFocusId,
  };
});
