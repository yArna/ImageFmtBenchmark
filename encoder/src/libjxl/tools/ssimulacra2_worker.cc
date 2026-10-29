// Copyright (c) the JPEG XL Project Authors. All rights reserved.
//
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

/*
SSIMULACRA 2
Structural SIMilarity Unveiling Local And Compression Related Artifacts

Perceptual metric developed by Jon Sneyers (Cloudinary) in July 2022,
updated in April 2023.
Design:
- XYB color space (rescaled to a 0..1 range and with B-Y)
- SSIM map (with correction: no double gamma correction)
- 'blockiness/ringing' map (distorted has edges where original is smooth)
- 'smoothing' map (distorted is smooth where original has edges)
- error maps are computed at 6 scales (1:1 to 1:32) for each component (X,Y,B)
- downscaling is done in linear RGB
- for all 6*3*3=54 maps, two norms are computed: 1-norm (mean) and 4-norm
- a weighted sum of these 54*2=108 norms leads to the final score
- weights were tuned based on a large set of subjective scores
  (CID22, TID2013, Kadid10k, KonFiG-IQA).
*/

#include "tools/ssimulacra2.h"

#include <jxl/cms.h>
#include <jxl/memory_manager.h>

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <utility>

#include "lib/jxl/base/compiler_specific.h"
#include "lib/jxl/base/printf_macros.h"
#include "lib/jxl/base/status.h"
#include "lib/jxl/color_encoding_internal.h"
#include "lib/jxl/enc_xyb.h"
#include "lib/jxl/image.h"
#include "lib/jxl/image_bundle.h"
#include "lib/jxl/image_ops.h"
#include "tools/gauss_blur.h"
#include "lib/extras/codec.h"
#include "lib/extras/codec_in_out.h"
#include "lib/extras/dec/color_hints.h"
#include "tools/file_io.h"
#include <iostream>
#include <memory>
#include <string>
#include <array>
#include <map>
#ifdef __APPLE__
#include <CommonCrypto/CommonDigest.h>
#endif
#include "tools/thread_pool_internal.h"
#include "tools/no_memory_manager.h"

namespace {

using ::jxl::Image3F;
using ::jxl::ImageBundle;
using ::jxl::ImageF;
using ::jxl::Status;
using ::jxl::StatusOr;

const float kC2 = 0.0009f;
const int kNumScales = 6;
/** 单个任务最多使用两个工作线程，跨图片的并发仍由调度器限制。 */
jxl::ThreadPool* metric_pool = nullptr;

StatusOr<Image3F> Downsample(const Image3F& in, size_t fx, size_t fy) {
  const size_t out_xsize = (in.xsize() + fx - 1) / fx;
  const size_t out_ysize = (in.ysize() + fy - 1) / fy;
  JXL_ASSIGN_OR_RETURN(
      Image3F out,
      Image3F::Create(jpegxl::tools::NoMemoryManager(), out_xsize, out_ysize));
  const float normalize = 1.0f / (fx * fy);
  for (size_t c = 0; c < 3; ++c) {
    for (size_t oy = 0; oy < out_ysize; ++oy) {
      float* JXL_RESTRICT row_out = out.PlaneRow(c, oy);
      for (size_t ox = 0; ox < out_xsize; ++ox) {
        float sum = 0.0f;
        for (size_t iy = 0; iy < fy; ++iy) {
          for (size_t ix = 0; ix < fx; ++ix) {
            const size_t x = std::min(ox * fx + ix, in.xsize() - 1);
            const size_t y = std::min(oy * fy + iy, in.ysize() - 1);
            sum += in.PlaneRow(c, y)[x];
          }
        }
        row_out[ox] = sum * normalize;
      }
    }
  }
  return out;
}

void Multiply(const Image3F& a, const Image3F& b, Image3F* mul) {
  for (size_t c = 0; c < 3; ++c) {
    for (size_t y = 0; y < a.ysize(); ++y) {
      const float* JXL_RESTRICT in1 = a.PlaneRow(c, y);
      const float* JXL_RESTRICT in2 = b.PlaneRow(c, y);
      float* JXL_RESTRICT out = mul->PlaneRow(c, y);
      for (size_t x = 0; x < a.xsize(); ++x) {
        out[x] = in1[x] * in2[x];
      }
    }
  }
}

// Temporary storage for Gaussian blur, reused for multiple images.
class Blur {
 public:
  static StatusOr<Blur> Create(const size_t xsize, const size_t ysize) {
    JxlMemoryManager* memory_manager = jpegxl::tools::NoMemoryManager();
    Blur result;
    JXL_ASSIGN_OR_RETURN(result.temp_,
                         ImageF::Create(memory_manager, xsize, ysize));
    return result;
  }

