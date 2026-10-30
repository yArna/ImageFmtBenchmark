# GitHub Pages 发布

页面、统计数据和 WASM 构建到仓库根目录的 `docs/`。
原图和结果图片存放在同一公开仓库的 `benchmark-assets` 分支。
发布版通过 GitHub Raw 访问固定提交中的图片，本地开发继续使用本地目录。

在仓库根目录运行：

```sh
bun run web:assets:publish --ssh --build \
  --state-dir /tmp/imagefmt-assets-upload
```

上传默认每批约 64 MiB，每批独立提交并推送。
中断后使用同一个 `--state-dir` 重跑即可续传。
即使本地状态目录丢失，也能从远程分支读取已上传的文件并跳过。
脚本使用独立 Git 索引，不会改变主仓库的暂存区。
HTTPS 上传可去掉 `--ssh`；本次网络中 HTTPS 上传曾返回 408。

只有全部图片上传成功且数据集没有变化后，脚本才更新
`web/github-assets.json`，其中记录提交 SHA 和数据集校验值。
基准数据更新后应重新上传再构建，避免数据与图片不一致。

提交 `docs/` 和代码后，将 Pages 来源设为相应分支的 `/docs`。
默认网站路径为 `/ImageFmtBenchmark/`。
若改用独立域名，可用 `IFB_SITE_BASE=/ bun run web:build` 构建。
`.nojekyll` 会随构建输出。JXL 在浏览器不能原生显示时使用 WASM 解码预览。

`result/` 中的完整统计 JSON、验证缓存和日志不会上传；
脚本只上传网页数据集引用的原图、编码图片及对应数据集。
