use tauri::{
    image::Image,
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WebviewUrl, WebviewWindowBuilder,
};

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct DesktopInfo {
    pub index: usize,
    pub name: String,
    pub is_current: bool,
}

/// 创建悬浮窗
fn create_float_window(app: &tauri::AppHandle) {
    // 如果已存在则直接显示
    if let Some(win) = app.get_webview_window("float") {
        let _ = win.show();
        return;
    }

    // 获取主显示器尺寸
    let monitor = app
        .primary_monitor()
        .unwrap_or(None)
        .or_else(|| app.available_monitors().ok()?.into_iter().next());

    let (screen_width, screen_height) = match monitor {
        Some(m) => {
            let size = m.size();
            let scale = m.scale_factor();
            (
                (size.width as f64 / scale) as u32,
                (size.height as f64 / scale) as u32,
            )
        }
        None => (1920, 1080),
    };

    let win_w: u32 = 260;
    let win_h: u32 = 500;
    let x = (screen_width - win_w) as i32 - 16;
    let y = ((screen_height - win_h) / 2) as i32;

    if let Ok(win) = WebviewWindowBuilder::new(app, "float", WebviewUrl::App("/?w=float".into()))
        .title("Next")
        .inner_size(win_w as f64, win_h as f64)
        .position(x as f64, y as f64)
        .always_on_top(true)
        .decorations(false)
        .resizable(false)
        .skip_taskbar(true)
        .shadow(false)
        .transparent(true)
        .build()
    {
        #[cfg(target_os = "windows")]
        {
            let scale = win.scale_factor().unwrap_or(1.0);
            let phys_w = (win_w as f64 * scale).round() as u32;
            let phys_h = (win_h as f64 * scale).round() as u32;
            apply_round_region(&win, phys_w, phys_h, (14.0 * scale).round() as i32);
            apply_taskbar_hide(&win);
        }
    }
}

/// 通过 Win32 API 将窗口区域裁剪为圆角矩形
#[cfg(target_os = "windows")]
fn apply_round_region(win: &tauri::WebviewWindow, width: u32, height: u32, radius: i32) {
    extern "system" {
        fn CreateRoundRectRgn(x1: i32, y1: i32, x2: i32, y2: i32, cx: i32, cy: i32) -> isize;
        fn SetWindowRgn(hwnd: isize, hrgn: isize, bredraw: i32) -> i32;
    }
    if let Ok(hwnd) = win.hwnd() {
        unsafe {
            // cx/cy 是椭圆直径（=半径*2）
            let rgn = CreateRoundRectRgn(0, 0, width as i32, height as i32, radius * 2, radius * 2);
            SetWindowRgn(hwnd.0 as isize, rgn, 1);
        }
    }
}

/// 通过 Win32 SetWindowLongW 强制清除 WS_EX_APPWINDOW、设置 WS_EX_TOOLWINDOW
/// 这是在 Windows 上彻底隐藏任务栏图标的标准方法（skip_taskbar 有时不可靠）
#[cfg(target_os = "windows")]
fn apply_taskbar_hide(win: &tauri::WebviewWindow) {
    extern "system" {
        fn GetWindowLongW(hwnd: isize, n_index: i32) -> i32;
        fn SetWindowLongW(hwnd: isize, n_index: i32, dw_new_long: i32) -> i32;
    }
    const GWL_EXSTYLE: i32 = -20;
    const WS_EX_TOOLWINDOW: i32 = 0x0000_0080;
    const WS_EX_APPWINDOW: i32 = 0x0004_0000;
    if let Ok(hwnd) = win.hwnd() {
        unsafe {
            let ex = GetWindowLongW(hwnd.0 as isize, GWL_EXSTYLE);
            SetWindowLongW(
                hwnd.0 as isize,
                GWL_EXSTYLE,
                (ex | WS_EX_TOOLWINDOW) & !WS_EX_APPWINDOW,
            );
        }
    }
}

/// 创建管理窗口
fn create_main_window(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.set_focus();
        return;
    }
    let _ = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("/?w=main".into()))
        .title("Next — 任务管理")
        .inner_size(720.0, 560.0)
        .center()
        .resizable(true)
        .decorations(false)
        .build();
}

#[tauri::command]
fn show_main_window(app: tauri::AppHandle) {
    create_main_window(&app);
}

#[tauri::command]
fn hide_float_window(app: tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("float") {
        let _ = win.hide();
    }
}

#[tauri::command]
fn show_float_window(app: tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("float") {
        let _ = win.show();
        let _ = win.set_focus();
    }
}

/// 显示悬浮窗但不抢占系统焦点（番茄钟等被动弹出场景使用）
#[tauri::command]
fn show_float_window_passive(app: tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("float") {
        let _ = win.show();
        // 不调用 set_focus()，让当前活动窗口保持焦点
    }
}

#[tauri::command]
fn toggle_float_window(app: tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("float") {
        if win.is_visible().unwrap_or(false) {
            let _ = win.hide();
        } else {
            let _ = win.show();
            let _ = win.set_focus();
        }
    }
}

