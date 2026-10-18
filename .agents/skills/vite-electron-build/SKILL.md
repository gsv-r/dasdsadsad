---
name: vite-electron-build
description: >-
  Vite + Electron 构建配置最佳实践。当需要配置 Vite 构建工具、优化 Electron 主进程与渲染进程构建、实现开发环境热重载、优化生产环境打包、或实现代码分割与懒加载时使用此 skill。
license: MIT
metadata:
  category: development
  tags:
    - vite
    - electron
    - build
    - bundler
    - optimization
---

# Vite + Electron 构建配置

此 skill 提供 Vite + Electron 构建工具链的配置指南,涵盖 Vite 配置优化、主进程与渲染进程构建、开发环境热重载、生产环境打包优化、代码分割等核心主题。

## 何时使用此 Skill

在以下场景中使用此 skill:

- 配置 Vite 作为 Electron 应用的构建工具
- 优化 Electron 主进程与渲染进程的构建配置
- 实现开发环境的热重载(HMR)
- 优化生产环境的打包体积和性能
- 实现代码分割与懒加载
- 配置 TypeScript 编译
- 处理静态资源和原生模块

## 核心概念

### 1. 为什么选择 Vite

[`Vite`](https://vitejs.dev/) 相比传统构建工具(Webpack)的优势:

**优势**:
- 极速的开发服务器启动(基于 ESM)
- 快速的热模块替换(HMR)
- 开箱即用的 TypeScript 支持
- 优化的生产构建(基于 Rollup)
- 简洁的配置 API
- 丰富的插件生态

**适用场景**:
- 现代化的 Electron 应用开发
- 需要快速迭代的项目
- TypeScript + React/Vue 技术栈
- 追求开发体验的团队

### 2. 项目结构

推荐的 Electron + Vite 项目结构:

```
sibylla/
├── src/
│   ├── main/              # 主进程代码
│   │   ├── main.ts        # 主进程入口
│   │   ├── preload.ts     # Preload 脚本
│   │   └── services/      # 业务逻辑
│   │       ├── FileManager.ts
│   │       ├── GitAbstraction.ts
│   │       └── AIGateway.ts
│   └── renderer/          # 渲染进程代码
│       ├── index.html     # HTML 入口
│       ├── main.tsx       # React 入口
│       ├── App.tsx        # 根组件
│       ├── components/    # 组件
│       ├── stores/        # 状态管理
│       └── styles/        # 样式
├── dist/                  # 构建输出
│   ├── main/              # 主进程构建产物
│   └── renderer/          # 渲染进程构建产物
├── vite.config.ts         # Vite 配置
├── vite.main.config.ts    # 主进程 Vite 配置
├── vite.renderer.config.ts # 渲染进程 Vite 配置
├── tsconfig.json          # TypeScript 配置
├── package.json           # 项目配置
└── electron-builder.yml   # Electron Builder 配置
```

### 3. 渲染进程 Vite 配置

配置渲染进程的 Vite 构建:

```typescript
// vite.renderer.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  // 插件配置
  plugins: [
    react({
      // 启用 Fast Refresh
      fastRefresh: true,
      // Babel 配置
      babel: {
        plugins: [
          // 可选: 添加 Babel 插件
        ],
      },
    }),
  ],
  
  // 根目录
  root: path.join(__dirname, 'src/renderer'),
  
  // 公共基础路径
  base: './',
  
  // 开发服务器配置
  server: {
    port: 3000,
    strictPort: true, // 端口被占用时直接退出
    hmr: {
      // HMR 配置
      overlay: true, // 显示错误覆盖层
    },
  },
  
  // 构建配置
  build: {
    outDir: path.join(__dirname, 'dist/renderer'),
    emptyOutDir: true,
    
    // Rollup 配置
    rollupOptions: {
      input: {
        main: path.join(__dirname, 'src/renderer/index.html'),
      },
      output: {
        // 代码分割
        manualChunks: {
          // 将 React 相关库打包到单独的 chunk
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          // 将 UI 库打包到单独的 chunk
          'ui-vendor': ['@tiptap/react', '@tiptap/starter-kit'],
        },
      },
    },
    
    // 压缩配置
    minify: 'esbuild',
    
    // 生成 sourcemap
    sourcemap: process.env.NODE_ENV === 'development',
    
    // 代码分割阈值
    chunkSizeWarningLimit: 1000, // KB
    
    // 目标环境
    target: 'chrome120', // 匹配 Electron 的 Chromium 版本
  },
  
  // 路径别名
  resolve: {
    alias: {
      '@': path.join(__dirname, 'src/renderer'),
      '@components': path.join(__dirname, 'src/renderer/components'),
      '@stores': path.join(__dirname, 'src/renderer/stores'),
      '@utils': path.join(__dirname, 'src/renderer/utils'),
    },
  },
  
  // CSS 配置
  css: {
    modules: {
      // CSS Modules 配置
      localsConvention: 'camelCase',
    },
    preprocessorOptions: {
      // 如果使用 SCSS
      scss: {
        additionalData: `@import "@/styles/variables.scss";`,
      },
    },
  },
  
  // 优化配置
  optimizeDeps: {
    // 预构建依赖
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      'zustand',
    ],
    // 排除预构建
    exclude: [
      // 排除 Electron 相关模块
    ],
  },
});
```

**最佳实践**:
- 使用 `base: './'` 确保资源路径正确
- 配置 `target` 匹配 Electron 的 Chromium 版本
- 使用 `manualChunks` 优化代码分割
- 配置路径别名简化导入
- 启用 Fast Refresh 提升开发体验

### 4. 主进程 Vite 配置

配置主进程的 Vite 构建:

```typescript
// vite.main.config.ts
import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  // 根目录
  root: path.join(__dirname, 'src/main'),
  
  // 构建配置
  build: {
    outDir: path.join(__dirname, 'dist/main'),
    emptyOutDir: true,
    
    // 库模式
    lib: {
      entry: {
        main: path.join(__dirname, 'src/main/main.ts'),
        preload: path.join(__dirname, 'src/main/preload.ts'),
      },
      formats: ['cjs'], // CommonJS 格式
      fileName: (format, entryName) => `${entryName}.js`,
    },
    
    // Rollup 配置
    rollupOptions: {
      external: [
        // 外部化 Node.js 内置模块
        'electron',
        'fs',
        'path',
        'os',
        'crypto',
        'events',
        'stream',
        'util',
        'buffer',
        
        // 外部化原生模块
        'better-sqlite3',
        
        // 外部化其他依赖
        'isomorphic-git',
      ],
      output: {
        // 保留模块结构
        preserveModules: false,
      },
    },
    
    // 压缩配置
    minify: process.env.NODE_ENV === 'production',
    
    // 生成 sourcemap
    sourcemap: process.env.NODE_ENV === 'development',
    
    // 目标环境
    target: 'node18', // 匹配 Electron 的 Node.js 版本
  },
  
  // 路径别名
  resolve: {
    alias: {
      '@main': path.join(__dirname, 'src/main'),
      '@services': path.join(__dirname, 'src/main/services'),
      '@types': path.join(__dirname, 'src/types'),
    },
  },
});
```

**最佳实践**:
- 使用库模式(`lib`)构建主进程
- 外部化 Node.js 内置模块和原生模块
- 配置 `target: 'node18'` 匹配 Electron 的 Node.js 版本
- 分别构建 `main.ts` 和 `preload.ts`
- 生产环境启用压缩

### 5. 开发环境配置

配置开发环境的热重载和调试:

```typescript
// scripts/dev.ts
import { spawn, ChildProcess } from 'child_process';
import { createServer } from 'vite';
import electron from 'electron';

let electronProcess: ChildProcess | null = null;

async function startDev() {
  // 1. 启动渲染进程开发服务器
  const rendererServer = await createServer({
    configFile: 'vite.renderer.config.ts',
  });
  
  await rendererServer.listen();
  
  console.log('Renderer dev server started at http://localhost:3000');
  
  // 2. 监听主进程代码变化
  const mainServer = await createServer({
    configFile: 'vite.main.config.ts',
    build: {
      watch: {}, // 启用监听模式
    },
  });
  
  // 3. 构建主进程
  await mainServer.build();
  
  // 4. 启动 Electron
  function startElectron() {
    if (electronProcess) {
      electronProcess.kill();
    }
    
    electronProcess = spawn(
      electron as any,
      [
        '--inspect=5858', // 启用调试
        path.join(__dirname, '../dist/main/main.js'),
      ],
      {
        stdio: 'inherit',
        env: {
          ...process.env,
          NODE_ENV: 'development',
          VITE_DEV_SERVER_URL: 'http://localhost:3000',
        },
      }
    );
    
    electronProcess.on('close', () => {
      process.exit(0);
    });
  }
  
  startElectron();
  
  // 5. 监听主进程代码变化,自动重启
  mainServer.watcher.on('change', async () => {
    console.log('Main process changed, rebuilding...');
    await mainServer.build();
    console.log('Restarting Electron...');
    startElectron();
  });
}

startDev().catch(console.error);
```

**package.json 脚本配置**:

```json
{
  "scripts": {
    "dev": "tsx scripts/dev.ts",
    "build": "npm run build:main && npm run build:renderer",
    "build:main": "vite build --config vite.main.config.ts",
    "build:renderer": "vite build --config vite.renderer.config.ts",
    "package": "npm run build && electron-builder",
    "package:mac": "npm run build && electron-builder --mac",
    "package:win": "npm run build && electron-builder --win"
  }
}
```

**主进程中加载开发服务器**:

```typescript
// src/main/main.ts
import { app, BrowserWindow } from 'electron';
import path from 'path';

const isDev = process.env.NODE_ENV === 'development';
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  
  if (isDev && VITE_DEV_SERVER_URL) {
    // 开发环境: 加载开发服务器
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    // 生产环境: 加载构建产物
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(createWindow);
```

**最佳实践**:
- 使用独立的开发脚本管理多个进程
- 监听主进程代码变化自动重启
- 渲染进程使用 Vite 的 HMR
- 启用 Electron 调试端口(`--inspect`)
- 通过环境变量区分开发和生产环境

### 6. 生产环境优化

优化生产环境的构建产物:

```typescript
// vite.renderer.config.ts (生产环境优化)
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
import { compression } from 'vite-plugin-compression';

export default defineConfig({
  plugins: [
    react(),
    
    // 生成构建分析报告
    visualizer({
      filename: 'dist/stats.html',
      open: false,
      gzipSize: true,
      brotliSize: true,
    }),
    
    // 生成 gzip 压缩文件
    compression({
      algorithm: 'gzip',
      ext: '.gz',
    }),
  ],
  
  build: {
    // 代码分割优化
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // 将 node_modules 中的依赖分组
          if (id.includes('node_modules')) {
            // React 相关
            if (id.includes('react') || id.includes('react-dom')) {
              return 'react-vendor';
            }
            // 编辑器相关
            if (id.includes('tiptap') || id.includes('prosemirror')) {
              return 'editor-vendor';
            }
            // 其他第三方库
            return 'vendor';
          }
        },
        
        // 优化 chunk 文件名
        chunkFileNames: 'assets/js/[name]-[hash].js',
        entryFileNames: 'assets/js/[name]-[hash].js',
        assetFileNames: 'assets/[ext]/[name]-[hash].[ext]',
      },
    },
    
    // 压缩配置
    minify: 'esbuild',
    
    // 关闭 sourcemap(生产环境)
    sourcemap: false,
    
    // 优化配置
    cssCodeSplit: true, // CSS 代码分割
    assetsInlineLimit: 4096, // 小于 4KB 的资源内联为 base64
    
    // 清理输出目录
    emptyOutDir: true,
  },
  
  // 优化依赖预构建
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      'zustand',
    ],
  },
});
```

**Tree Shaking 优化**:

```typescript
// 确保使用 ES Modules 导入
import { useState, useEffect } from 'react'; // ✅ 正确
// import React from 'react'; // ❌ 避免默认导入

// 使用具名导入
import { Button, Input } from '@/components'; // ✅ 正确
// import * as Components from '@/components'; // ❌ 避免命名空间导入

// package.json 配置
{
  "sideEffects": [
    "*.css",
    "*.scss"
  ]
}
```

**最佳实践**:
- 使用 `manualChunks` 优化代码分割
- 使用 `visualizer` 分析构建产物
- 启用 CSS 代码分割
- 配置 `sideEffects` 优化 Tree Shaking
- 生产环境关闭 sourcemap
- 使用 `compression` 插件生成压缩文件

### 7. 静态资源处理

处理图片、字体等静态资源:

```typescript
// vite.renderer.config.ts
export default defineConfig({
  // 静态资源目录
  publicDir: path.join(__dirname, 'src/renderer/public'),
  
  build: {
    rollupOptions: {
      output: {
        // 静态资源文件名
        assetFileNames: (assetInfo) => {
          const info = assetInfo.name.split('.');
          const ext = info[info.length - 1];
          
          // 根据文件类型分类
          if (/png|jpe?g|svg|gif|tiff|bmp|ico/i.test(ext)) {
            return 'assets/images/[name]-[hash].[ext]';
          }
          if (/woff2?|ttf|otf|eot/i.test(ext)) {
            return 'assets/fonts/[name]-[hash].[ext]';
          }
          return 'assets/[ext]/[name]-[hash].[ext]';
        },
      },
    },
    
    // 资源内联阈值
    assetsInlineLimit: 4096, // 4KB
  },
});
```

**在代码中使用静态资源**:

```typescript
// 导入图片
import logo from '@/assets/logo.png';

function App() {
  return <img src={logo} alt="Logo" />;
}

// 导入 SVG 作为组件
import { ReactComponent as Icon } from '@/assets/icon.svg';

function App() {
  return <Icon />;
}

// 使用 public 目录中的资源
function App() {
  return <img src="/favicon.ico" alt="Favicon" />;
}
```

**最佳实践**:
- 小于 4KB 的资源内联为 base64
- 大资源使用独立文件
- 根据文件类型分类存储
- 使用 `public` 目录存放不需要处理的静态资源

### 8. 原生模块处理

处理 Electron 原生模块(如 better-sqlite3):

```typescript
// vite.main.config.ts
export default defineConfig({
  build: {
    rollupOptions: {
      external: [
        // 外部化原生模块
        'better-sqlite3',
        'sqlite3',
        'node-gyp',
      ],
    },
  },
});
```

**electron-builder 配置**:

```yaml
# electron-builder.yml
appId: com.sibylla.app
productName: Sibylla

# 包含原生模块
files:
  - dist/**/*
  - package.json
  - node_modules/better-sqlite3/**/*

# 原生模块配置
asarUnpack:
  - node_modules/better-sqlite3/**/*

# macOS 配置
mac:
  target:
    - dmg
    - zip
  category: public.app-category.productivity

# Windows 配置
win:
  target:
    - nsis
    - portable
```

**最佳实践**:
- 在 Vite 配置中外部化原生模块
- 在 electron-builder 中配置 `asarUnpack`
- 确保原生模块在打包后可用
- 测试打包后的应用

### 9. TypeScript 配置

配置 TypeScript 编译选项:

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    
    // 模块解析
    "moduleResolution": "node",
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    
    // 严格模式
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    
    // 路径别名
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/renderer/*"],
      "@main/*": ["src/main/*"],
      "@types/*": ["src/types/*"]
    },
    
    // 输出配置
    "outDir": "dist",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    
    // 其他
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": [
    "src/**/*"
  ],
  "exclude": [
    "node_modules",
    "dist"
  ]
}
```

**最佳实践**:
- 启用严格模式
- 配置路径别名
- 生成类型声明文件
- 使用 `skipLibCheck` 提升性能

### 10. 环境变量配置

配置环境变量:

```typescript
// .env.development
VITE_API_URL=http://localhost:8080
VITE_APP_NAME=Sibylla Dev

