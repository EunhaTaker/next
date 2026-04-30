<template>
  <div class="float-root">
    <!-- 标题栏 -->
    <div class="float-header" data-tauri-drag-region>
      <span class="float-brand">Next</span>
      <!-- 按钮区不参与拖拽 -->
      <div class="float-header-actions" @mousedown.stop>
        <button
          class="btn-icon split-btn"
          :class="{ active: splitView }"
          title="拆分视图 (t)"
          @click="toggleSplitView"
        >⊟</button>
        <button class="btn-icon" :title="side === 'right' ? '贴靠左侧' : '贴靠右侧'" @click="snapSide">{{ side === 'right' ? '⟵' : '⟶' }}</button>
        <button class="btn-icon" title="打开管理窗口" @click="openMain">⊞</button>
        <button class="btn-icon" title="隐藏悬浮窗" @click="hideFloat">−</button>
      </div>
    </div>

    <!-- 默认视图：完整专注任务列表 -->
    <div class="float-list" v-if="!splitView && store.focusTasks.length">
      <div
        v-for="(task, idx) in store.focusTasks"
        :key="task.focusId"
        class="float-item fade-up"
        :class="{ completed: task.completed, selected: store.selectedIndex === idx, 'is-subtask': task.isSubTask }"
        :style="{ animationDelay: `${idx * 0.04}s` }"
      >
        <!-- 上移 / 下移 按钮 -->
        <div class="move-btns">
          <button class="btn-icon move-btn" :disabled="idx === 0" @click="store.moveFocus(task.focusId, 'up')" title="上移">▲</button>
          <button class="btn-icon move-btn" :disabled="idx === store.focusTasks.length - 1" @click="store.moveFocus(task.focusId, 'down')" title="下移">▼</button>
        </div>

        <!-- 置顶按钮 -->
        <button
          class="btn-icon pin-btn"
          :class="{ active: idx === 0 }"
          @click="store.pinToTop(task.focusId)"
          title="置顶"
        >⇈</button>

        <!-- 任务内容 -->
        <div class="float-item-content" @click="toggleSelect(idx)">
          <div
            class="float-item-check"
            :class="{ done: task.completed }"
            @click.stop="handleToggleComplete(task)"
          >
            <span v-if="task.completed">✓</span>
          </div>
          <div class="float-item-info">
            <span v-if="task.isSubTask" class="subtask-parent-label">{{ task.parentTitle }}</span>
            <span class="float-item-title">{{ task.title }}</span>
            <div class="float-item-meta" v-if="!task.isSubTask && (task as any).dueDate">
              <span class="meta-due" :class="{ overdue: isOverdue((task as any).dueDate) }">
                📅 {{ formatDate((task as any).dueDate) }}
              </span>
            </div>
          </div>
        </div>

        <!-- 操作右侧 -->
        <div class="float-item-actions">
          <button
            v-if="task.desktopId !== undefined"
            class="btn-icon"
            title="切换到对应桌面"
            @click="switchDesktop(task.desktopId!)"
          >→</button>
          <button class="btn-icon remove-btn" title="移出专注" @click="store.removeFromFocus(task.focusId)">×</button>
        </div>
      </div>
    </div>

    <!-- 拆分视图：只显示第一个父任务和它的子任务 -->
    <div class="float-list split-mode" v-else-if="splitView && firstParentTask">
      <!-- 父任务行 -->
      <div
        class="float-item split-parent fade-up"
        :class="{ completed: firstParentTask.completed, selected: store.selectedIndex === 0 }"
      >
        <div class="float-item-content" @click="toggleSelect(0)">
          <div class="float-item-check" :class="{ done: firstParentTask.completed }" @click.stop="store.toggleComplete(firstParentTask.id)">
            <span v-if="firstParentTask.completed">✓</span>
          </div>
          <div class="float-item-info">
            <span class="float-item-title split-parent-title">{{ firstParentTask.title }}</span>
          </div>
        </div>
        <div class="float-item-actions">
          <button v-if="firstParentTask.desktopId !== undefined" class="btn-icon" title="切换到对应桌面" @click="switchDesktop(firstParentTask.desktopId!)">→</button>
        </div>
      </div>

      <!-- 子任务列表（未完成的） -->
      <div
        v-for="(sub, si) in activeSubs"
        :key="sub.id"
        class="float-item split-sub fade-up"
        :class="{ completed: sub.completed }"
        :style="{ animationDelay: `${(si + 1) * 0.04}s` }"
      >
        <div class="split-sub-indent"></div>
        <div class="float-item-content" @click="() => {}">
          <div class="float-item-check" :class="{ done: sub.completed }" @click.stop="store.toggleSubTaskComplete(firstParentTask.id, sub.id)">
            <span v-if="sub.completed">✓</span>
          </div>
          <div class="float-item-info">
            <span class="float-item-title">{{ sub.title }}</span>
          </div>
        </div>
        <div class="float-item-actions">
          <button v-if="sub.desktopId !== undefined" class="btn-icon" title="切换到对应桌面" @click="switchDesktop(sub.desktopId!)">→</button>
        </div>
      </div>

      <!-- 无子任务提示 -->
      <div v-if="firstParentTask.subtasks && firstParentTask.subtasks.length === 0" class="split-no-sub">
        暂无子任务
      </div>
      <!-- 所有子任务完成时提示 -->
      <div v-else-if="activeSubs.length === 0" class="split-no-sub">
        🎉 全部子任务已完成
      </div>
    </div>

    <!-- 空状态 -->
    <div class="float-empty" v-else>
      <div class="empty-icon">🎯</div>
      <span>点击 + 添加专注任务</span>
    </div>

    <!-- 底部 + 按钮 -->
    <button class="float-add-btn" @click="showPicker = true" title="添加专注任务">
      <span class="add-plus">＋</span>
    </button>

    <!-- TaskPicker 弹窗 -->
    <TaskPicker v-if="showPicker" @close="showPicker = false" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from "vue";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { invoke } from "@tauri-apps/api/core";
