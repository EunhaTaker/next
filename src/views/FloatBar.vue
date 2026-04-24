<template>
  <div class="float-root">
    <!-- 标题栏 -->
    <div class="float-header" data-tauri-drag-region>
      <span class="float-brand">Next</span>
      <!-- 按钮区不参与拖拽 -->
      <div class="float-header-actions" @mousedown.stop>
        <button class="btn-icon" :title="side === 'right' ? '贴靠左侧' : '贴靠右侧'" @click="snapSide">{{ side === 'right' ? '⟵' : '⟶' }}</button>
        <button class="btn-icon" title="打开管理窗口" @click="openMain">⊞</button>
        <button class="btn-icon" title="隐藏悬浮窗" @click="hideFloat">−</button>
      </div>
    </div>

    <!-- 专注任务列表 -->
    <div class="float-list" v-if="store.focusTasks.length">
      <div
        v-for="(task, idx) in store.focusTasks"
        :key="task.id"
        class="float-item fade-up"
        :class="{ completed: task.completed, selected: store.selectedIndex === idx }"
        :style="{ animationDelay: `${idx * 0.04}s` }"
      >
        <!-- 上移 / 下移 按钮 -->
        <div class="move-btns">
          <button
            class="btn-icon move-btn"
            :disabled="idx === 0"
            @click="store.moveFocus(task.id, 'up')"
            title="上移"
          >▲</button>
          <button
            class="btn-icon move-btn"
            :disabled="idx === store.focusTasks.length - 1"
            @click="store.moveFocus(task.id, 'down')"
            title="下移"
          >▼</button>
        </div>

        <!-- 置顶按钮 -->
        <button
          class="btn-icon pin-btn"
          :class="{ active: idx === 0 }"
          @click="store.pinToTop(task.id)"
          title="置顶"
        >⇈</button>

        <!-- 任务内容 -->
        <div class="float-item-content" @click="toggleComplete(task)">
          <div class="float-item-check" :class="{ done: task.completed }">
            <span v-if="task.completed">✓</span>
          </div>
          <div class="float-item-info">
            <span class="float-item-title">{{ task.title }}</span>
            <div class="float-item-meta" v-if="task.dueDate">
              <span class="meta-due" :class="{ overdue: isOverdue(task.dueDate) }">
                📅 {{ formatDate(task.dueDate) }}
              </span>
            </div>
          </div>
        </div>

        <!-- 操作右侧 -->
        <div class="float-item-actions">
          <button
            v-if="task.desktopId"
            class="btn-icon"
            title="切换到对应桌面"
            @click="switchDesktop(task.desktopId!)"
          >→</button>
          <button
            class="btn-icon remove-btn"
            title="移出专注"
            @click="store.removeFromFocus(task.id)"
          >×</button>
        </div>
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
import { ref, onMounted, onUnmounted, watch } from "vue";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { invoke } from "@tauri-apps/api/core";
import { useTaskStore } from "../stores/tasks";
import TaskPicker from "../components/TaskPicker.vue";
import type { Task } from "../stores/tasks";

const store = useTaskStore();
const showPicker = ref(false);
const side = ref<'left' | 'right'>('right');

let dClickTimer: ReturnType<typeof setTimeout> | null = null;
let dClickCount = 0;

function handleKeydown(e: KeyboardEvent) {
  if (store.focusTasks.length === 0) return;

  if (e.key === "ArrowUp" || e.key === "ArrowDown") {
    e.preventDefault();
    const isAlt = e.altKey;
    const isUp = e.key === "ArrowUp";

    if (isAlt) {
      if (store.selectedIndex === null) return;
      const id = store.focusTasks[store.selectedIndex].id;
      if (isUp && store.selectedIndex > 0) {
        store.moveFocus(id, "up");
        store.setSelectedIndex(store.selectedIndex - 1);
      } else if (!isUp && store.selectedIndex < store.focusTasks.length - 1) {
        store.moveFocus(id, "down");
        store.setSelectedIndex(store.selectedIndex + 1);
      }
    } else {
      let newIdx = store.selectedIndex ?? (isUp ? store.focusTasks.length - 1 : 0);
      if (store.selectedIndex !== null) {
        newIdx = isUp ? Math.max(0, newIdx - 1) : Math.min(store.focusTasks.length - 1, newIdx + 1);
      }
      store.setSelectedIndex(newIdx);
      
      // Auto scroll logic
      const activeEl = document.querySelector(".float-item.selected");
      if (activeEl) {
        activeEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }
    return;
  }

  if (store.selectedIndex !== null && store.focusTasks[store.selectedIndex]) {
    const task = store.focusTasks[store.selectedIndex];
    if (e.key === "c") {
      e.preventDefault();
      store.removeFromFocus(task.id);
      if (store.selectedIndex >= store.focusTasks.length) {
        store.setSelectedIndex(store.focusTasks.length > 0 ? store.focusTasks.length - 1 : null);
      }
    } else if (e.key === "d") {
      e.preventDefault();
      dClickCount++;
      if (dClickTimer) clearTimeout(dClickTimer);

      if (dClickCount >= 2) {
        store.toggleComplete(task.id);
        dClickCount = 0;
      } else {
        dClickTimer = setTimeout(() => {
          if (dClickCount === 1 && task.desktopId !== undefined) {
            invoke("switch_to_desktop", { index: task.desktopId }).catch(console.error);
          }
          dClickCount = 0;
        }, 400); // 双击等待阈值
      }
    }
  }
}

onMounted(() => {
  document.documentElement.style.background = 'transparent';
  document.body.style.background = 'transparent';
  const app = document.getElementById('app');
  if (app) app.style.background = 'transparent';
  store.init();
  // 初始化后调整一次
  adjustHeight(store.focusTasks.length);

  window.addEventListener("keydown", handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleKeydown);
});

// 精确高度常量（逻辑像素）
// HEADER: padding(10+8) + btn-icon(26px) + border-bottom(1) = 45
// LIST_PAD: float-list padding-top(6) + padding-bottom(6) = 12
// ITEM: padding(6+6) + move-btns(18×2=36) + border-bottom(1) = 49
// ADDBTN: height:40px (border 已含在 box-sizing:border-box 内) = 40
const HEADER_H = 45;
const LIST_PAD = 12;
const ITEM_H   = 49;
const ADDBTN_H = 40;
const EMPTY_H  = 80;
const MAX_H    = 600;
const MIN_H    = HEADER_H + EMPTY_H + ADDBTN_H; // 165

function adjustHeight(count: number) {
  const scale = window.devicePixelRatio || 1;
  const logical = count > 0
    ? Math.min(HEADER_H + LIST_PAD + count * ITEM_H + ADDBTN_H, MAX_H)
    : MIN_H;
  const physical = Math.round(logical * scale);
  invoke("resize_float_window", { height: physical }).catch(console.error);
}


watch(() => store.focusTasks.length, (n) => adjustHeight(n));

function snapSide() {
  const target = side.value === 'right' ? 'left' : 'right';
  side.value = target;
  invoke('snap_float_window', { side: target }).catch(console.error);
}

// 直接从 JS 创建/聚焦主窗口
// Tauri 内部的 WebviewWindow 创建会路由到主线程，不受 invoke 线程限制
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


// 直接调 Tauri window API 隐藏自身，不经过 invoke
function hideFloat() {
  getCurrentWindow().hide().catch(console.error);
}

function toggleComplete(task: Task) {
  store.toggleComplete(task.id);
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

/* 上移下移按钮组——竖直排列 */
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
.meta-due, .meta-desktop {
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