  Status BlurPlane(const ImageF& in, ImageF* JXL_RESTRICT out) {
    JXL_RETURN_IF_ERROR(FastGaussian(
        in.memory_manager(), rg_, in.xsize(), in.ysize(),
        [&](size_t y) { return in.ConstRow(y); },
        [&](size_t y) { return temp_.Row(y); },
        [&](size_t y) { return out->Row(y); }, metric_pool));
    return true;
  }

  StatusOr<Image3F> operator()(const Image3F& in) {
    JxlMemoryManager* memory_manager = jpegxl::tools::NoMemoryManager();
    JXL_ASSIGN_OR_RETURN(
        Image3F out, Image3F::Create(memory_manager, in.xsize(), in.ysize()));
    JXL_RETURN_IF_ERROR(BlurPlane(in.Plane(0), &out.Plane(0)));
    JXL_RETURN_IF_ERROR(BlurPlane(in.Plane(1), &out.Plane(1)));
    JXL_RETURN_IF_ERROR(BlurPlane(in.Plane(2), &out.Plane(2)));
    return out;
  }

  // Allows reusing across scales.
  Status ShrinkTo(const size_t xsize, const size_t ysize) {
    return temp_.ShrinkTo(xsize, ysize);
  }

 private:
  Blur() : rg_(jxl::CreateRecursiveGaussian(1.5)) {}
  jxl::RecursiveGaussian rg_;
  ImageF temp_;
};

double quartic(double x) {
  x *= x;
  x *= x;
  return x;
}
void SSIMMap(const Image3F& m1, const Image3F& m2, const Image3F& s11,
             const Image3F& s22, const Image3F& s12, double* plane_averages) {
  const double onePerPixels = 1.0 / (m1.ysize() * m1.xsize());
  for (size_t c = 0; c < 3; ++c) {
    double sum1[2] = {0.0};
    for (size_t y = 0; y < m1.ysize(); ++y) {
      const float* JXL_RESTRICT row_m1 = m1.PlaneRow(c, y);
      const float* JXL_RESTRICT row_m2 = m2.PlaneRow(c, y);
      const float* JXL_RESTRICT row_s11 = s11.PlaneRow(c, y);
      const float* JXL_RESTRICT row_s22 = s22.PlaneRow(c, y);
      const float* JXL_RESTRICT row_s12 = s12.PlaneRow(c, y);
      for (size_t x = 0; x < m1.xsize(); ++x) {
        float mu1 = row_m1[x];
        float mu2 = row_m2[x];
        float mu11 = mu1 * mu1;
        float mu22 = mu2 * mu2;
        float mu12 = mu1 * mu2;
        /* Correction applied compared to the original SSIM formula, which has:

             luma_err = 2 * mu1 * mu2 / (mu1^2 + mu2^2)
                      = 1 - (mu1 - mu2)^2 / (mu1^2 + mu2^2)

           The denominator causes error in the darks (low mu1 and mu2) to weigh
           more than error in the brights (high mu1 and mu2). This would make
           sense if values correspond to linear luma. However, the actual values
           are either gamma-compressed luma (which supposedly is already
           perceptually uniform) or chroma (where weighing green more than red
           or blue more than yellow does not make any sense at all). So it is
           better to simply drop this denominator.
        */
        float num_m = 1.0 - (mu1 - mu2) * (mu1 - mu2);
        float num_s = 2 * (row_s12[x] - mu12) + kC2;
        float denom_s = (row_s11[x] - mu11) + (row_s22[x] - mu22) + kC2;

        // Use 1 - SSIM' so it becomes an error score instead of a quality
        // index. This makes it make sense to compute an L_4 norm.
        double d = 1.0 - (num_m * num_s / denom_s);
        d = std::max(d, 0.0);
        sum1[0] += d;
        sum1[1] += quartic(d);
      }
    }
    plane_averages[c * 2] = onePerPixels * sum1[0];
    plane_averages[c * 2 + 1] = sqrt(sqrt(onePerPixels * sum1[1]));
  }
}

void EdgeDiffMap(const Image3F& img1, const Image3F& mu1, const Image3F& img2,
                 const Image3F& mu2, double* plane_averages) {
  const double onePerPixels = 1.0 / (img1.ysize() * img1.xsize());
  for (size_t c = 0; c < 3; ++c) {
    double sum1[4] = {0.0};
    for (size_t y = 0; y < img1.ysize(); ++y) {
      const float* JXL_RESTRICT row1 = img1.PlaneRow(c, y);
      const float* JXL_RESTRICT row2 = img2.PlaneRow(c, y);
      const float* JXL_RESTRICT rowm1 = mu1.PlaneRow(c, y);
      const float* JXL_RESTRICT rowm2 = mu2.PlaneRow(c, y);
      for (size_t x = 0; x < img1.xsize(); ++x) {
        double d1 = (1.0 + std::abs(row2[x] - rowm2[x])) /
                        (1.0 + std::abs(row1[x] - rowm1[x])) -
                    1.0;

        // d1 > 0: distorted has an edge where original is smooth
        //         (indicating ringing, color banding, blockiness, etc)
        double artifact = std::max(d1, 0.0);
        sum1[0] += artifact;
        sum1[1] += quartic(artifact);

        // d1 < 0: original has an edge where distorted is smooth
        //         (indicating smoothing, blurring, smearing, etc)
        double detail_lost = std::max(-d1, 0.0);
        sum1[2] += detail_lost;
        sum1[3] += quartic(detail_lost);
      }
    }
    plane_averages[c * 4] = onePerPixels * sum1[0];
    plane_averages[c * 4 + 1] = sqrt(sqrt(onePerPixels * sum1[1]));
    plane_averages[c * 4 + 2] = onePerPixels * sum1[2];
    plane_averages[c * 4 + 3] = sqrt(sqrt(onePerPixels * sum1[3]));
  }
}

/* Get all components in more or less 0..1 range
   Range of Rec2020 with these adjustments:
    X: 0.017223..0.998838
    Y: 0.010000..0.855303
    B: 0.048759..0.989551
   Range of sRGB:
    X: 0.204594..0.813402
    Y: 0.010000..0.855308
    B: 0.272295..0.938012
   The maximum pixel-wise difference has to be <= 1 for the ssim formula to make
   sense.
*/
void MakePositiveXYB(Image3F& img) {
  for (size_t y = 0; y < img.ysize(); ++y) {
    float* JXL_RESTRICT rowY = img.PlaneRow(1, y);
    float* JXL_RESTRICT rowB = img.PlaneRow(2, y);
    float* JXL_RESTRICT rowX = img.PlaneRow(0, y);
    for (size_t x = 0; x < img.xsize(); ++x) {
      rowB[x] = (rowB[x] - rowY[x]) + 0.55f;
      rowX[x] = rowX[x] * 14.f + 0.42f;
      rowY[x] += 0.01f;
    }
  }
}

void AlphaBlend(ImageBundle& img, float bg) {
  for (size_t y = 0; y < img.ysize(); ++y) {
    float* JXL_RESTRICT r = img.color()->PlaneRow(0, y);
    float* JXL_RESTRICT g = img.color()->PlaneRow(1, y);
    float* JXL_RESTRICT b = img.color()->PlaneRow(2, y);
    const float* JXL_RESTRICT a = img.alpha()->Row(y);
    for (size_t x = 0; x < img.xsize(); ++x) {
      r[x] = a[x] * r[x] + (1.f - a[x]) * bg;
      g[x] = a[x] * g[x] + (1.f - a[x]) * bg;
      b[x] = a[x] * b[x] + (1.f - a[x]) * bg;
    }
  }
}

Status ToXYB(const ImageBundle& in, Image3F* JXL_RESTRICT xyb) {
  JxlMemoryManager* memory_manager = in.memory_manager();
  JXL_ASSIGN_OR_RETURN(*xyb,
                       Image3F::Create(memory_manager, in.xsize(), in.ysize()));
  JXL_RETURN_IF_ERROR(CopyImageTo(in.color(), xyb));
  JXL_RETURN_IF_ERROR(ToXYB(in.c_current(), in.metadata()->IntensityTarget(),
                            in.black(), metric_pool, xyb, *JxlGetDefaultCms(),
                            nullptr));
  return true;
}

}  // namespace


