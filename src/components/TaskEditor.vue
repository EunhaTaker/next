<template>
  <div class="overlay fade-in" @click.self="$emit('close')">
    <div class="modal fade-up">
      <div class="modal-header">
        <span class="modal-title">{{ modalTitle }}</span>
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
            <button
              class="desktop-item"
              :class="{ active: form.desktopId === undefined }"
              @click="form.desktopId = undefined"
            >
              <span class="desktop-icon">🚫</span>
              <span>不绑定</span>
            </button>
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

        <!-- 子任务区（仅父任务编辑时显示，子任务模式不显示） -->
        <div class="field" v-if="!isSubtaskMode && isEdit && props.task">
          <label>子任务</label>
          <div class="subtask-list" v-if="subtasks.length">
            <div
              v-for="sub in subtasks"
              :key="sub.id"
              class="subtask-item"
              :class="{ completed: sub.completed }"
            >
              <div class="subtask-check" @click="store.toggleSubTaskComplete(props.task!.id, sub.id)">
                <span v-if="sub.completed">✓</span>
              </div>
              <span class="subtask-title">{{ sub.title }}</span>
              <span v-if="sub.desktopId !== undefined" class="subtask-desktop">
                🖥 {{ store.getDesktopName(sub.desktopId) }}
              </span>
              <button class="btn-icon subtask-edit" @click="openSubEditor(sub)" title="编辑子任务">✎</button>
              <button class="btn-icon subtask-del" @click="store.deleteSubTask(props.task!.id, sub.id)" title="删除子任务">×</button>
            </div>
          </div>
          <button class="btn btn-ghost subtask-new-btn" @click="openSubEditor(null)">＋ 新建子任务</button>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" @click="$emit('close')">取消</button>
        <button class="btn btn-primary" @click="submit" :disabled="!form.title.trim()">
          {{ isEdit ? "保存" : "创建" }}
        </button>
      </div>
    </div>

    <!-- 嵌套子任务编辑器 -->
    <div v-if="subEditorOpen" class="overlay sub-overlay fade-in" @click.self="subEditorOpen = false">
      <div class="modal fade-up">
        <div class="modal-header">
          <span class="modal-title">{{ editingSubTask ? "编辑子任务" : "新建子任务" }}</span>
          <button class="btn-icon" @click="subEditorOpen = false">✕</button>
        </div>
        <div class="modal-body">
          <div class="field">
            <label>任务标题 *</label>
            <input class="input" v-model="subForm.title" placeholder="输入子任务标题…" autofocus />
          </div>
          <div class="field">
            <label>备注描述</label>
            <textarea class="textarea" v-model="subForm.description" placeholder="可选说明…" />
          </div>
          <div class="field">
            <label>截止时间</label>
            <input class="input" type="datetime-local" step="1" v-model="subForm.dueDate" />
          </div>
          <div class="field">
            <label>重要程度</label>
            <div class="pill-group">
              <button
                v-for="opt in levelOpts"
                :key="opt.value"
                class="pill"
                :class="subForm.importance === opt.value ? `active-${opt.cls}` : ''"
                @click="subForm.importance = opt.value"
              >{{ opt.label }}</button>
            </div>
          </div>
          <div class="field">
            <label>紧急程度</label>
            <div class="pill-group">
              <button
                v-for="opt in levelOpts"
                :key="opt.value"
                class="pill"
                :class="subForm.urgency === opt.value ? `active-${opt.cls}` : ''"
                @click="subForm.urgency = opt.value"
              >{{ opt.label }}</button>
            </div>
          </div>
          <div class="field" v-if="desktops.length > 0">
            <label>绑定虚拟桌面（可选）</label>
            <div class="desktop-list">
              <button
                class="desktop-item"
                :class="{ active: subForm.desktopId === undefined }"
                @click="subForm.desktopId = undefined"
              >
                <span class="desktop-icon">🚫</span>
                <span>不绑定（继承父任务）</span>
              </button>
              <button
                v-for="d in desktops"
                :key="d.index"
                class="desktop-item"
                :class="{ active: subForm.desktopId === d.index, current: d.is_current }"
                @click="subForm.desktopId = d.index"
              >
                <span class="desktop-icon">🖥</span>
                <span>{{ d.name }}</span>
                <span v-if="d.is_current" class="current-badge">当前</span>
              </button>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" @click="subEditorOpen = false">取消</button>
          <button class="btn btn-primary" @click="submitSub" :disabled="!subForm.title.trim()">
            {{ editingSubTask ? "保存" : "创建" }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, computed, ref, onMounted, nextTick } from "vue";
import { invoke } from "@tauri-apps/api/core";
import type { Task, SubTask, Level } from "../stores/tasks";
import { useTaskStore } from "../stores/tasks";

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
  // 子任务模式：传入 parentId 则视为编辑子任务
  parentId?: string;
  subtask?: SubTask | null;
}>();

const emit = defineEmits<{
  close: [];
  save: [data: Omit<Task, "id" | "createdAt" | "completed">];
}>();

const store = useTaskStore();

