<template>
  <div class="main-root">
    <!-- 自定义标题栏 (拖拽区) -->
    <div class="custom-titlebar" data-tauri-drag-region>
      <div class="titlebar-controls" @mousedown.stop>
        <button class="titlebar-btn" title="最小化" @click="minimizeWindow">
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor">
            <path d="M1 5.5h9" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>
        <button class="titlebar-btn" title="最大化/还原" @click="maximizeWindow">
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor">
            <path d="M3 3V1h7v7H8" stroke-width="1.5" stroke-linejoin="round"/>
            <rect x="1" y="3" width="7" height="7" stroke-width="1.5" stroke-linejoin="round"/>
          </svg>
        </button>
        <button class="titlebar-btn close-btn" title="关闭" @click="closeWindow">
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor">
            <path d="M2 2l7 7m0-7L2 9" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
    </div>
    <!-- 侧边栏 -->
    <aside class="sidebar">
      <div class="sidebar-brand">
        <span class="brand-text">Next</span>
        <span class="brand-sub">任务焦点</span>
      </div>
      <nav class="sidebar-nav">
        <button
          class="nav-item"
          :class="{ active: view === 'all' }"
          @click="view = 'all'"
        >
          <span class="nav-icon">☰</span> 全部任务
          <span class="nav-badge" v-if="store.pendingTasks.length">{{ store.pendingTasks.length }}</span>
        </button>
        <button
          class="nav-item"
          :class="{ active: view === 'focus' }"
          @click="view = 'focus'"
        >
          <span class="nav-icon">🎯</span> 专注任务
          <span class="nav-badge" v-if="store.focusTasks.length">{{ store.focusTasks.length }}</span>
        </button>
        <button
          class="nav-item"
          :class="{ active: view === 'done' }"
          @click="view = 'done'"
        >
          <span class="nav-icon">✓</span> 已完成
        </button>
      </nav>
      <div style="flex: 1;"></div>
      <nav class="sidebar-nav">
        <button
          class="nav-item"
          :class="{ active: view === 'settings' }"
          @click="view = 'settings'"
        >
          <span class="nav-icon">⚙</span> 设置
        </button>
      </nav>
    </aside>

    <!-- 主内容 -->
    <main class="main-content">
      <!-- 顶部操作栏 -->
      <div class="main-topbar">
        <h1 class="main-title">{{ viewTitle }}</h1>
        <button class="btn btn-primary" @click="openCreate">
          <span>＋</span> 新建任务
        </button>
      </div>

      <!-- 任务列表视图 -->
      <div v-if="view !== 'settings'" class="task-list-view">
        <template v-for="task in listViewTasks" :key="task.id">
          <!-- 任务卡片 -->
          <div
            class="task-card fade-up"
            :class="{ completed: task.completed }"
            @click="openEdit(task)"
          >
            <div class="task-card-left">
              <div class="task-card-check" @click.stop="store.toggleComplete(task.id)">
                <div class="check-circle" :class="{ done: task.completed }">
                  <span v-if="task.completed">✓</span>
                </div>
              </div>
              <div class="task-card-info">
                <span class="task-card-title">{{ task.title }}</span>
                <div class="task-card-meta">
                  <span class="badge" :class="urgencyClass(task.urgency)">{{ urgencyLabel(task.urgency) }}</span>
                  <span class="badge" :class="importanceClass(task.importance)">{{ importanceLabel(task.importance) }}</span>
                  <span v-if="task.dueDate" class="task-card-due" :class="{ overdue: isOverdue(task.dueDate) }">
                    📅 {{ formatDate(task.dueDate) }}
                  </span>
                  <span v-if="task.desktopId !== undefined" class="task-card-desktop">🖥 {{ store.getDesktopName(task.desktopId) }}</span>
                  <span v-if="task.subtasks && task.subtasks.length" class="task-card-subs">⊟ {{ task.subtasks.filter(s=>!s.completed).length }}/{{ task.subtasks.length }}</span>
                </div>
                <p v-if="task.description" class="task-card-desc">{{ task.description }}</p>
              </div>
            </div>
            <div class="task-card-right" @click.stop>
              <!-- 展开子任务按钒（有子任务时显示） -->
              <button
                v-if="task.subtasks && task.subtasks.length"
                class="btn-icon expand-btn"
                :class="{ active: expandedIds.has(task.id) }"
                :title="expandedIds.has(task.id) ? '折叠子任务' : '展开子任务'"
                @click="toggleExpand(task.id)"
              >{{ expandedIds.has(task.id) ? '▾' : '▸' }}</button>
              <div class="timer-wrap-m" @mouseenter="showTimerTip(task.id, $event)" @mouseleave="hideTimerTip">
                <button
                  class="btn-icon timer-btn-m"
                  :class="{ running: store.isTimerRunning(task.id) }"
                  :title="store.isTimerRunning(task.id) ? '暂停计时' : '开始计时'"
                  @click="store.toggleTimer(task.id)"
                >⏱</button>
              </div>
              <button
                class="btn-icon"
                :class="{ active: store.focusIds.includes(task.id) }"
                :title="store.focusIds.includes(task.id) ? '移出专注' : '加入专注'"
                @click="toggleFocus(task.id)"
              >{{ store.focusIds.includes(task.id) ? '★' : '☆' }}</button>
              <button class="btn-icon remove-btn" @click="store.deleteTask(task.id)" title="删除">×</button>
            </div>
          </div>

          <!-- 展开的子任务行 -->
          <template v-if="expandedIds.has(task.id) && task.subtasks && task.subtasks.length">
            <div
              v-for="sub in task.subtasks"
              :key="sub.id"
              class="subtask-row"
              :class="{ completed: sub.completed }"
            >
              <div class="subtask-row-indent"></div>
              <div class="subtask-row-check" @click="store.toggleSubTaskComplete(task.id, sub.id)">
                <div class="check-circle" :class="{ done: sub.completed }">
                  <span v-if="sub.completed">✓</span>
                </div>
              </div>
              <div class="subtask-row-info">
                <span class="subtask-row-title">{{ sub.title }}</span>
                <span v-if="sub.dueDate" class="task-card-due" :class="{ overdue: isOverdue(sub.dueDate) }"> · 📅 {{ formatDate(sub.dueDate) }}</span>
                <span v-if="sub.desktopId !== undefined" class="task-card-desktop"> · 🖥 {{ store.getDesktopName(sub.desktopId) }}</span>
              </div>
              <div class="subtask-row-actions">
                <div class="timer-wrap-m" @mouseenter="showTimerTip(`${task.id}/${sub.id}`, $event)" @mouseleave="hideTimerTip">
                  <button
                    class="btn-icon timer-btn-m"
                    :class="{ running: store.isTimerRunning(`${task.id}/${sub.id}`) }"
                    :title="store.isTimerRunning(`${task.id}/${sub.id}`) ? '暂停计时' : '开始计时'"
                    @click="store.toggleTimer(`${task.id}/${sub.id}`)"
                  >⏱</button>
                </div>
                <button
                  class="btn-icon"
                  :class="{ active: store.focusIds.includes(`${task.id}/${sub.id}`) }"
                  :title="store.focusIds.includes(`${task.id}/${sub.id}`) ? '移出专注' : '加入专注'"
                  @click="toggleFocus(`${task.id}/${sub.id}`)"
                >☆</button>
                <button class="btn-icon remove-btn" @click="store.deleteSubTask(task.id, sub.id)" title="删除">×</button>
              </div>
            </div>
          </template>
        </template>
        <div class="list-empty" v-if="!listViewTasks.length">
          <div class="empty-icon">💭</div>
          <span>暂无任务</span>
        </div>
      </div>

      <!-- 设置视图 -->
      <div v-if="view === 'settings'" class="settings-view fade-up">
        <div class="settings-card fullscreen">
          <h2 class="settings-section-title">⏱ 番茄土豆</h2>
          
          <div class="settings-form">
            <div class="field">
              <label>每隔多少分钟显示一次悬浮窗？（0 为关闭功能）</label>
              <input 
                type="number" 
                class="input" 
                min="0" 
                v-model.number="tempInterval" 
                @blur="saveSettings"
                @keyup.enter="saveSettings" 
              />
            </div>
            <div class="field">
              <label>不聚焦时，多少秒后自动隐藏悬浮窗？</label>
              <input 
                type="number" 
                class="input" 
                min="1" 
                v-model.number="tempDuration" 
                @blur="saveSettings"
                @keyup.enter="saveSettings"
              />
            </div>
          </div>
          <div class="settings-actions">
            <span class="hint" v-if="saveHint">{{ saveHint }}</span>
            <button class="btn btn-primary" @click="saveSettings">保存设置</button>
          </div>
        </div>
      </div>
    </main>

    <!-- TaskEditor Modal -->
    <TaskEditor
      v-if="editorOpen"
      :task="editingTask"
      @close="editorOpen = false"
      @save="handleSave"
    />
  </div>

  <!-- 计时 Tooltip -->
  <Teleport to="body">
    <div v-if="mTimerTip.visible" class="g-timer-tooltip" :style="{ top: mTimerTip.y + 'px', left: mTimerTip.x + 'px', width: mTimerTip.w + 'px' }">
      <div class="g-tt-title">计时记录</div>
      <div v-if="!mTimerTip.sessions.length" class="g-tt-empty">暂无记录</div>
      <div v-for="(s, i) in mTimerTip.sessions" :key="i" class="g-tt-row">
        <span class="g-tt-idx">#{{ i + 1 }}</span>
        <span class="g-tt-range">{{ formatSession(s) }}</span>
        <span class="g-tt-dur">{{ sessionDuration(s) }}</span>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useTaskStore } from "../stores/tasks";
