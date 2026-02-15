# Personal OS 浏览器扩展（v0.1）

用于将当前页面或选中文本采集到后端接口 `POST /api/v1/ingest/browser`。

## 功能
- Popup 一键采集当前页面
- 右键菜单采集选中文本
- 可选自动采集页面元数据（默认关闭）
- 可配置后端地址与采集 Token

## 安装方式（Chrome）
1. 打开 `chrome://extensions`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择目录：`personal-os/extension`

## 后端要求
- 后端必须可访问（例如 `http://127.0.0.1:8000`）
- 采集接口鉴权 token 与扩展配置保持一致：
  - 后端：`PERSONAL_OS_INGEST_TOKEN`
  - 扩展设置：`采集 Token`

## 手工验收
1. 在扩展设置中填写后端地址和 token。
2. 打开任意网页，点击扩展「采集当前页面」。
3. 调用后端 `GET /api/v1/today`，应能看到新 event。
4. 在网页选中文本，右键选择「发送到 Personal OS」，再次检查 `today` 聚合。
