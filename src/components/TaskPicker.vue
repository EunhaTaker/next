<template>
  <div class="picker-backdrop fade-in" @click.self="$emit('close')">
    <div class="picker fade-up">
      <div class="picker-header">
        <span class="picker-title">添加到专注</span>
        <button class="btn-icon" @click="$emit('close')">✕</button>
      </div>
      <div class="picker-list" v-if="items.length">
        <div
          v-for="item in items"
          :key="item.focusId"
          class="picker-item"
          :class="{ 'picker-item-sub': item.isSubTask }"
          @click="add(item.focusId)"
        >
          <div class="picker-item-main">
            <span v-if="item.isSubTask" class="picker-sub-parent">{{ item.parentTitle }}</span>
            <span class="picker-item-title">{{ item.title }}</span>
            <span v-if="!item.isSubTask && item.dueDate" class="picker-item-due">截止 {{ formatDate(item.dueDate) }}</span>
          </div>
          <div class="picker-item-badges" v-if="!item.isSubTask">
            <span class="badge" :class="urgencyClass(item.urgency)">{{ urgencyLabel(item.urgency) }}</span>
            <span class="badge" :class="importanceClass(item.importance)">{{ importanceLabel(item.importance) }}</span>
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
import { computed } from "vue";
import { useTaskStore } from "../stores/tasks";
import type { Level } from "../stores/tasks";

const emit = defineEmits<{ close: [] }>();
const store = useTaskStore();

// 所有可加入专注的条目：未完成的父任务 + 未完成且未在专注中的子任务
const items = computed(() => {
  const result: Array<{
    focusId: string;
    title: string;
    isSubTask: boolean;
    parentTitle?: string;
    dueDate?: string;
    urgency?: Level;
    importance?: Level;
  }> = [];

  for (const task of store.tasks) {
    if (task.completed) continue;

    // 父任务本身（未在专注中）
    if (!store.focusIds.includes(task.id)) {
      result.push({
        focusId: task.id,
        title: task.title,
        isSubTask: false,
        dueDate: task.dueDate,
        urgency: task.urgency,
        importance: task.importance,
      });
    }

    // 子任务（未完成且未在专注中）
    for (const sub of task.subtasks ?? []) {
      if (sub.completed) continue;
      const subFocusId = `${task.id}/${sub.id}`;
      if (!store.focusIds.includes(subFocusId)) {
        result.push({
          focusId: subFocusId,
          title: sub.title,
          isSubTask: true,
          parentTitle: task.title,
        });
      }
    }
  }

  return result;
});

function add(focusId: string) {
  store.addToFocus(focusId);
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

.picker-item-sub {
  padding-left: 22px;
  background: rgba(197, 175, 164, 0.04);
}
.picker-item-sub:hover { background: var(--bg-card-hover); }

.picker-item-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.picker-sub-parent {
  font-size: 10px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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