import TaskEditor from "../components/TaskEditor.vue";
import type { Task, Level, TimeSession } from "../stores/tasks";

const appWindow = getCurrentWindow();

function minimizeWindow() { appWindow.minimize().catch(console.error); }
function maximizeWindow() { appWindow.toggleMaximize().catch(console.error); }
function closeWindow() { appWindow.close().catch(console.error); }

const store = useTaskStore();
const view = ref<"focus" | "all" | "done" | "settings">("all");
const editorOpen = ref(false);
const editingTask = ref<Task | null>(null);

// Settings state
const tempInterval = ref(25);
const tempDuration = ref(5);
const saveHint = ref("");

onMounted(async () => {
  await store.init();
  tempInterval.value = store.pomodoroInterval;
  tempDuration.value = store.pomodoroDuration;
});

const viewTitle = computed(() => ({
  focus: "专注任务",
  all: "全部任务",
  done: "已完成",
  settings: "应用设置"
}[view.value]));

const listViewTasks = computed(() => {
  // focus 视图只取父任务（不展示子任务条目）
  if (view.value === "focus") return store.tasks.filter(t => store.focusIds.includes(t.id));
  if (view.value === "done") return store.tasks.filter(t => t.completed);
  return store.pendingTasks; // all
});



function openCreate() {
  editingTask.value = null;
  editorOpen.value = true;
}

