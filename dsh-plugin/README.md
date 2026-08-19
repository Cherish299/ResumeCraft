# ResumeCraft DSH Plugin

ResumeCraft 的 DSH Web 插件包装层。

它会在 DSH 侧边栏底部提供一个入口按钮，点击后以全屏浮层方式打开 ResumeCraft 简历工作台。

## 说明

- **对外名称**：ResumeCraft
- **当前插件包名**：`dsh-resume-kit`
- **当前配置 id**：`resume-kit`

为了避免影响现有本地安装和开发流程，这一层暂时保留旧包名和旧 id；本轮主要统一对外文案。

## 入口形态

- 入口位置：`sidebar.footer.action`
- 打开方式：`shell.overlay`
- 渲染方式：在浮层内通过 `<iframe srcDoc>` 加载内嵌的单文件应用

## 构建

`dist/client.js` 与 `dist/index.js` 由仓库根目录 `scripts/build.js` 生成：

```bash
node scripts/build.js
```

## 启用条目

```yaml
# %APPDATA%\dsh-desktop\harness\profiles\web\cordis.patch.yml
- insert:
    - id: resume-kit
      name: dsh-resume-kit
```

> 注意：这里的 `id` 和 `name` 仍然是旧命名，用于兼容当前插件安装方式。

## 文件

| 文件 | 作用 |
| --- | --- |
| `dist/client.js` | 浏览器侧 bundle，注册侧边栏按钮和全屏浮层 |
| `dist/index.js` | 宿主侧 node 半部（no-op） |
| `package.json` | `dsh.client` 声明与导出映射 |