const isSubtaskMode = computed(() => !!props.parentId);
const isEdit = computed(() => !!(props.task || props.subtask));

const modalTitle = computed(() => {
  if (isSubtaskMode.value) return props.subtask ? "编辑子任务" : "新建子任务";
  return props.task ? "编辑任务" : "新建任务";
});

// ── 主表单（父任务 或 子任务模式） ──
const form = reactive({
  title: (props.task?.title ?? props.subtask?.title) ?? "",
  description: (props.task?.description ?? props.subtask?.description) ?? "",
  dueDate: toDatetimeLocal(props.task?.dueDate ?? props.subtask?.dueDate),
  importance: ((props.task?.importance ?? props.subtask?.importance) ?? 2) as Level,
  urgency: ((props.task?.urgency ?? props.subtask?.urgency) ?? 2) as Level,
  desktopId: (props.task?.desktopId ?? props.subtask?.desktopId) as number | undefined,
});

// ── 子任务列表（父任务编辑时） ──
const subtasks = computed<SubTask[]>(() => {
  if (!props.task) return [];
  return store.tasks.find(t => t.id === props.task!.id)?.subtasks ?? [];
});

// ── 嵌套子任务编辑器状态 ──
const subEditorOpen = ref(false);
const editingSubTask = ref<SubTask | null>(null);
const subForm = reactive({
  title: "",
  description: "",
  dueDate: "",
  importance: 2 as Level,
  urgency: 2 as Level,
  desktopId: undefined as number | undefined,
});

function openSubEditor(sub: SubTask | null) {
  editingSubTask.value = sub;
  subForm.title = sub?.title ?? "";
  subForm.description = sub?.description ?? "";
  subForm.dueDate = toDatetimeLocal(sub?.dueDate);
  subForm.importance = sub?.importance ?? 2;
  subForm.urgency = sub?.urgency ?? 2;
  subForm.desktopId = sub?.desktopId;
  subEditorOpen.value = true;
}

function submitSub() {
  if (!subForm.title.trim() || !props.task) return;
  const partial: Omit<SubTask, "id" | "createdAt" | "completed"> = {
    title: subForm.title.trim(),
    description: subForm.description || undefined,
    dueDate: subForm.dueDate || undefined,
    importance: subForm.importance,
    urgency: subForm.urgency,
    desktopId: subForm.desktopId,
  };
  if (editingSubTask.value) {
    store.updateSubTask(props.task.id, editingSubTask.value.id, partial);
  } else {
    store.addSubTask(props.task.id, partial);
  }
  subEditorOpen.value = false;
}

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

// ── 表单提交 ──
const levelOpts = [
  { value: 3 as Level, label: "高", cls: "high" },
  { value: 2 as Level, label: "中", cls: "mid" },
  { value: 1 as Level, label: "低", cls: "low" },
];

function submit() {
  if (!form.title.trim()) return;
  const data = {
    title: form.title.trim(),
    description: form.description || undefined,
    dueDate: form.dueDate || undefined,
    importance: form.importance,
    urgency: form.urgency,
    desktopId: form.desktopId,
  };

  if (isSubtaskMode.value && props.parentId) {
    // 子任务模式：直接操作 store，不走 emit('save')
    if (props.subtask) {
      store.updateSubTask(props.parentId, props.subtask.id, data);
    } else {
      store.addSubTask(props.parentId, data);
    }
    emit("close");
  } else {
    emit("save", data as Omit<Task, "id" | "createdAt" | "completed">);
  }
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
.desktop-item.current { border-color: rgba(94, 147, 117, 0.5); }

.desktop-icon { font-size: 15px; flex-shrink: 0; }

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

/* ── 子任务列表 ── */
.subtask-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-bottom: 8px;
}

.subtask-item {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 5px 8px;
  border-radius: 6px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  font-size: 13px;
  color: var(--text-primary);
}
.subtask-item.completed { opacity: 0.5; }
.subtask-item.completed .subtask-title {
  text-decoration: line-through;
  color: var(--text-muted);
}

.subtask-check {
  width: 15px;
  height: 15px;
  border-radius: 50%;
  border: 1.5px solid var(--text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  color: var(--success);
  cursor: pointer;
  flex-shrink: 0;
  transition: var(--transition);
}
.subtask-item.completed .subtask-check {
  background: rgba(124, 170, 144, 0.15);
  border-color: var(--success);
}

.subtask-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.subtask-desktop {
  font-size: 11px;
  color: var(--text-muted);
  flex-shrink: 0;
}

.subtask-edit {
  flex-shrink: 0;
  color: var(--text-muted);
  opacity: 0.6;
  font-size: 13px;
}
.subtask-edit:hover { color: var(--accent); opacity: 1; }

.subtask-del {
  flex-shrink: 0;
  color: var(--text-muted);
  opacity: 0.6;
}
.subtask-del:hover { color: var(--danger); opacity: 1; }

.subtask-new-btn {
  width: 100%;
  margin-top: 2px;
  font-size: 13px;
  justify-content: center;
}

/* ── 嵌套子编辑器覆盖层 ── */
.sub-overlay {
  z-index: 300;
}
</style>