async function saveSettings() {
  await store.savePomodoroSettings(tempInterval.value, tempDuration.value);
  saveHint.value = "已保存";
  setTimeout(() => { saveHint.value = ""; }, 2000);
}

function openEdit(task: Task) {
  editingTask.value = task;
  editorOpen.value = true;
}

function handleSave(data: Omit<Task, "id" | "createdAt" | "completed">) {
  if (editingTask.value) {
    store.updateTask(editingTask.value.id, data);
  } else {
    store.addTask(data);
  }
  editorOpen.value = false;
}

// 展开的任务 id 集合
const expandedIds = ref<Set<string>>(new Set());
function toggleExpand(id: string) {
  if (expandedIds.value.has(id)) {
    expandedIds.value.delete(id);
  } else {
    expandedIds.value.add(id);
  }
  // 触发响应式更新
  expandedIds.value = new Set(expandedIds.value);
}

function toggleFocus(id: string) {
  if (store.focusIds.includes(id)) {
    store.removeFromFocus(id);
  } else {
    store.addToFocus(id);
  }
}

const urgencyLabel = (u: Level) => ["", "不紧急", "较紧急", "紧急"][u];
const importanceLabel = (i: Level) => ["", "不重要", "较重要", "重要"][i];
const urgencyClass = (u: Level) => u === 3 ? "badge-high" : u === 2 ? "badge-mid" : "badge-low";
const importanceClass = (i: Level) => i === 3 ? "badge-high" : i === 2 ? "badge-mid" : "badge-low";

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}
function isOverdue(d: string) {
  return new Date(d) < new Date();
}

