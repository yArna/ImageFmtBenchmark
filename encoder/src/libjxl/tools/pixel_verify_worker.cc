// Copyright (c) the JPEG XL Project Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license in LICENSE.

#include <cmath>
#include <cstdio>
#include <iostream>
#include <memory>
#include <string>
#include <vector>

#include "lib/extras/codec.h"
#include "lib/extras/codec_in_out.h"
#include "lib/extras/dec/color_hints.h"
#include "tools/file_io.h"
#include "tools/no_memory_manager.h"

namespace {
/** 按解码位深恢复整数样本，用交叉相乘验证比例完全相等。 */
bool SampleEqual(float a, float b, uint32_t a_bits, uint32_t b_bits) {
  if (a_bits == 0 || b_bits == 0 || a_bits > 16 || b_bits > 16) return a == b;
  const int64_t a_max = (int64_t{1} << a_bits) - 1;
  const int64_t b_max = (int64_t{1} << b_bits) - 1;
  return std::llround(static_cast<double>(a) * a_max) * b_max ==
         std::llround(static_cast<double>(b) * b_max) * a_max;
}

/** 比较解码后的原始 RGB 样本，归一化不同位深，不经过 ICC 变换、合成或容差近似。 */
bool Load(const std::string& path, std::unique_ptr<jxl::CodecInOut>* image) {
  std::vector<uint8_t> bytes;
  if (!jpegxl::tools::ReadFile(path, &bytes)) return false;
  *image = jxl::make_unique<jxl::CodecInOut>(jpegxl::tools::NoMemoryManager());
  return jxl::SetFromBytes(jxl::Bytes(bytes), jxl::extras::ColorHints(), image->get());
}

/** 原图完全透明的像素不比较 RGB（不可见，允许编码器改写）；缺少 Alpha 等价于完全不透明。 */
bool Compare(const jxl::CodecInOut& original, const jxl::CodecInOut& decoded) {
  if (original.xsize() != decoded.xsize() || original.ysize() != decoded.ysize()) {
    puts("{\"ok\":true,\"rgbEqual\":false,\"alphaEqual\":false,\"dimensionsEqual\":false,\"colorEncodingEqual\":false}");
    return true;
  }
  const auto& a = original.Main();
  const auto& b = decoded.Main();
  size_t rgb_changed = 0, alpha_changed = 0;
  for (size_t y = 0; y < original.ysize(); ++y) {
    for (size_t x = 0; x < original.xsize(); ++x) {
      const float first_alpha = a.HasAlpha() ? a.alpha()->ConstRow(y)[x] : 1.0f;
      const float second_alpha = b.HasAlpha() ? b.alpha()->ConstRow(y)[x] : 1.0f;
      if (!std::isfinite(first_alpha) || !std::isfinite(second_alpha)) return false;
      bool same = true;
      for (size_t c = 0; c < 3 && first_alpha != 0.0f; ++c) {
        const float first = a.color().ConstPlaneRow(c, y)[x];
        const float second = b.color().ConstPlaneRow(c, y)[x];
        if (!std::isfinite(first) || !std::isfinite(second)) return false;
        if (!SampleEqual(first, second, original.metadata.m.bit_depth.bits_per_sample,
                         decoded.metadata.m.bit_depth.bits_per_sample)) same = false;
      }
      if (!same) ++rgb_changed;
      if (!SampleEqual(first_alpha, second_alpha, a.HasAlpha() ? a.metadata()->GetAlphaBits() : 1,
                       b.HasAlpha() ? b.metadata()->GetAlphaBits() : 1)) ++alpha_changed;
    }
  }
  const bool color_equal = a.c_current().SameColorEncoding(b.c_current());
  printf("{\"ok\":true,\"rgbEqual\":%s,\"alphaEqual\":%s,\"dimensionsEqual\":true,\"colorEncodingEqual\":%s,\"rgbDifferentPixels\":%zu,\"alphaDifferentPixels\":%zu}\n",
         rgb_changed ? "false" : "true", alpha_changed ? "false" : "true",
         color_equal ? "true" : "false", rgb_changed, alpha_changed);
  return true;
}
}  // namespace

/** 常驻原图以降低批量验证的解码和内存开销，产物逐个释放。 */
int main() {
  std::unique_ptr<jxl::CodecInOut> reference;
  std::string line;
  while (std::getline(std::cin, line)) {
    if (line == "QUIT") break;
    const size_t tab = line.find('\t');
    bool ok = false;
    if (tab != std::string::npos) {
      const std::string command = line.substr(0, tab), path = line.substr(tab + 1);
      if (command == "REF") {
        reference.reset();
        ok = Load(path, &reference);
        if (!ok) reference.reset();
        if (ok) puts("{\"ok\":true}");
      } else if (command == "EVAL" && reference) {
        std::unique_ptr<jxl::CodecInOut> image;
        ok = Load(path, &image) && Compare(*reference, *image);
      }
    }
    if (!ok) puts("{\"ok\":false}");
    fflush(stdout);
  }
  return 0;
}