// .env.production
VITE_API_URL=https://api.sibylla.com
VITE_APP_NAME=Sibylla
```

**在代码中使用环境变量**:

```typescript
// src/renderer/config.ts
export const config = {
  apiUrl: import.meta.env.VITE_API_URL,
  appName: import.meta.env.VITE_APP_NAME,
  isDev: import.meta.env.DEV,
  isProd: import.meta.env.PROD,
};

// 类型定义
interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_APP_NAME: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

**最佳实践**:
- 使用 `VITE_` 前缀暴露环境变量
- 为环境变量添加类型定义
- 使用 `.env.local` 存储本地配置(不提交到 Git)
- 使用 `import.meta.env` 访问环境变量

## 与现有 Skills 的关系

- 与 [`electron-desktop-app`](.kilocode/skills/electron-desktop-app/SKILL.md) 互补: 为 Electron 应用提供构建工具链
- 与 [`typescript-strict-mode`](.kilocode/skills/typescript-strict-mode/SKILL.md) 互补: 配置 TypeScript 编译选项
- 与 [`electron-ipc-patterns`](.kilocode/skills/electron-ipc-patterns/SKILL.md) 互补: 构建 IPC 通信代码
- 与 [`isomorphic-git-integration`](.kilocode/skills/isomorphic-git-integration/SKILL.md) 互补: 构建 Git 抽象层代码

## 参考资源

- [Vite 官方文档](https://vitejs.dev/)
- [Vite Electron 插件](https://github.com/electron-vite/electron-vite-vue)
- [Electron Builder 文档](https://www.electron.build/)
- [Rollup 配置](https://rollupjs.org/configuration-options/)
