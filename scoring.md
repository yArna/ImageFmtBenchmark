# SSIMULACRA2 补算

在项目目录运行：

```sh
bun run score
```

只读取现有原图和编码产物，不重新编码。默认按 CPU 数量选择最多 8 个常驻进程，再根据最大原图尺寸限制内存预算。可手动降低并发：

```sh
bun run score --concurrency 2
bun run score --image 小图标 --encoder cwebp
```

筛选使用名称包含匹配，因此 `cwebp` 同时包含普通版和 sharp-yuv 版。按 Ctrl+C 会在当前项结束后保存进度，重新运行相同命令即可续算。

## 计算口径

- 使用原图完整分辨率，保留嵌入 ICC，并按官方工具转换到线性 sRGB。
- 原图带 Alpha 时，分别在 0.1、0.9 背景下计算并取最低分；产物不带 Alpha 也遵守此规则。
- AVIF 解码为 16 位 PNG，避免把 10 位产物提前量化到 8 位；WebP 解码为 RGBA PAM，保留透明度。
- 原图与产物都完全不透明时，两种背景严格等价，只计算一次。
- 不因 `lossless` 标记直接赋 100 分。丢失 ICC、透明度或其他视觉信息都会反映在分数中。
- 分数允许为负数；缺失评分使用字段缺省或 `null`，不使用 0 代替。

## 数据位置

| 文件 | 新增数据 |
| --- | --- |
| `result/data/*.json` | 每条记录的 `ssimulacra2`、`ssimulacra2Key` |
| `result/results.json` | 相同评分字段及 `metrics.ssimulacra2` 计算口径 |
| `web/public/benchmark-data.json` | 紧凑记录索引 `19`（第 20 项）保存评分 |
| `result/ssimulacra2-cache.jsonl` | 逐项追加的内容寻址检查点 |

概览的“目标客观指标”先排除同一编码器、力度下体积更大且评分不占优的档位，再按最接近的评分匹配产物，并显示实际 SS2 分数与目标偏差。像素无损分类由独立的 [原图像素验证](./pixel-verification.md) 决定。编码、解码耗时保持原值，评分耗时不混入基准耗时。

评分缓存绑定原图内容、产物内容及评分/解码工具内容；改变任一输入会自动重算。相同字节的产物可复用持久评分，同一原图下解码像素与色彩配置完全相同的产物也会在原生进程中复用评分。参考图的解码结果和六级尺度特征驻留内存，临时解码图片用后删除。

运行时不要同时覆盖原图或编码产物。数据写回前检查 JSON 是否被其他任务修改，发现修改会停止写回，已完成结果保留在检查点中。

## 构建计算器

仓库提供本机编译的 `encoder/bin/ssimulacra2_worker`。需要重新构建时：

```sh
cmake --build encoder/src/libjxl/build \
  --target ssimulacra2_worker -j 4
cp encoder/src/libjxl/build/tools/ssimulacra2_worker \
  encoder/bin/ssimulacra2_worker
```

常驻计算器复用 libjxl 的 SSIMULACRA2 公式和权重，仅缓存参考特征，不缩小图片、不计算其他指标。测试使用官方 `ssimulacra2` CLI 对照数值。
