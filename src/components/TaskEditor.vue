<template>
  <div class="overlay fade-in" @click.self="$emit('close')">
    <div class="modal fade-up">
      <div class="modal-header">
        <span class="modal-title">{{ isEdit ? "编辑任务" : "新建任务" }}</span>
        <button class="btn-icon" @click="$emit('close')">✕</button>
      </div>
      <div class="modal-body">
        <!-- 标题 -->
        <div class="field">
          <label>任务标题 *</label>
          <input class="input" v-model="form.title" placeholder="输入任务标题…" autofocus />
        </div>
        <!-- 描述 -->
        <div class="field">
          <label>备注描述</label>
          <textarea class="textarea" v-model="form.description" placeholder="可选说明…" />
        </div>
        <!-- 截止时间 -->
        <div class="field">
          <label>截止时间</label>
          <input class="input" type="datetime-local" step="1" v-model="form.dueDate" />
        </div>
        <!-- 重要程度 -->
        <div class="field">
          <label>重要程度</label>
          <div class="pill-group">
            <button
              v-for="opt in levelOpts"
              :key="opt.value"
              class="pill"
              :class="form.importance === opt.value ? `active-${opt.cls}` : ''"
              @click="form.importance = opt.value"
            >{{ opt.label }}</button>
          </div>
        </div>
        <!-- 紧急程度 -->
        <div class="field">
          <label>紧急程度</label>
          <div class="pill-group">
            <button
              v-for="opt in levelOpts"
              :key="opt.value"
              class="pill"
              :class="form.urgency === opt.value ? `active-${opt.cls}` : ''"
              @click="form.urgency = opt.value"
            >{{ opt.label }}</button>
          </div>
        </div>
        <!-- 绑定桌面 -->
        <div class="field">
          <label>绑定虚拟桌面（可选）</label>
          <div v-if="loadingDesktops" class="hint">读取桌面中…</div>
          <div v-else-if="desktops.length === 0" class="hint">未检测到虚拟桌面（Windows 10/11 功能）</div>
          <div v-else class="desktop-list">
            <!-- 不绑定选项 -->
            <button
              class="desktop-item"
              :class="{ active: form.desktopId === undefined }"
              @click="form.desktopId = undefined"
            >
              <span class="desktop-icon">🚫</span>
              <span>不绑定</span>
            </button>
            <!-- 各桌面按钮 -->
            <button
              v-for="d in desktops"
              :key="d.index"
              class="desktop-item"
              :class="{ active: form.desktopId === d.index, current: d.is_current }"
              @click="form.desktopId = d.index"
            >
              <span class="desktop-icon">🖥</span>
              <div class="desktop-item-info">
                <span v-if="!editingDesktop[d.index]" class="desktop-name" @dblclick.stop="startRename(d)">
                  {{ d.name }}
                </span>
                <input
                  v-else
                  class="desktop-rename-input"
                  v-model="renameValues[d.index]"
                  @blur="confirmRename(d)"
                  @keyup.enter="confirmRename(d)"
                  @keyup.esc="cancelRename(d)"
                  @click.stop
                  :ref="el => setRenameRef(d.index, el)"
                />
                <span v-if="d.is_current" class="current-badge">当前</span>
              </div>
            </button>
          </div>
          <p class="hint" v-if="desktops.length > 0">双击桌面名称可重命名；任务执行时自动切换到绑定桌面</p>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" @click="$emit('close')">取消</button>
        <button class="btn btn-primary" @click="submit" :disabled="!form.title.trim()">
          {{ isEdit ? "保存" : "创建" }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, computed, ref, onMounted, nextTick } from "vue";
import { invoke } from "@tauri-apps/api/core";
import type { Task, Level } from "../stores/tasks";

