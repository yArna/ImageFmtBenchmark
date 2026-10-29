# 原图像素无损验证

```sh
bun run verify:pixels
bun run verify:pixels --concurrency 2
bun run verify:pixels --image 游戏 --encoder cwebp
```

读取现有原图和产物，不重新编码。逐像素核对 RGB、Alpha 和尺寸；三项均一致才设置 `lossless: true`。原图完全透明（Alpha=0）的像素不比较 RGB（不可见，允许无损模式改写），不使用误差容限、缩略图、SSIM 分数或 Q100 参数推断。缺少验证的旧记录不认定为无损。

整数样本按声明位深恢复并交叉相乘比较。例如 8 位的 128 与 16 位的 32896 完全等价，偏差一个 16 位整数样本也不相等。缺少 Alpha 等价于完全不透明。AVIF 通过 16 位 PNG 解码，WebP 通过 RGBA PAM 解码，其余格式直接解码。

`colorEncodingEqual` 另行记录色彩配置是否一致，不参与本项目按 RGB/Alpha 信息制定的像素无损分类。像素一致但 ICC 丢失时，SSIMULACRA2 仍可能低于 100；保留原实测分数，不强行改分。

## 数据字段

- `pixelVerification`：尺寸、RGB、Alpha、色彩配置的一致性，以及 RGB、Alpha 不同的像素数量和内容缓存键。
- `lossless`：本次逐样本验证是否通过。
- `encodingLossless`：原编码参数是否启用无损编码模式（各编码器的无损开关，以及等价于 `-d 0` 的 cjxl Q100），与实际验证结果分开保存。AVIF 的 Q100 仍经过 RGB 到 YUV 转换，不算无损模式；旧数据会按参数重新推导。
- 前端紧凑记录索引 `20` 保存验证对象，索引 `21` 保存编码模式声明，原评分索引 `19` 保持不变。

结果同时写入 `result/results.json`、`result/data/*.json` 和 `web/public/benchmark-data.json`。新增或重新编码的结果在验证前保持非无损分类，再执行本命令验证。编码和解码的基准耗时不包含验证耗时。

页面以编码器、力度、质量组成参数组。全集中该参数组的所有图片都通过才归入无损；否则保留整个参数组参与有损统计，避免仅保留通过的图片导致统计样本发生变化。实测无损的 Q100 从有损曲线和目标客观指标中排除，并以实际 Q100 参数出现在无损参考线和对比器中。

## 性能和续算

默认最多 8 个常驻进程，按最大图片尺寸限制内存预算；原图每个进程只解码一次，产物逐个释放。缓存位于 `result/pixel-verification-cache.jsonl`，绑定原图、产物和解码/验证工具内容，相同产物可复用。再次运行会核对文件哈希并复用已有验证。

Ctrl+C 会在当前项结束后保存进度。运行期间不要覆盖原图、产物或数据 JSON；写回前检测到其他任务修改数据会停止写回，已完成结果保留在缓存。

## 构建验证器

```sh
cmake --build encoder/src/libjxl/build \
  --target pixel_verify_worker -j 4
cp encoder/src/libjxl/build/tools/pixel_verify_worker \
  encoder/bin/pixel_verify_worker
```