namespace {
/** 原图只解码一次；缓存每个背景、尺度的 XYB 与高斯统计。 */
struct IScaleReference {
  jxl::Image3F image, mean, square;
};
struct IBackgroundReference {
  float background;
  std::vector<IScaleReference> scales;
  jxl::Status Init(const jxl::ImageBundle& original, float bg) {
    background = bg;
    JXL_ASSIGN_OR_RETURN(jxl::ImageBundle image, original.Copy());
    if (image.HasAlpha()) AlphaBlend(image, bg);
    image.ClearExtraChannels();
    JXL_RETURN_IF_ERROR(image.TransformTo(jxl::ColorEncoding::LinearSRGB(image.IsGray()), *JxlGetDefaultCms(), metric_pool));
    JXL_ASSIGN_OR_RETURN(Blur blur, Blur::Create(image.xsize(), image.ysize()));
    JXL_ASSIGN_OR_RETURN(jxl::Image3F product, jxl::Image3F::Create(jpegxl::tools::NoMemoryManager(), image.xsize(), image.ysize()));
    scales.clear();
    for (int scale = 0; scale < kNumScales; ++scale) {
      if (image.xsize() < 8 || image.ysize() < 8) break;
      if (scale) {
        JXL_ASSIGN_OR_RETURN(jxl::Image3F down, Downsample(*image.color(), 2, 2));
        JXL_RETURN_IF_ERROR(image.SetFromImage(std::move(down), jxl::ColorEncoding::LinearSRGB(image.IsGray())));
      }
      IScaleReference ref;
      JXL_RETURN_IF_ERROR(ToXYB(image, &ref.image));
      MakePositiveXYB(ref.image);
      JXL_RETURN_IF_ERROR(product.ShrinkTo(image.xsize(), image.ysize()));
      JXL_RETURN_IF_ERROR(blur.ShrinkTo(image.xsize(), image.ysize()));
      Multiply(ref.image, ref.image, &product);
      JXL_ASSIGN_OR_RETURN(ref.square, blur(product));
      JXL_ASSIGN_OR_RETURN(ref.mean, blur(ref.image));
      scales.push_back(std::move(ref));
    }
    return true;
  }
  jxl::Status Evaluate(const jxl::ImageBundle& distorted, double* score) const {
    JXL_ASSIGN_OR_RETURN(jxl::ImageBundle image, distorted.Copy());
    if (image.HasAlpha()) AlphaBlend(image, background);
    image.ClearExtraChannels();
    JXL_RETURN_IF_ERROR(image.TransformTo(jxl::ColorEncoding::LinearSRGB(image.IsGray()), *JxlGetDefaultCms(), metric_pool));
    JXL_ASSIGN_OR_RETURN(Blur blur, Blur::Create(image.xsize(), image.ysize()));
    JXL_ASSIGN_OR_RETURN(jxl::Image3F product, jxl::Image3F::Create(jpegxl::tools::NoMemoryManager(), image.xsize(), image.ysize()));
    Msssim result;
    for (size_t scale = 0; scale < scales.size(); ++scale) {
      const auto& ref = scales[scale];
      if (scale) {
        JXL_ASSIGN_OR_RETURN(jxl::Image3F down, Downsample(*image.color(), 2, 2));
        JXL_RETURN_IF_ERROR(image.SetFromImage(std::move(down), jxl::ColorEncoding::LinearSRGB(image.IsGray())));
      }
      JXL_ASSIGN_OR_RETURN(jxl::Image3F xyb, jxl::Image3F::Create(jpegxl::tools::NoMemoryManager(), image.xsize(), image.ysize()));
      JXL_RETURN_IF_ERROR(ToXYB(image, &xyb));
      MakePositiveXYB(xyb);
      // 完全相同的 XYB 可严格得到 100，不使用有损近似阈值。
      if (scale == 0) {
        bool equal = true;
        for (size_t c = 0; c < 3 && equal; ++c)
          for (size_t y = 0; y < xyb.ysize() && equal; ++y)
            for (size_t x = 0; x < xyb.xsize(); ++x)
              if (xyb.PlaneRow(c, y)[x] != ref.image.PlaneRow(c, y)[x]) { equal = false; break; }
        if (equal) { *score = 100.0; return true; }
      }
      JXL_RETURN_IF_ERROR(product.ShrinkTo(image.xsize(), image.ysize()));
      JXL_RETURN_IF_ERROR(blur.ShrinkTo(image.xsize(), image.ysize()));
      Multiply(xyb, xyb, &product);
      JXL_ASSIGN_OR_RETURN(jxl::Image3F square, blur(product));
      Multiply(ref.image, xyb, &product);
      JXL_ASSIGN_OR_RETURN(jxl::Image3F cross, blur(product));
      JXL_ASSIGN_OR_RETURN(jxl::Image3F mean, blur(xyb));
      MsssimScale output;
      SSIMMap(ref.mean, mean, ref.square, square, cross, output.avg_ssim);
      EdgeDiffMap(ref.image, ref.mean, xyb, mean, output.avg_edgediff);
      result.scales.push_back(output);
    }
    *score = result.Score();
    return true;
  }
};
/** 与官方 CLI 一致：原图带 Alpha 时取深浅背景的最低分，JPEG 也遵守此规则。 */
/** 透明通道完全不透明时，两种背景严格等价，可避免重复计算。 */
bool IsOpaque(const jxl::ImageBundle& image) {
  if (!image.HasAlpha()) return true;
  for (size_t y = 0; y < image.ysize(); ++y)
    for (size_t x = 0; x < image.xsize(); ++x)
      if (image.alpha()->Row(y)[x] != 1.0f) return false;
  return true;
}
struct IReference {
  std::unique_ptr<jxl::CodecInOut> original;
  std::vector<IBackgroundReference> backgrounds;
  bool opaque = false;
#ifdef __APPLE__
  // 只保留 SHA-256 与分数，跨力度复用完全相同的解码像素，不保留整张产物。
  std::map<std::array<unsigned char, CC_SHA256_DIGEST_LENGTH>, double> pixel_scores;
  std::array<unsigned char, CC_SHA256_DIGEST_LENGTH> PixelKey(const jxl::ImageBundle& image) {
    CC_SHA256_CTX hash; CC_SHA256_Init(&hash);
    const auto& icc = image.c_current().ICC();
    CC_SHA256_Update(&hash, icc.data(), static_cast<CC_LONG>(icc.size()));
    const bool alpha = image.HasAlpha();
    CC_SHA256_Update(&hash, &alpha, sizeof(alpha));
    for (size_t c = 0; c < 3; ++c)
      for (size_t y = 0; y < image.ysize(); ++y)
        CC_SHA256_Update(&hash, image.color().ConstPlaneRow(c, y), static_cast<CC_LONG>(image.xsize() * sizeof(float)));
    if (alpha) for (size_t y = 0; y < image.ysize(); ++y)
      CC_SHA256_Update(&hash, image.alpha()->ConstRow(y), static_cast<CC_LONG>(image.xsize() * sizeof(float)));
    // 相同解码像素还必须具有相同的色彩亮度解释。
    const float intensity = image.metadata()->IntensityTarget();
    CC_SHA256_Update(&hash, &intensity, sizeof(intensity));
    std::array<unsigned char, CC_SHA256_DIGEST_LENGTH> result;
    CC_SHA256_Final(result.data(), &hash); return result;
  }
#endif
  jxl::Status LoadImage(const std::string& path, std::unique_ptr<jxl::CodecInOut>* output) {
    std::vector<uint8_t> bytes;
    if (!jpegxl::tools::ReadFile(path, &bytes)) return JXL_FAILURE("Read failed");
    *output = jxl::make_unique<jxl::CodecInOut>(jpegxl::tools::NoMemoryManager());
    return jxl::SetFromBytes(jxl::Bytes(bytes), jxl::extras::ColorHints(), output->get());
  }
  jxl::Status Load(const std::string& path) {
    backgrounds.clear(); original.reset();
#ifdef __APPLE__
    pixel_scores.clear();
#endif
    JXL_RETURN_IF_ERROR(LoadImage(path, &original));
    if (original->xsize() < 8 || original->ysize() < 8) return JXL_FAILURE("Minimum size is 8x8");
    opaque = IsOpaque(original->Main());
    std::vector<float> values = !original->Main().HasAlpha() ? std::vector<float>{0.5f} : opaque ? std::vector<float>{0.1f} : std::vector<float>{0.1f, 0.9f};
    for (float bg : values) {
      IBackgroundReference ref;
      JXL_RETURN_IF_ERROR(ref.Init(original->Main(), bg));
      backgrounds.push_back(std::move(ref));
    }
    return true;
  }
  jxl::Status Evaluate(const std::string& path, double* score) {
    if (!original || backgrounds.empty()) return JXL_FAILURE("No reference");
    std::unique_ptr<jxl::CodecInOut> distorted;
    JXL_RETURN_IF_ERROR(LoadImage(path, &distorted));
    if (original->xsize() != distorted->xsize() || original->ysize() != distorted->ysize()) return JXL_FAILURE("Dimension mismatch");
#ifdef __APPLE__
    const auto key = PixelKey(distorted->Main());
    const auto previous = pixel_scores.find(key);
    if (previous != pixel_scores.end()) { *score = previous->second; return true; }
#endif
    const bool needs_bright = original->Main().HasAlpha() && (!opaque || !IsOpaque(distorted->Main()));
    if (needs_bright && backgrounds.size() == 1) {
      IBackgroundReference bright;
      JXL_RETURN_IF_ERROR(bright.Init(original->Main(), 0.9f));
      backgrounds.push_back(std::move(bright));
    }
    *score = 100.0;
    for (size_t i = 0; i < (needs_bright ? backgrounds.size() : size_t{1}); ++i) {
      double value;
      JXL_RETURN_IF_ERROR(backgrounds[i].Evaluate(distorted->Main(), &value));
      if (!std::isfinite(value)) return JXL_FAILURE("Non-finite score");
      *score = std::min(*score, value);
    }
#ifdef __APPLE__
    pixel_scores[key] = *score;
#endif
    return true;
  }
};
}  // namespace

/** 行协议一次只处理一个请求，便于调度器施加背压和限制内存。 */
int main() {
  jpegxl::tools::ThreadPoolInternal pool(2);
  metric_pool = pool.get();
  IReference reference;
  std::string line;
  while (std::getline(std::cin, line)) {
    if (line == "QUIT") break;
    const auto tab = line.find('\t');
    if (tab == std::string::npos) { puts("{\"ok\":false}"); fflush(stdout); continue; }
    const auto command = line.substr(0, tab), path = line.substr(tab + 1);
    if (command == "REF") {
      puts(reference.Load(path) ? "{\"ok\":true}" : "{\"ok\":false}");
    } else if (command == "EVAL") {
      double score;
      if (reference.Evaluate(path, &score)) printf("{\"ok\":true,\"ssimulacra2\":%.8f}\n", score);
      else puts("{\"ok\":false}");
    } else { puts("{\"ok\":false}"); }
    fflush(stdout);
  }
  return 0;
}
