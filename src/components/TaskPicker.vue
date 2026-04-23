<template>
  <div class="picker-backdrop fade-in" @click.self="$emit('close')">
    <div class="picker fade-up">
      <div class="picker-header">
        <span class="picker-title">添加到专注</span>
        <button class="btn-icon" @click="$emit('close')">✕</button>
      </div>
      <div class="picker-list" v-if="store.notFocusTasks.length">
        <div
          v-for="task in store.notFocusTasks"
          :key="task.id"
          class="picker-item"
          @click="add(task.id)"
        >
          <div class="picker-item-main">
            <span class="picker-item-title">{{ task.title }}</span>
            <span v-if="task.dueDate" class="picker-item-due">截止 {{ formatDate(task.dueDate) }}</span>
          </div>
          <div class="picker-item-badges">
            <span class="badge" :class="urgencyClass(task.urgency)">{{ urgencyLabel(task.urgency) }}</span>
            <span class="badge" :class="importanceClass(task.importance)">{{ importanceLabel(task.importance) }}</span>
          </div>
          <span class="add-icon">＋</span>
        </div>
      </div>
      <div class="picker-empty" v-else>
        <span>🎉 暂无其他未专注任务</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useTaskStore } from "../stores/tasks";
import type { Level } from "../stores/tasks";

const emit = defineEmits<{ close: [] }>();
const store = useTaskStore();

function add(id: string) {
  store.addToFocus(id);
  emit("close");
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

const urgencyLabel = (u: Level) => ["", "不紧急", "较紧急", "紧急"][u];
const importanceLabel = (i: Level) => ["", "不重要", "较重要", "重要"][i];
const urgencyClass = (u: Level) => u === 3 ? "badge-high" : u === 2 ? "badge-mid" : "badge-low";
const importanceClass = (i: Level) => i === 3 ? "badge-high" : i === 2 ? "badge-mid" : "badge-low";
</script>

<style scoped>
.picker-backdrop {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: flex-end;
  padding: 0 8px 56px;
}

.picker {
  width: 100%;
  background: var(--bg-popover);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-popover);
  overflow: hidden;
  max-height: 60vh;
  display: flex;
  flex-direction: column;
}

.picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px 10px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.picker-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.picker-list {
  overflow-y: auto;
  flex: 1;
}

.picker-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  cursor: pointer;
  transition: background var(--transition);
  border-bottom: 1px solid var(--border);
}
.picker-item:last-child { border-bottom: none; }
.picker-item:hover { background: var(--bg-card-hover); }

.picker-item-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.picker-item-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.picker-item-due {
  font-size: 11px;
  color: var(--text-muted);
}

.picker-item-badges {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.add-icon {
  font-size: 16px;
  color: var(--accent);
  flex-shrink: 0;
  font-weight: 600;
}

.picker-empty {
  padding: 24px;
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
}
</style>