// ── 计时 Tooltip ──
const mTimerTip = ref<{ visible: boolean; sessions: TimeSession[]; y: number; x: number; w: number }>({
  visible: false, sessions: [], y: 0, x: 0, w: 300,
});
let _mTipTimer: ReturnType<typeof setTimeout> | null = null;

function showTimerTip(focusId: string, e: MouseEvent) {
  if (_mTipTimer) { clearTimeout(_mTipTimer); _mTipTimer = null; }
  const target = e.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  const w = Math.min(300, window.innerWidth - 16);
  const x = Math.max(8, Math.min(rect.left, window.innerWidth - w - 8));
  mTimerTip.value = {
    visible: true,
    sessions: [...store.getTimeSessions(focusId)],
    y: rect.bottom + 6,
    x,
    w,
  };
}

function hideTimerTip() {
  _mTipTimer = setTimeout(() => { mTimerTip.value.visible = false; }, 120);
}

function formatSession(s: TimeSession): string {
  const fmt = (iso: string) => new Date(iso).toLocaleString('zh-CN', {
    month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  return s.end ? `${fmt(s.start)} → ${fmt(s.end)}` : `${fmt(s.start)} → 进行中`;
}

function sessionDuration(s: TimeSession): string {
  const ms = (s.end ? new Date(s.end) : new Date()).getTime() - new Date(s.start).getTime();
  const t = Math.floor(ms / 1000);
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60;
  if (h > 0) return `${h}h${m}m`;
  if (m > 0) return `${m}m${sec}s`;
  return `${sec}s`;
}
</script>

<style scoped>
/* ─ 根布局 ─ */
.main-root {
  display: flex;
  height: 100vh;
  background: var(--bg-base);
  overflow: hidden;
  position: relative;
}

/* ─ 自定义标题栏 ─ */
.custom-titlebar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 32px;
  background: transparent;
  display: flex;
  justify-content: flex-end;
  z-index: 9999;
}
.titlebar-controls {
  display: flex;
}
.titlebar-btn {
  width: 48px;
  height: 32px;
  display: inline-flex;
  justify-content: center;
  align-items: center;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
  outline: none;
}
.titlebar-btn svg {
  display: block;
}
.titlebar-btn:hover {
  background: rgba(197, 175, 164, 0.2);
  color: var(--text-primary);
}
.titlebar-btn.close-btn:hover {
  background: #e81123;
  color: #fff;
}

/* ─ 侧边栏 ─ */
.sidebar {
  width: 180px;
  flex-shrink: 0;
  background: var(--bg-deep);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  padding: 0;
}

.sidebar-brand {
  padding: 34px 16px 16px;
  border-bottom: 1px solid var(--border);
  display: flex;
  flex-direction: column;
}
.brand-text {
  font-size: 18px;
  font-weight: 700;
  background: var(--accent-grad);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
.brand-sub {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 1px;
}

.sidebar-nav {
  padding: 10px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-family: var(--font);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  text-align: left;
  transition: var(--transition);
  position: relative;
}
.nav-item:hover { background: var(--bg-card); color: var(--text-primary); }
.nav-item.active { background: var(--accent-dim); color: var(--accent); }
.nav-icon { font-size: 14px; width: 18px; text-align: center; flex-shrink: 0; }
.nav-badge {
  margin-left: auto;
  background: var(--accent-dim);
  color: var(--accent);
  border-radius: 10px;
  padding: 0 6px;
  font-size: 11px;
  font-weight: 600;
}

/* ─ 主内容 ─ */
.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.main-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 34px 40px 16px 40px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.main-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
}

/* ─ 四象限网格 ─ */
.quadrant-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
  gap: 1px;
  flex: 1;
  overflow: hidden;
  background: var(--border);
}

.quadrant-card {
  background: var(--bg-base);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}
/* 四象限左色条对齐新配色 */
.q-urgentImportant .q-header     { border-left: 3px solid var(--danger); }
.q-urgentNotImportant .q-header  { border-left: 3px solid var(--warning); }
.q-notUrgentImportant .q-header  { border-left: 3px solid var(--dusty-rose); }
.q-neither .q-header             { border-left: 3px solid var(--slate-grey); }

.q-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px 10px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.q-icon { font-size: 18px; }
.q-title { font-size: 13px; font-weight: 600; color: var(--text-primary); }
.q-sub { font-size: 11px; color: var(--text-muted); }

