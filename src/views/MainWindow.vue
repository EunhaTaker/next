<template>
  <div class="main-root">
    <!-- 侧边栏 -->
    <aside class="sidebar">
      <div class="sidebar-brand">
        <span class="brand-text">Next</span>
        <span class="brand-sub">任务焦点</span>
      </div>
      <nav class="sidebar-nav">
        <button
          class="nav-item"
          :class="{ active: view === 'quadrant' }"
          @click="view = 'quadrant'"
        >
          <span class="nav-icon">⊞</span> 四象限
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
          :class="{ active: view === 'all' }"
          @click="view = 'all'"
        >
          <span class="nav-icon">☰</span> 全部任务
          <span class="nav-badge" v-if="store.pendingTasks.length">{{ store.pendingTasks.length }}</span>
        </button>
        <button
          class="nav-item"
          :class="{ active: view === 'done' }"
          @click="view = 'done'"
        >
          <span class="nav-icon">✓</span> 已完成
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

      <!-- 四象限视图 -->
      <div v-if="view === 'quadrant'" class="quadrant-grid">
        <div
          v-for="q in quadrantDefs"
          :key="q.key"
          class="quadrant-card"
          :class="`q-${q.key}`"
        >
          <div class="q-header">
            <span class="q-icon">{{ q.icon }}</span>
            <div>
              <div class="q-title">{{ q.title }}</div>
              <div class="q-sub">{{ q.sub }}</div>
            </div>
          </div>
          <div class="q-list">
            <div
              v-for="task in store.quadrants[q.key as keyof typeof store.quadrants]"
              :key="task.id"
              class="task-row"
              @click="openEdit(task)"
            >
              <div class="task-row-check" @click.stop="store.toggleComplete(task.id)">
                <div class="check-circle"></div>
              </div>
              <div class="task-row-info">
                <span class="task-row-title">{{ task.title }}</span>
                <span v-if="task.dueDate" class="task-row-due" :class="{ overdue: isOverdue(task.dueDate) }">
                  {{ formatDate(task.dueDate) }}
                </span>
              </div>
              <div class="task-row-actions" @click.stop>
                <button
                  class="btn-icon"
                  :class="{ active: store.focusIds.includes(task.id) }"
                  :title="store.focusIds.includes(task.id) ? '已在专注列表' : '加入专注'"
                  @click="toggleFocus(task.id)"
                >{{ store.focusIds.includes(task.id) ? '★' : '☆' }}</button>
                <button class="btn-icon remove-btn" @click="store.deleteTask(task.id)" title="删除">×</button>
              </div>
            </div>
            <div v-if="!store.quadrants[q.key as keyof typeof store.quadrants].length" class="q-empty">
              暂无任务
            </div>
          </div>
        </div>
      </div>

      <!-- 专注任务 / 全部 / 已完成 视图 -->
      <div v-else class="task-list-view">
        <div
          v-for="task in listViewTasks"
          :key="task.id"
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
                <span v-if="task.desktopId" class="task-card-desktop">🖥 桌面 {{ task.desktopId }}</span>
              </div>
              <p v-if="task.description" class="task-card-desc">{{ task.description }}</p>
            </div>
          </div>
          <div class="task-card-right" @click.stop>
            <button
              class="btn-icon"
              :class="{ active: store.focusIds.includes(task.id) }"
              :title="store.focusIds.includes(task.id) ? '移出专注' : '加入专注'"
              @click="toggleFocus(task.id)"
            >{{ store.focusIds.includes(task.id) ? '★' : '☆' }}</button>
            <button class="btn-icon remove-btn" @click="store.deleteTask(task.id)" title="删除">×</button>
          </div>
        </div>
        <div class="list-empty" v-if="!listViewTasks.length">
          <div class="empty-icon">📭</div>
          <span>暂无任务</span>
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
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useTaskStore } from "../stores/tasks";
import TaskEditor from "../components/TaskEditor.vue";
import type { Task, Level } from "../stores/tasks";

const store = useTaskStore();
const view = ref<"quadrant" | "focus" | "all" | "done">("quadrant");
const editorOpen = ref(false);
const editingTask = ref<Task | null>(null);

onMounted(() => store.init());

const viewTitle = computed(() => ({
  quadrant: "四象限视图",
  focus: "专注任务",
  all: "全部任务",
  done: "已完成",
}[view.value]));

const listViewTasks = computed(() => {
  if (view.value === "focus") return store.focusTasks;
  if (view.value === "done") return store.tasks.filter(t => t.completed);
  return store.pendingTasks; // all
});

const quadrantDefs = [
  { key: "urgentImportant", icon: "🔥", title: "紧急重要", sub: "立即处理" },
  { key: "urgentNotImportant", icon: "⚡", title: "紧急不重要", sub: "委托 / 快速处理" },
  { key: "notUrgentImportant", icon: "📈", title: "重要不紧急", sub: "计划推进" },
  { key: "neither", icon: "📦", title: "不紧急不重要", sub: "考虑降级" },
];

function openCreate() {
  editingTask.value = null;
  editorOpen.value = true;
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
</script>

<style scoped>
/* ─ 根布局 ─ */
.main-root {
  display: flex;
  height: 100vh;
  background: var(--bg-base);
  overflow: hidden;
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
  padding: 20px 16px 16px;
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
.nav-item.active { background: var(--accent-dim); color: var(--accent-light); }
.nav-icon { font-size: 14px; }
.nav-badge {
  margin-left: auto;
  background: var(--accent-dim);
  color: var(--accent-light);
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
  padding: 18px 24px 14px;
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
.empty-icon { font-size: 36px; }
</style>
