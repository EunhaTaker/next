<template>
  <FloatBar v-if="isFloat" />
  <MainWindow v-else />
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import FloatBar from "./views/FloatBar.vue";
import MainWindow from "./views/MainWindow.vue";
import { invoke } from "@tauri-apps/api/core";
import { isRegistered, register } from "@tauri-apps/plugin-global-shortcut";
import { useTaskStore } from "./stores/tasks";

const w = new URLSearchParams(window.location.search).get("w");
const isFloat = w !== "main";

onMounted(async () => {
  // 我们只在悬浮窗上下文中注册全局快捷键，确保它们唯一且独立存在。
  if (isFloat) {
    const store = useTaskStore();

    // 隐藏/显示悬浮窗
    const toggleH = "CommandOrControl+Alt+H";
    try {
      if (!(await isRegistered(toggleH))) {
        await register(toggleH, (event) => {
          if (event.state === "Pressed") {
            invoke("toggle_float_window").catch(console.error);
          }
        });
        console.log(`✅ 快捷键注册成功: ${toggleH}`);
      }
    } catch (e) {
      console.warn(`❌ 快捷键 ${toggleH} 注册失败，可能与其他软件冲突:`, e);
    }

    // 快捷键快速展开并选中前 10 个任务
    for (let i = 0; i < 10; i++) {
      const k = `CommandOrControl+Alt+${i}`;
      try {
        if (!(await isRegistered(k))) {
          await register(k, (event) => {
            if (event.state === "Pressed") {
               // 我们不用判断 length，因为可能会因为异步而不同步，可以设大一点让 store 去裁剪
               store.setSelectedIndex(i);
               invoke("show_float_window").catch(console.error);
            }
          });
          console.log(`✅ 快捷键注册成功: ${k}`);
        }
      } catch (e) {
        console.warn(`❌ 快捷键 ${k} 注册失败，可能受到冲突占用:`, e);
      }
    }
  }
});
</script>