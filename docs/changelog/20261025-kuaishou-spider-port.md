# 快手命令行接入 KuaiShou-Spider 能力

## 背景

`src/platforms/kuaishou/` 已经把 [KuaiShou-Spider](https://github.com/cv-cat/KuaiShou-Spider) 的 www 数据接口、本地 `__NS_hxfalcon` / `__NS_sig3` 和直播弹幕移植进来。命令行此前仍只跑抖音：`download` / `user` 不看 `findPlatform`，快手没有自己的子命令。

签名不再依赖浏览器。`tests/kuaishou-sign.test.ts` 用 `tests/fixtures/kuaishou/sign-vectors.json` 与 Python 参考结果逐条对照。`RemoteSigner` 保留为可选注入。

## 改动

- `download <url>`、`user <url>` 按 `findPlatform` 分发。快手走 `KuaishouHandler` + `KuaishouDownloader`；未识别链接仍走原来的抖音解析。
- 快手 Cookie 用 `-c`，否则读环境变量 `KS_COOKIES`。缺失时直接说明需要完整网页 Cookie（`kwfv1` 与 `kuaishou.server.web*_st`），不打栈。
- 快手增加 `--media all|video|image`（对应上游 `media` / `media-video` / `media-image`）和 `--export csv|json`。
- `--music`、`--device-os`、`--device-seed` 在快手上警告后忽略；`--media`、`--export` 在抖音上警告后忽略。抖音原有成功路径不改。
- 新命令组 `pdl ks`（别名 `kuaishou`）：
  - `search <keyword>`：`-n`、`-c`、`-o`、`--export`、`--no-download`
  - `hot`：推荐流，选项与搜索相同
  - `comments <url|photoId>`：JSON 写文件或打到标准输出
  - `live <url|eid>`：`KuaishouLiveDanmaku` + `createLiveSigner()`，打印评论 / 礼物 / 点赞，`--duration` 为秒
- `KuaishouLoginError`、`KuaishouRiskError` 在命令行换成可操作的说明（更新 Cookie、不求解滑块，风控码 400002）。
- CLI 版本改为读取仓库根目录 `package.json`，不改版本号。
- 可测试的分发、Cookie 和命令流程在 `src/cli/kuaishou.ts`，测试为 `tests/kuaishou-cli.test.ts`。
- 示例：`examples/kuaishou-user-posts.ts`、`examples/kuaishou-live-danmaku.ts`。
- 文档：根 README、`src/platforms/kuaishou/README.md`、`docs/kuaishou-integration.md`。

## 未移植

与上游相比，这些仍然不做：二维码 / 短信登录、创作者发布与上传、滑块求解、gdfp 指纹上报、用 kwf/kws Node 预言机生成 `kwfv1`。调用方继续自己提供完整网页 Cookie。`__NS_sig3` 的算法已有向量测试，但没有接到发布 API。

## 已知限制

- 风控 `400002` 只抛 `KuaishouRiskError`（带验证页 URL）
- 直播弹幕可能需要 `live.kuaishou.com` 的有效 Cookie；没有 token 时命令失败并说明原因
- 推荐流仍可能因线上合同变化失败

## 验证

`npx vitest run`、`npm run typecheck`、`npm run lint`、`npx prettier --check`（本次改动的 `src/**/*.ts`）、`npm run build`，以及 `node dist/cli/index.js --help`、`ks --help`、无 Cookie 的快手 `download`。
