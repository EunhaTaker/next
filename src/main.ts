import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import "./assets/index.css";

// 不再需要 vue-router，由 App.vue 根据窗口 label 决定渲染内容
createApp(App).use(createPinia()).mount("#app");
