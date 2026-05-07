<template>
  <FloatBar v-if="isFloat" />
  <MainWindow v-else />
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import FloatBar from "./views/FloatBar.vue";
import MainWindow from "./views/MainWindow.vue";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { isRegistered, register } from "@tauri-apps/plugin-global-shortcut";
import { emit } from "@tauri-apps/api/event";
import { useTaskStore } from "./stores/tasks";

const w = new URLSearchParams(window.location.search).get("w");
const isFloat = w !== "main";

onMounted(async () => {
  // 我们只在悬浮窗上下文中注册全局快捷键，确保它们唯一且独立存在。
  if (isFloat) {
    const store = useTaskStore();
    const floatWin = getCurrentWindow();

    // 隐藏/显示悬浮窗（用户手动触发，show 时通知 FloatBar 取消 T2 自动隐藏）
    const toggleH = "CommandOrControl+Alt+H";
    try {
      if (!(await isRegistered(toggleH))) {
        await register(toggleH, async (event) => {
          if (event.state === "Pressed") {
            const visible = await floatWin.isVisible().catch(() => false);
            if (visible) {
              invoke("hide_float_window").catch(console.error);
            } else {
              invoke("show_float_window").catch(console.error);
              // 用户手动 show，取消番茄钟 T2 自动隐藏
              emit("user-show-float").catch(() => {});
            }
          }
        });
        console.log(`✅ 快捷键注册成功: ${toggleH}`);
      }
    } catch (e) {
      console.warn(`❌ 快捷键 ${toggleH} 注册失败，可能与其他软件冲突:`, e);
    }

    // 快捷键快速展开并选中前 10 个任务（也是用户手动唤出，emit 取消 T2）
    for (let i = 0; i < 10; i++) {
      const k = `CommandOrControl+Alt+${i}`;
      try {
        if (!(await isRegistered(k))) {
          await register(k, (event) => {
            if (event.state === "Pressed") {
               store.setSelectedIndex(i);
               invoke("show_float_window").catch(console.error);
               emit("user-show-float").catch(() => {});
            }
          });
          console.log(`✅ 快捷键注册成功: ${k}`);
        }
      } catch (e) {
        console.warn(`❌ 快捷键 ${k} 注册失败，可能受到冲突占用:`, e);
      }
    }

    // ctrl+alt+space：对第一个专注任务开始/暂停计时
    const timerKey = "CommandOrControl+Alt+Space";
    try {
      if (!(await isRegistered(timerKey))) {
        await register(timerKey, async (event) => {
          if (event.state === "Pressed") {
            invoke("show_float_window").catch(console.error);
            emit("user-show-float").catch(() => {});
            emit("toggle-first-timer").catch(() => {});
          }
        });
        console.log(`✅ 快捷键注册成功: ${timerKey}`);
      }
    } catch (e) {
      console.warn(`❌ 快捷键 ${timerKey} 注册失败，可能与其他软件冲突:`, e);
    }

    // ctrl+alt+m：打开/关闭主界面
    const mainKey = "CommandOrControl+Alt+M";
    try {
      if (!(await isRegistered(mainKey))) {
        await register(mainKey, async (event) => {
          if (event.state === "Pressed") {
            const mainWin = await WebviewWindow.getByLabel("main").catch(() => null);
            if (mainWin) {
              mainWin.close().catch(console.error);
            } else {
              new WebviewWindow("main", {
                url: "/?w=main",
                title: "Next — 任务管理",
                width: 720,
                height: 560,
                center: true,
                decorations: false,
              });
            }
          }
        });
        console.log(`✅ 快捷键注册成功: ${mainKey}`);
      }
    } catch (e) {
      console.warn(`❌ 快捷键 ${mainKey} 注册失败，可能与其他软件冲突:`, e);
    }
  }
});
</script>