import { useTaskStore } from "../stores/tasks";
import TaskPicker from "../components/TaskPicker.vue";

const store = useTaskStore();
const showPicker = ref(false);
const splitView = ref(false);

// ── 拆分视图：取第一个父任务 ──
const firstParentTask = computed(() => {
  // 找第一个非子任务的专注任务
  const first = store.focusTasks.find(t => !t.isSubTask);
  if (!first) return null;
  return store.tasks.find(t => t.id === first.id) ?? null;
});

const activeSubs = computed(() => {
  if (!firstParentTask.value) return [];
  return (firstParentTask.value.subtasks ?? []).filter(s => !s.completed);
});

function toggleSplitView() {
  splitView.value = !splitView.value;
  // 高度由 watch(currentItemCount) 自动触发，无需手动调用
}

// 父任务完成时退出拆分视图
watch(
  () => firstParentTask.value?.completed,
  (completed) => {
    if (completed && splitView.value) {
      splitView.value = false;
    }
  }
);

// ── 番茄钟 ──
let pomodoroIntervalId: ReturnType<typeof setInterval> | null = null;
let pomodoroPollId: ReturnType<typeof setInterval> | null = null;
let pomodoroEndTime = 0;

function stopPomodoroPoll() {
  if (pomodoroPollId) { clearInterval(pomodoroPollId); pomodoroPollId = null; }
}

function triggerPomodoro() {
  invoke("show_float_window_passive").catch(() => {});
  stopPomodoroPoll();
  pomodoroEndTime = Date.now() + Math.max(1, store.pomodoroDuration) * 1000;
  pomodoroPollId = setInterval(() => {
    if (Date.now() >= pomodoroEndTime) {
      invoke("hide_float_window").catch(() => {});
      stopPomodoroPoll();
    }
  }, 200);
}

function setupPomodoro() {
  if (pomodoroIntervalId) { clearInterval(pomodoroIntervalId); pomodoroIntervalId = null; }
  stopPomodoroPoll();
  const intervalMin = store.pomodoroInterval;
  if (intervalMin > 0) {
    pomodoroIntervalId = setInterval(triggerPomodoro, intervalMin * 60 * 1000);
  }
}

watch(() => store.pomodoroInterval, setupPomodoro);
const side = ref<'left' | 'right'>('right');

let dClickTimer: ReturnType<typeof setTimeout> | null = null;
let dClickCount = 0;

function handleKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") {
    store.setSelectedIndex(null);
    return;
  }

  // t 键：切换拆分视图
  if (e.key === "t" && store.selectedIndex !== null) {
    e.preventDefault();
    toggleSplitView();
    return;
  }

  if (store.focusTasks.length === 0) return;

  if (e.key === "ArrowUp" || e.key === "ArrowDown") {
    e.preventDefault();
    const isAlt = e.altKey;
    const isUp = e.key === "ArrowUp";

    if (isAlt) {
      if (store.selectedIndex === null) return;
      const focusId = store.focusTasks[store.selectedIndex].focusId;
      if (isUp && store.selectedIndex > 0) {
        store.moveFocus(focusId, "up");
        store.setSelectedIndex(store.selectedIndex - 1);
      } else if (!isUp && store.selectedIndex < store.focusTasks.length - 1) {
        store.moveFocus(focusId, "down");
        store.setSelectedIndex(store.selectedIndex + 1);
      }
    } else {
      let newIdx = store.selectedIndex ?? (isUp ? store.focusTasks.length - 1 : 0);
      if (store.selectedIndex !== null) {
        newIdx = isUp ? Math.max(0, newIdx - 1) : Math.min(store.focusTasks.length - 1, newIdx + 1);
      }
      store.setSelectedIndex(newIdx);
      const activeEl = document.querySelector(".float-item.selected");
      if (activeEl) activeEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
    return;
  }

  if (store.selectedIndex !== null && store.focusTasks[store.selectedIndex]) {
    const task = store.focusTasks[store.selectedIndex];
    if (e.key === "c") {
      e.preventDefault();
      store.removeFromFocus(task.focusId);
      if (store.selectedIndex >= store.focusTasks.length) {
        store.setSelectedIndex(store.focusTasks.length > 0 ? store.focusTasks.length - 1 : null);
      }
    } else if (e.key === "d") {
      e.preventDefault();
      dClickCount++;
      if (dClickTimer) clearTimeout(dClickTimer);

      if (dClickCount >= 2) {
        // 双击 d：完成任务
        if (task.isSubTask) {
          store.toggleSubTaskComplete(task.parentId, task.id);
        } else {
          store.toggleComplete(task.id);
        }
        dClickCount = 0;
      } else {
        dClickTimer = setTimeout(() => {
          if (dClickCount === 1 && task.desktopId !== undefined) {
            invoke("switch_to_desktop", { index: task.desktopId }).catch(console.error);
          }
          dClickCount = 0;
        }, 400);
      }
    }
  }
}

onMounted(() => {
  document.documentElement.style.background = 'transparent';
  document.body.style.background = 'transparent';
  const app = document.getElementById('app');
  if (app) app.style.background = 'transparent';
  store.init().then(() => setupPomodoro());
  adjustHeight(store.focusTasks.length);
  window.addEventListener("keydown", handleKeydown);
});

onUnmounted(() => {
  if (pomodoroIntervalId) clearInterval(pomodoroIntervalId);
  stopPomodoroPoll();
  window.removeEventListener("keydown", handleKeydown);
});

const HEADER_H = 45;
const LIST_PAD = 12;
const ITEM_H   = 49;
const ADDBTN_H = 40;
const EMPTY_H  = 80;
const MAX_H    = 600;
const MIN_H    = HEADER_H + EMPTY_H + ADDBTN_H;

// 当前视图下实际显示的条目数（用于高度计算）
const currentItemCount = computed(() => {
  if (splitView.value && firstParentTask.value) {
    // 1 父任务 + 未完成子任务数（至少显示 1 行提示，但高度按实际条目算）
    return 1 + activeSubs.value.length;
  }
  return store.focusTasks.length;
});

function adjustHeight(count: number) {
  const scale = window.devicePixelRatio || 1;
  const logical = count > 0
    ? Math.min(HEADER_H + LIST_PAD + count * ITEM_H + ADDBTN_H, MAX_H)
    : MIN_H;
  const physical = Math.round(logical * scale);
  invoke("resize_float_window", { height: physical }).catch(console.error);
}

watch(currentItemCount, (n) => adjustHeight(n));

function snapSide() {
  const target = side.value === 'right' ? 'left' : 'right';
  side.value = target;
  invoke('snap_float_window', { side: target }).catch(console.error);
}

async function openMain() {
  try {
    new WebviewWindow("main", {
      url: "/?w=main",
      title: "Next — 任务管理",
      width: 720,
      height: 560,
      center: true,
      decorations: false,
    });
  } catch (e) {
    console.error("openMain failed:", e);
  }
}

function hideFloat() {
  getCurrentWindow().hide().catch(console.error);
}

function handleToggleComplete(task: (typeof store.focusTasks)[number]) {
  if (task.isSubTask) {
    store.toggleSubTaskComplete(task.parentId, task.id);
  } else {
    store.toggleComplete(task.id);
    // 完成父任务后退出拆分视图
    if (splitView.value) splitView.value = false;
  }
}

function toggleSelect(idx: number) {
  if (store.selectedIndex === idx) {
    store.setSelectedIndex(null);
  } else {
    store.setSelectedIndex(idx);
  }
}

function switchDesktop(desktopId: number) {
  invoke("switch_to_desktop", { index: desktopId }).catch(console.error);
}