.q-list {
  flex: 1;
  overflow-y: auto;
  padding: 6px 0;
}

.task-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  cursor: pointer;
  transition: background var(--transition);
  border-bottom: 1px solid rgba(197, 175, 164, 0.30);
}
.task-row:hover { background: var(--bg-card-hover); }
.task-row-check { flex-shrink: 0; }
.check-circle {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 1.5px solid var(--text-muted);
  cursor: pointer;
  transition: var(--transition);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 8px;
  color: var(--success);
}
.check-circle.done {
  background: rgba(124, 170, 144, 0.15);
  border-color: var(--success);
}
.task-row-info { flex: 1; display: flex; align-items: center; gap: 8px; min-width: 0; }
.task-row-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}
.task-row-due { font-size: 11px; color: var(--text-muted); flex-shrink: 0; }
.task-row-due.overdue { color: var(--danger); }
.task-row-actions { display: flex; gap: 2px; flex-shrink: 0; }

.q-empty {
  padding: 14px;
  text-align: center;
  font-size: 12px;
  color: var(--text-muted);
}

/* ─ 列表视图 ─ */
.task-list-view {
  flex: 1;
  overflow-y: auto;
  padding: 16px 24px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.task-card {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  cursor: pointer;
  transition: background var(--transition), border-color var(--transition), transform var(--transition);
}
.task-card:hover {
  background: var(--bg-card-hover);
  border-color: rgba(204, 126, 133, 0.22);
  transform: translateY(-1px);
}
.task-card.completed { opacity: 0.5; }

.task-card-left {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.task-card-check { flex-shrink: 0; padding-top: 2px; }

.task-card-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.task-card-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}
.completed .task-card-title { text-decoration: line-through; color: var(--text-muted); }

.task-card-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
}
.task-card-due { font-size: 12px; color: var(--text-muted); }
.task-card-due.overdue { color: var(--danger); }
.task-card-desktop { font-size: 12px; color: var(--text-muted); }
.task-card-subs { font-size: 12px; color: var(--text-muted); }
.task-card-desc {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.task-card-right {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}

.remove-btn:hover { color: var(--danger) !important; }

.list-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--text-muted);
  font-size: 14px;
}
.empty-icon {
  font-size: 36px;
  margin-bottom: 8px;
  opacity: 0.5;
}

/* ─ 设置视图 ─ */
.settings-view {
  padding: 24px;
  flex: 1;
  overflow-y: auto;
  display: flex;
}
.settings-card.fullscreen {
  flex: 1;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 30px 40px;
  max-width: 100%;
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
}
.settings-section-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 24px 0;
}
.settings-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 440px;
}
.settings-actions {
  margin-top: 24px;
  display: flex;
  align-items: center;
  gap: 12px;
}

/* ─ 展开按钮 ─ */
.expand-btn { color: var(--text-muted); font-size: 12px; }
.expand-btn:hover, .expand-btn.active { color: var(--accent); }

/* ─ 子任务行 ─ */
.subtask-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px 6px 0;
  border-bottom: 1px solid rgba(197, 175, 164, 0.18);
  background: rgba(197, 175, 164, 0.04);
  transition: background var(--transition);
}
.subtask-row:hover { background: rgba(197, 175, 164, 0.1); }
.subtask-row.completed { opacity: 0.5; }
.subtask-row.completed .subtask-row-title { text-decoration: line-through; color: var(--text-muted); }

.subtask-row-indent {
  width: 36px;
  flex-shrink: 0;
  border-left: 2px solid rgba(197, 175, 164, 0.3);
  height: 18px;
  margin-left: 24px;
}
.subtask-row-check {
  flex-shrink: 0;
  cursor: pointer;
}
.subtask-row-info {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  flex-wrap: wrap;
}
.subtask-row-title {
  font-size: 13px;
  font-weight: 400;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.subtask-row-actions {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}

/* ─ 计时按钮 ─ */
.timer-wrap-m { display: flex; align-items: center; }
.timer-btn-m {
  color: var(--text-muted);
  font-size: 13px;
  transition: color var(--transition), background var(--transition);
}
.timer-btn-m:hover { color: var(--accent); }
.timer-btn-m.running {
  color: var(--success);
  background: rgba(94, 147, 117, 0.12);
  border-radius: 4px;
}

</style>
