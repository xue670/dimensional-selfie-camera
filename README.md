# 次元自拍相机

手机端虚拟角色自拍原型。当前版本支持：

1. 调用前置相机
2. 导入 PNG/JPG 图片角色
3. 导入 GLB 模型角色
4. 生成自拍合影预览图

## 本地开发

```bash
npm install
npm run dev
```

默认地址：

1. 本机：`http://localhost:4173`
2. 局域网：`http://<你的局域网 IP>:4173`

## 为什么手机访问局域网地址时不能调相机

浏览器调用相机通常要求安全环境。

以下环境通常可用：

1. `https://...`
2. 设备本机上的 `http://localhost`

以下环境通常不可用：

1. 手机访问电脑的 `http://192.168.x.x:4173`

因此，手机真机测试相机时，建议使用 HTTPS 部署地址。

## 推荐测试方式

### 方式 1：部署到 HTTPS 平台

推荐平台：

1. Vercel
2. Netlify

流程：

1. 将项目上传到 GitHub。
2. 在 Vercel 或 Netlify 导入仓库。
3. 平台会自动生成 `https://` 预览地址。
4. 手机上直接打开该 HTTPS 地址，即可测试相机权限。

#### Vercel 最短步骤

1. 将当前项目提交到 GitHub 仓库。
2. 打开 [Vercel](https://vercel.com/) 并登录。
3. 选择 `Add New -> Project`。
4. 导入该 GitHub 仓库。
5. 构建设置保持默认即可：
   - Framework Preset: `Vite`
   - Build Command: `npm run build`
   - Output Directory: `dist`
6. 点击 Deploy。
7. 部署完成后，直接在手机上打开生成的 `https://...vercel.app` 地址。

#### Netlify 最短步骤

1. 将当前项目提交到 GitHub 仓库。
2. 打开 [Netlify](https://www.netlify.com/) 并登录。
3. 选择 `Add new site -> Import an existing project`。
4. 导入该 GitHub 仓库。
5. 构建设置保持默认即可：
   - Build command: `npm run build`
   - Publish directory: `dist`
6. 点击 Deploy site。
7. 部署完成后，在手机上打开生成的 `https://...netlify.app` 地址。

### 方式 2：本地 HTTPS

如果你希望继续在局域网内调试，需要给本地开发服务配置 HTTPS 证书，再让手机访问 `https://<局域网 IP>:端口`。

这个方案适合长期调试，但配置成本高于直接部署预览。

## 当前阶段建议

V0.1 阶段优先建议：

1. 先把页面部署到 HTTPS
2. 在手机上验证前摄调用
3. 再继续打磨 3D 操作、角色互动和导出体验

## 发布前检查清单

1. `npm install`
2. `npm run build`
3. 确认手机访问的是 `https://` 地址，而不是局域网 `http://192.168.x.x`
4. 首次打开时允许浏览器相机权限
5. 如需从微信中打开，优先选择“在浏览器中打开”