function formatDate(d: string) {
  const date = new Date(d);
  return date.toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function isOverdue(d: string) {
  return new Date(d) < new Date();
}
</script>

<style scoped>
.float-root {
  width: 100%;
  height: 100vh;
  background: rgba(253, 251, 251, 0.96);
  backdrop-filter: blur(20px) saturate(120%);
  -webkit-backdrop-filter: blur(20px) saturate(120%);
  border: 1px solid rgba(197, 175, 164, 0.45);
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: var(--shadow-float);
}

/* ── 标题栏 ── */
.float-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 10px 8px 14px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  cursor: grab;
}
.float-header:active { cursor: grabbing; }

.float-brand {
  font-size: 13px;
  font-weight: 700;
  background: var(--accent-grad);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  letter-spacing: 0.06em;
}

.float-header-actions {
  display: flex;
  gap: 2px;
}

.split-btn.active {
  color: var(--accent);
  background: rgba(204, 126, 133, 0.12);
  border-radius: 4px;
}

/* ── 任务列表 ── */
.float-list {
  flex: 1;
  overflow-y: auto;
  padding: 6px 0;
}

.float-item {
  display: flex;
  align-items: center;
  box-sizing: border-box;
  gap: 2px;
  height: 49px;
  flex-shrink: 0;
  padding: 6px 8px 6px 6px;
  border: 1px solid transparent;
  border-bottom: 1px solid rgba(197, 175, 164, 0.3);
  transition: all var(--transition);
  overflow: hidden;
}
.float-item:hover { background: rgba(197, 175, 164, 0.12); }
.float-item.completed { opacity: 0.45; }
.float-item.selected {
  background: rgba(197, 175, 164, 0.15);
  border-radius: var(--radius-sm);
  border-color: var(--dusty-rose);
  transform: translateX(2px);
}
.float-item.is-subtask {
  background: rgba(197, 175, 164, 0.04);
  padding-left: 14px;
}

/* 上移下移按钮组 */
.move-btns {
  display: flex;
  flex-direction: column;
  gap: 0;
  flex-shrink: 0;
}
.move-btn {
  width: 18px;
  height: 18px;
  font-size: 9px;
  color: var(--text-muted);
}
.move-btn:hover:not(:disabled) { color: var(--dusty-rose); }
.move-btn:disabled { opacity: 0.2; cursor: default; }

/* 置顶按钮 */
.pin-btn {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  font-size: 12px;
  color: var(--text-muted);
}
.pin-btn:hover, .pin-btn.active { color: var(--accent); }

/* 任务内容区 */
.float-item-content {
  flex: 1;
  display: flex;
  align-items: flex-start;
  gap: 7px;
  cursor: pointer;
  min-width: 0;
}

.float-item-check {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1.5px solid var(--text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  color: var(--success);
  flex-shrink: 0;
  margin-top: 1px;
  transition: var(--transition);
}
.float-item-check.done {
  background: rgba(124, 170, 144, 0.15);
  border-color: var(--success);
}

.float-item-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.subtask-parent-label {
  font-size: 9px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.2;
}

.float-item-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.3;
}
.completed .float-item-title { text-decoration: line-through; color: var(--text-muted); }

.float-item-meta {
  display: flex;
  gap: 6px;
  flex-wrap: nowrap;
  overflow: hidden;
}
.meta-due {
  font-size: 10px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-shrink: 1;
}
.meta-due.overdue { color: var(--danger); }

/* 右侧操作 */
.float-item-actions {
  display: flex;
  gap: 1px;
  flex-shrink: 0;
}
.remove-btn { color: var(--text-muted); }
.remove-btn:hover { color: var(--danger); }

/* ── 拆分视图 ── */
.split-parent {
  border-bottom: 2px solid rgba(204, 126, 133, 0.3);
  background: rgba(204, 126, 133, 0.04);
}
.split-parent-title {
  font-weight: 700;
  font-size: 13px;
}
.split-sub {
  height: 42px;
  padding-left: 4px;
}
.split-sub-indent {
  width: 12px;
  flex-shrink: 0;
  border-left: 2px solid rgba(197, 175, 164, 0.35);
  height: 70%;
  margin-left: 6px;
}
.split-no-sub {
  padding: 12px;
  text-align: center;
  font-size: 12px;
  color: var(--text-muted);
}

/* ── 空状态 ── */
.float-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--text-muted);
  font-size: 12px;
}
.empty-icon { font-size: 28px; }

/* ── + 按钮 ── */
.float-add-btn {
  flex-shrink: 0;
  width: 100%;
  height: 40px;
  background: rgba(204, 126, 133, 0.07);
  border: none;
  border-top: 1px solid var(--border);
  color: var(--accent);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background var(--transition);
}
.float-add-btn:hover {
  background: rgba(204, 126, 133, 0.14);
}
.add-plus {
  font-size: 20px;
  font-weight: 300;
  line-height: 1;
}
</style>