// 将存储的日期字符串转为 datetime-local 输入格式（精确到秒）
function toDatetimeLocal(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

interface DesktopInfo {
  index: number;
  name: string;
  is_current: boolean;
}

const props = defineProps<{
  task?: Task | null;
}>();

const emit = defineEmits<{
  close: [];
  save: [data: Omit<Task, "id" | "createdAt" | "completed">];
}>();

const isEdit = computed(() => !!props.task);

const form = reactive({
  title: props.task?.title ?? "",
  description: props.task?.description ?? "",
  dueDate: toDatetimeLocal(props.task?.dueDate),
  importance: (props.task?.importance ?? 2) as Level,
  urgency: (props.task?.urgency ?? 2) as Level,
  desktopId: props.task?.desktopId as number | undefined,
});

// ── 虚拟桌面 ──
const desktops = ref<DesktopInfo[]>([]);
const loadingDesktops = ref(true);
const editingDesktop = reactive<Record<number, boolean>>({});
const renameValues = reactive<Record<number, string>>({});
const renameRefs = reactive<Record<number, HTMLInputElement | null>>({});

onMounted(async () => {
  try {
    desktops.value = await invoke<DesktopInfo[]>("get_desktops");
  } catch {
    desktops.value = [];
  } finally {
    loadingDesktops.value = false;
  }
});

function setRenameRef(index: number, el: unknown) {
  renameRefs[index] = el as HTMLInputElement | null;
}

function startRename(d: DesktopInfo) {
  renameValues[d.index] = d.name;
  editingDesktop[d.index] = true;
  nextTick(() => renameRefs[d.index]?.select());
}

async function confirmRename(d: DesktopInfo) {
  const newName = (renameValues[d.index] ?? "").trim();
  if (newName && newName !== d.name) {
    try {
      await invoke("rename_desktop", { index: d.index, name: newName });
      d.name = newName;
    } catch (e) {
      console.error("重命名失败", e);
    }
  }
  editingDesktop[d.index] = false;
}

function cancelRename(d: DesktopInfo) {
  editingDesktop[d.index] = false;
}

// ── 表单 ──
const levelOpts = [
  { value: 3 as Level, label: "高", cls: "high" },
  { value: 2 as Level, label: "中", cls: "mid" },
  { value: 1 as Level, label: "低", cls: "low" },
];

function submit() {
  if (!form.title.trim()) return;
  emit("save", {
    title: form.title.trim(),
    description: form.description || undefined,
    dueDate: form.dueDate || undefined,
    importance: form.importance,
    urgency: form.urgency,
    desktopId: form.desktopId,
  });
}
</script>

<style scoped>
.desktop-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 180px;
  overflow-y: auto;
  margin-top: 4px;
}

.desktop-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  border-radius: 8px;
  background: var(--bg-card);
  border: 1.5px solid var(--border);
  color: var(--text-secondary);
  cursor: pointer;
  text-align: left;
  transition: all var(--transition);
  font-size: 13px;
  width: 100%;
}
.desktop-item:hover {
  background: var(--bg-card-hover);
  border-color: var(--almond-silk);
  color: var(--text-primary);
}
.desktop-item.active {
  border-color: var(--dusty-rose);
  background: rgba(204, 126, 133, 0.08);
  color: var(--text-primary);
}
.desktop-item.current {
  border-color: rgba(94, 147, 117, 0.5);
}

.desktop-icon {
  font-size: 15px;
  flex-shrink: 0;
}

.desktop-item-info {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
}

.desktop-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: text;
}

.desktop-rename-input {
  flex: 1;
  background: var(--bg-input);
  border: 1px solid var(--accent);
  border-radius: 4px;
  color: var(--text-primary);
  padding: 2px 6px;
  font-size: 13px;
  outline: none;
}

.current-badge {
  font-size: 10px;
  background: rgba(94, 147, 117, 0.15);
  color: var(--success);
  border-radius: 4px;
  padding: 1px 5px;
  flex-shrink: 0;
}

.hint {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 4px;
}
</style>