/// 动态调整悬浮窗高度，同时刷新圆角 region
/// height 由前端以物理像素传入（logical × devicePixelRatio）
#[tauri::command]
fn resize_float_window(app: tauri::AppHandle, height: u32) {
    if let Some(win) = app.get_webview_window("float") {
        let scale = win.scale_factor().unwrap_or(1.0);
        let win_w = (260.0 * scale).round() as u32;
        let _ = win.set_size(tauri::Size::Physical(tauri::PhysicalSize {
            width: win_w,
            height,
        }));
        #[cfg(target_os = "windows")]
        apply_round_region(&win, win_w, height, (14.0 * scale).round() as i32);
    }
}

/// 将悬浮窗贴靠到左侧或右侧屏幕边缘，保留当前 Y 位置
#[tauri::command]
fn snap_float_window(app: tauri::AppHandle, side: String) {
    let Some(win) = app.get_webview_window("float") else {
        return;
    };

    let monitor = app
        .primary_monitor()
        .unwrap_or(None)
        .or_else(|| app.available_monitors().ok()?.into_iter().next());

    let (screen_w, _) = match monitor {
        Some(m) => {
            let size = m.size();
            let scale = m.scale_factor();
            (
                (size.width as f64 / scale) as i32,
                (size.height as f64 / scale) as i32,
            )
        }
        None => (1920, 1080),
    };

    let win_w: i32 = 260;
    let margin: i32 = 16;

    let x = if side == "left" {
        margin
    } else {
        screen_w - win_w - margin
    };

    // 读取当前逻辑 Y 位置，保持不变
    let cur_pos = win.outer_position().ok();
    let scale = win.scale_factor().unwrap_or(1.0);
    let y = cur_pos.map(|p| (p.y as f64 / scale) as i32).unwrap_or(0);

    let _ = win.set_position(tauri::Position::Logical(tauri::LogicalPosition {
        x: x as f64,
        y: y as f64,
    }));
}

#[tauri::command]
fn get_desktops() -> Vec<DesktopInfo> {
    let current_idx = winvd::get_current_desktop()
        .ok()
        .and_then(|d| winvd::get_desktops().ok()?.into_iter().position(|x| x == d));

    winvd::get_desktops()
        .unwrap_or_default()
        .into_iter()
        .enumerate()
        .map(|(i, d)| DesktopInfo {
            index: i,
            name: d.get_name().unwrap_or_else(|_| format!("桌面 {}", i + 1)),
            is_current: current_idx == Some(i),
        })
        .collect()
}

/// 切换到指定虚拟桌面
#[tauri::command]
fn switch_to_desktop(index: usize) -> Result<(), String> {
    winvd::switch_desktop(index as u32).map_err(|e| format!("{:?}", e))
}

/// 重命名虚拟桌面
#[tauri::command]
fn rename_desktop(index: usize, name: String) -> Result<(), String> {
    let desktops = winvd::get_desktops().map_err(|e| format!("{:?}", e))?;
    desktops
        .get(index)
        .ok_or_else(|| format!("桌面 {} 不存在", index))?
        .set_name(&name)
        .map_err(|e| format!("{:?}", e))
}

/// 多显示器支持：跟踪前台窗口所在显示器，变化时保持相对位置并按 DPI 比例缩放
#[cfg(target_os = "windows")]
fn start_monitor_follow(app: tauri::AppHandle) {
    extern "system" {
        fn GetForegroundWindow() -> isize;
        fn MonitorFromWindow(hwnd: isize, dw_flags: u32) -> isize;
        fn GetMonitorInfoW(h_monitor: isize, lp_mi: *mut MonInfo) -> i32;
        fn GetDpiForMonitor(
            h_monitor: isize, dpi_type: u32,
            dpi_x: *mut u32, dpi_y: *mut u32,
        ) -> i32;
    }

    const MONITOR_DEFAULTTONEAREST: u32 = 2;

    #[repr(C)]
    struct Rect { left: i32, top: i32, right: i32, bottom: i32 }

    #[repr(C)]
    struct MonInfo {
        cb_size: u32, rc_monitor: Rect, rc_work: Rect, dw_flags: u32,
    }

    fn mon_info(monitor: isize) -> Option<MonInfo> {
        let mut info = MonInfo {
            cb_size: std::mem::size_of::<MonInfo>() as u32,
            rc_monitor: Rect { left:0, top:0, right:0, bottom:0 },
            rc_work:    Rect { left:0, top:0, right:0, bottom:0 },
            dw_flags: 0,
        };
        (unsafe { GetMonitorInfoW(monitor, &mut info) } != 0).then_some(info)
    }

    fn mon_scale(monitor: isize) -> f64 {
        let (mut dx, mut dy) = (96u32, 96u32);
        unsafe { GetDpiForMonitor(monitor, 0, &mut dx, &mut dy); }
        dx as f64 / 96.0
    }

    std::thread::spawn(move || {
        let mut last_monitor: isize = 0;
        // 相对位置（窗口左上角相对工作区的比例）
        let mut rel: (f64, f64) = (0.9, 0.4);

        loop {
            std::thread::sleep(std::time::Duration::from_millis(500));

            let fg = unsafe { GetForegroundWindow() };
            if fg == 0 { continue; }

            let Some(win) = app.get_webview_window("float") else { continue };
            let float_hwnd = win.hwnd().map(|h| h.0 as isize).unwrap_or(0);

            // 悬浮窗本身在前台时跳过（用户正在拖动）
            if float_hwnd == fg { continue; }

            // 持续更新相对位置（用户可能拖动过悬浮窗）
            if last_monitor != 0 {
                let cur = unsafe { MonitorFromWindow(float_hwnd, MONITOR_DEFAULTTONEAREST) };
                if cur == last_monitor {
                    if let (Ok(pos), Ok(sz), Some(info)) = (
                        win.outer_position(), win.outer_size(), mon_info(cur)
                    ) {
                        let ww = (info.rc_work.right  - info.rc_work.left) as f64;
                        let wh = (info.rc_work.bottom - info.rc_work.top)  as f64;
                        if ww > 0.0 && wh > 0.0 {
                            rel = (
                                ((pos.x - info.rc_work.left) as f64 / ww).clamp(0.0, 0.95),
                                ((pos.y - info.rc_work.top)  as f64 / wh).clamp(0.0, 0.95),
                            );
                        }
                    }
                }
            }

            let monitor = unsafe { MonitorFromWindow(fg, MONITOR_DEFAULTTONEAREST) };
            if monitor == 0 || monitor == last_monitor { continue; }

            // 计算 DPI 比例（旧 → 新）
            let old_scale = if last_monitor != 0 { mon_scale(last_monitor) }
                            else { win.scale_factor().unwrap_or(1.0) };
            let new_scale = mon_scale(monitor);

            last_monitor = monitor;

            let Some(info) = mon_info(monitor) else { continue };
            let work = &info.rc_work;
            let ww = (work.right  - work.left) as f64;
            let wh = (work.bottom - work.top)  as f64;

            // 目标位置（物理坐标）
            let x = (work.left as f64 + rel.0 * ww) as i32;
            let y = (work.top  as f64 + rel.1 * wh) as i32;

            // 按 DPI 比例缩放物理尺寸
            let phys = win.outer_size()
                .unwrap_or(tauri::PhysicalSize { width: 260, height: 500 });
            let new_w = ((phys.width  as f64) * new_scale / old_scale) as u32;
            let new_h = ((phys.height as f64) * new_scale / old_scale) as u32;

            // 限制不超出工作区
            let x = x.clamp(work.left, work.right  - new_w as i32);
            let y = y.clamp(work.top,  work.bottom - new_h as i32);

            let _ = win.set_position(tauri::Position::Physical(
                tauri::PhysicalPosition { x, y }
            ));
            let _ = win.set_size(tauri::Size::Physical(
                tauri::PhysicalSize { width: new_w, height: new_h }
            ));
            #[cfg(target_os = "windows")]
            apply_round_region(&win, new_w, new_h, (14.0 * new_scale).round() as i32);
        }
    });
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .setup(|app| {
            // 启动时创建悬浮窗
            create_float_window(app.handle());

            // 多显示器跟随
            #[cfg(target_os = "windows")]
            start_monitor_follow(app.handle().clone());

            // 系统托盘菜单
            let show_item = MenuItemBuilder::with_id("show_main", "打开管理窗口").build(app)?;
            let toggle_float =
                MenuItemBuilder::with_id("toggle_float", "显示/隐藏悬浮窗").build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "退出").build(app)?;

            let menu = MenuBuilder::new(app)
                .item(&show_item)
                .item(&toggle_float)
                .separator()
                .item(&quit_item)
                .build()?;

            // 从 icon 文件加载托盘图标（避免 default_window_icon 为 None 时 panic）
            let icon = Image::from_path("icons/32x32.png")
                .or_else(|_| Image::from_path("icons/128x128.png"))
                .map_err(|e| {
                    eprintln!("Warning: Could not load tray icon: {e}");
                })
                .ok();

            let mut tray_builder = TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("Next — 任务焦点")
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show_main" => create_main_window(app),
                    "toggle_float" => {
                        if let Some(win) = app.get_webview_window("float") {
                            if win.is_visible().unwrap_or(false) {
                                let _ = win.hide();
                            } else {
                                let _ = win.show();
                            }
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        create_main_window(app);
                    }
                });

            if let Some(img) = icon {
                tray_builder = tray_builder.icon(img);
            }

            tray_builder.build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            show_main_window,
            hide_float_window,
            show_float_window,
            show_float_window_passive,
            toggle_float_window,
            resize_float_window,
            snap_float_window,
            get_desktops,
            switch_to_desktop,
            rename_desktop,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
