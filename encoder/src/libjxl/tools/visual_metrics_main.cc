// Unified high-performance visual quality metrics evaluator (SSIMULACRA2, Butteraugli, PSNR, SSIM)
// Supports both CLI mode:
//   visual_metrics <reference> <distorted>
// and persistent worker mode (stdin/stdout tab-separated protocol):
//   visual_metrics --worker [--threads N]
//   REF\t<reference_path>
//   EVAL\t<distorted_path>

#include <jxl/cms.h>
#include <jxl/cms_interface.h>
#include <jxl/memory_manager.h>
#include <jxl/types.h>

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <iostream>
#include <memory>
#include <string>
#include <utility>
#include <vector>

#include "lib/extras/codec.h"
#include "lib/extras/codec_in_out.h"
#include "lib/extras/dec/color_hints.h"
#include "lib/jxl/base/common.h"
#include "lib/jxl/base/compiler_specific.h"
#include "lib/jxl/base/data_parallel.h"
#include "lib/jxl/base/span.h"
#include "lib/jxl/base/status.h"
#include "lib/jxl/butteraugli/butteraugli.h"
#include "lib/jxl/color_encoding_internal.h"
#include "lib/jxl/enc_butteraugli_comparator.h"
#include "lib/jxl/enc_comparator.h"
#include "lib/jxl/enc_gamma_correct.h"
#include "lib/jxl/enc_image_bundle.h"
#include "lib/jxl/enc_xyb.h"
#include "lib/jxl/image.h"
#include "lib/jxl/image_bundle.h"
#include "lib/jxl/image_metadata.h"
#include "lib/jxl/image_ops.h"
#include "tools/file_io.h"
#include "tools/gauss_blur.h"
#include "tools/no_memory_manager.h"
#include "tools/ssimulacra2.h"
#include "tools/thread_pool_internal.h"

namespace {

using ::jpegxl::tools::ThreadPoolInternal;
using ::jxl::ButteraugliParams;
using ::jxl::CodecInOut;
using ::jxl::ColorEncoding;
using ::jxl::Image3F;
using ::jxl::ImageBundle;
using ::jxl::ImageF;
using ::jxl::ImageMetadata;
using ::jxl::JxlButteraugliComparator;
using ::jxl::Status;
using ::jxl::StatusOr;

const float kC2 = 0.0009f;
const int kNumScales = 6;

class FastBlur {
 public:
  static StatusOr<FastBlur> Create(const size_t xsize, const size_t ysize) {
    JxlMemoryManager* memory_manager = jpegxl::tools::NoMemoryManager();
    FastBlur result;
    JXL_ASSIGN_OR_RETURN(result.temp_,
                         ImageF::Create(memory_manager, xsize, ysize));
    return result;
  }

  Status BlurPlane(const ImageF& in, ImageF* JXL_RESTRICT out) {
    JXL_RETURN_IF_ERROR(jxl::FastGaussian(
        in.memory_manager(), rg_, in.xsize(), in.ysize(),
        [&](size_t y) { return in.ConstRow(y); },
        [&](size_t y) { return temp_.Row(y); },
        [&](size_t y) { return out->Row(y); }));
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

  Status ShrinkTo(const size_t xsize, const size_t ysize) {
    return temp_.ShrinkTo(xsize, ysize);
  }

 private:
  FastBlur() : rg_(jxl::CreateRecursiveGaussian(1.5)) {}
  jxl::RecursiveGaussian rg_;
  ImageF temp_;
};

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

inline double quartic(double x) {
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
        float num_m = 1.0f - (mu1 - mu2) * (mu1 - mu2);
        float num_s = 2 * (row_s12[x] - mu12) + kC2;
        float denom_s = (row_s11[x] - mu11) + (row_s22[x] - mu22) + kC2;
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
        double artifact = std::max(d1, 0.0);
        sum1[0] += artifact;
        sum1[1] += quartic(artifact);
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

bool HasValidAlpha(const ImageBundle& ib) {
  return ib.HasAlpha() && !ib.extra_channels().empty();
}

void AlphaBlendSrgb(ImageBundle& img, float bg) {
  if (!HasValidAlpha(img)) return;
  if (bg < 0.0f) {
    img.ClearExtraChannels();
    return;
  }
  const ImageF* a_plane = img.alpha();
  for (size_t y = 0; y < img.ysize(); ++y) {
    float* JXL_RESTRICT r = img.color()->PlaneRow(0, y);
    float* JXL_RESTRICT g = img.color()->PlaneRow(1, y);
    float* JXL_RESTRICT b = img.color()->PlaneRow(2, y);
    const float* JXL_RESTRICT a = a_plane->ConstRow(y);
    for (size_t x = 0; x < img.xsize(); ++x) {
      const float alpha = a[x];
      r[x] = alpha * r[x] + (1.f - alpha) * bg;
      g[x] = alpha * g[x] + (1.f - alpha) * bg;
      b[x] = alpha * b[x] + (1.f - alpha) * bg;
    }
  }
  img.ClearExtraChannels();
}

bool HasNonOpaqueAlpha(const ImageBundle& ib) {
  if (!HasValidAlpha(ib)) return false;
  const ImageF* alpha = ib.alpha();
  for (size_t y = 0; y < ib.ysize(); ++y) {
    const float* JXL_RESTRICT row = alpha->ConstRow(y);
    for (size_t x = 0; x < ib.xsize(); ++x) {
      if (row[x] < 0.999f) return true;
    }
  }
  return false;
}

Status ToXYB(const ImageBundle& in, Image3F* JXL_RESTRICT xyb,
             jxl::ThreadPool* pool) {
  JxlMemoryManager* memory_manager = in.memory_manager();
  JXL_ASSIGN_OR_RETURN(*xyb,
                       Image3F::Create(memory_manager, in.xsize(), in.ysize()));
  JXL_RETURN_IF_ERROR(CopyImageTo(in.color(), xyb));
  JXL_RETURN_IF_ERROR(jxl::ToXYB(in.c_current(), in.metadata()->IntensityTarget(),
                                 in.black(), pool, xyb, *JxlGetDefaultCms(),
                                 nullptr));
  return true;
}

struct Ssimulacra2ScaleRef {
  size_t w = 0;
  size_t h = 0;
  Image3F img1;
  Image3F mu1;
  Image3F sigma1_sq;
};

struct PrecomputedBlendRef {
  float bg = -1.0f;
  Image3F srgb;
  Image3F srgb_mu1;
  Image3F srgb_sigma1_sq;
  std::unique_ptr<JxlButteraugliComparator> ba_comparator;
  std::vector<Ssimulacra2ScaleRef> ssim2_scales;

  Status Init(const ImageBundle& orig_raw, float bg_val,
              float intensity_target, jxl::ThreadPool* pool) {
    bg = bg_val;
    JxlMemoryManager* mm = jpegxl::tools::NoMemoryManager();
    const JxlCmsInterface& cms = *JxlGetDefaultCms();

    JXL_ASSIGN_OR_RETURN(ImageBundle work, orig_raw.Copy());
    if (HasValidAlpha(work)) {
      AlphaBlendSrgb(work, bg);
    }

    // 1. Nonlinear sRGB copy for PSNR / SSIM
    JXL_ASSIGN_OR_RETURN(ImageBundle srgb_ib, work.Copy());
    if (!srgb_ib.c_current().SameColorEncoding(
            ColorEncoding::SRGB(/*is_gray=*/false))) {
      JXL_RETURN_IF_ERROR(srgb_ib.TransformTo(
          ColorEncoding::SRGB(/*is_gray=*/false), cms, pool));
    }
    JXL_ASSIGN_OR_RETURN(srgb,
                         Image3F::Create(mm, srgb_ib.xsize(), srgb_ib.ysize()));
    JXL_RETURN_IF_ERROR(CopyImageTo(*srgb_ib.color(), &srgb));

    JXL_ASSIGN_OR_RETURN(FastBlur srgb_blur,
                         FastBlur::Create(srgb.xsize(), srgb.ysize()));
    JXL_ASSIGN_OR_RETURN(srgb_mu1, srgb_blur(srgb));
    JXL_ASSIGN_OR_RETURN(Image3F srgb_mul,
                         Image3F::Create(mm, srgb.xsize(), srgb.ysize()));
    Multiply(srgb, srgb, &srgb_mul);
    JXL_ASSIGN_OR_RETURN(srgb_sigma1_sq, srgb_blur(srgb_mul));

    // 2. Linear sRGB for Butteraugli & SSIMULACRA2
    JXL_RETURN_IF_ERROR(work.TransformTo(
        ColorEncoding::LinearSRGB(work.IsGray()), cms, pool));

    ButteraugliParams ba_params;
    ba_params.hf_asymmetry = 1.0f;
    ba_params.xmul = 1.0f;
    ba_params.intensity_target = intensity_target;
    ba_comparator = jxl::make_unique<JxlButteraugliComparator>(ba_params, cms);
    JXL_RETURN_IF_ERROR(ba_comparator->SetReferenceImage(work));

    // 3. Precompute SSIMULACRA2 6-scale XYB pyramid
    ssim2_scales.clear();
    JXL_ASSIGN_OR_RETURN(ImageBundle pyr_ib, work.Copy());
    JXL_ASSIGN_OR_RETURN(FastBlur blur,
                         FastBlur::Create(pyr_ib.xsize(), pyr_ib.ysize()));
    JXL_ASSIGN_OR_RETURN(Image3F mul,
                         Image3F::Create(mm, pyr_ib.xsize(), pyr_ib.ysize()));

    for (int scale = 0; scale < kNumScales; ++scale) {
      if (pyr_ib.xsize() < 8 || pyr_ib.ysize() < 8) break;
      if (scale > 0) {
        JXL_ASSIGN_OR_RETURN(Image3F down, Downsample(*pyr_ib.color(), 2, 2));
        JXL_RETURN_IF_ERROR(pyr_ib.SetFromImage(
            std::move(down), ColorEncoding::LinearSRGB(pyr_ib.IsGray())));
      }
      const size_t sw = pyr_ib.xsize();
      const size_t sh = pyr_ib.ysize();
      Ssimulacra2ScaleRef sref;
      sref.w = sw;
      sref.h = sh;
      JXL_RETURN_IF_ERROR(ToXYB(pyr_ib, &sref.img1, pool));
      MakePositiveXYB(sref.img1);

      JXL_RETURN_IF_ERROR(mul.ShrinkTo(sw, sh));
      JXL_RETURN_IF_ERROR(blur.ShrinkTo(sw, sh));
      Multiply(sref.img1, sref.img1, &mul);
      JXL_ASSIGN_OR_RETURN(sref.sigma1_sq, blur(mul));
      JXL_ASSIGN_OR_RETURN(sref.mu1, blur(sref.img1));
      ssim2_scales.push_back(std::move(sref));
    }

    return true;
  }

  Status EvalAll(const ImageBundle& dist_raw, jxl::ThreadPool* pool,
                 double* out_psnr, double* out_ssim, double* out_ssimulacra2,
                 float* out_butteraugli, bool* out_is_exact) const {
    JxlMemoryManager* mm = jpegxl::tools::NoMemoryManager();
    const JxlCmsInterface& cms = *JxlGetDefaultCms();

    JXL_ASSIGN_OR_RETURN(ImageBundle dist_srgb, dist_raw.Copy());
    if (HasValidAlpha(dist_srgb)) {
      AlphaBlendSrgb(dist_srgb, bg);
    }
    if (!dist_srgb.c_current().SameColorEncoding(
            ColorEncoding::SRGB(/*is_gray=*/false))) {
      JXL_RETURN_IF_ERROR(dist_srgb.TransformTo(
          ColorEncoding::SRGB(/*is_gray=*/false), cms, pool));
    }

    const Image3F& c2 = *dist_srgb.color();
    const size_t w = srgb.xsize();
    const size_t h = srgb.ysize();

    double sse = 0.0;
    float max_diff = 0.0f;
    for (size_t c = 0; c < 3; ++c) {
      for (size_t y = 0; y < h; ++y) {
        const float* JXL_RESTRICT r1 = srgb.ConstPlaneRow(c, y);
        const float* JXL_RESTRICT r2 = c2.ConstPlaneRow(c, y);
        for (size_t x = 0; x < w; ++x) {
          const float d = r1[x] - r2[x];
          const float ad = std::abs(d);
          if (ad > max_diff) max_diff = ad;
          sse += static_cast<double>(d) * static_cast<double>(d);
        }
      }
    }

    const double mse = sse / static_cast<double>(w * h * 3);
    if (max_diff < 1e-5f || mse <= 1e-12) {
      *out_is_exact = true;
      *out_psnr = 100.0;
      *out_ssim = 1.0;
      *out_ssimulacra2 = 100.0;
      *out_butteraugli = 0.0f;
      return true;
    }
    *out_is_exact = false;
    *out_psnr = std::min(100.0, -10.0 * std::log10(mse));

    JXL_ASSIGN_OR_RETURN(FastBlur blur, FastBlur::Create(w, h));
    JXL_ASSIGN_OR_RETURN(Image3F mu2, blur(c2));
    JXL_ASSIGN_OR_RETURN(Image3F mul, Image3F::Create(mm, w, h));

    Multiply(c2, c2, &mul);
    JXL_ASSIGN_OR_RETURN(Image3F sigma2_sq, blur(mul));

    Multiply(srgb, c2, &mul);
    JXL_ASSIGN_OR_RETURN(Image3F sigma12, blur(mul));

    constexpr float kSsimC1 = 0.01f * 0.01f;
    constexpr float kSsimC2 = 0.03f * 0.03f;
    double ssim_sum = 0.0;
    for (size_t c = 0; c < 3; ++c) {
      double plane_sum = 0.0;
      for (size_t y = 0; y < h; ++y) {
        const float* JXL_RESTRICT rm1 = srgb_mu1.ConstPlaneRow(c, y);
        const float* JXL_RESTRICT rm2 = mu2.ConstPlaneRow(c, y);
        const float* JXL_RESTRICT rs11 = srgb_sigma1_sq.ConstPlaneRow(c, y);
        const float* JXL_RESTRICT rs22 = sigma2_sq.ConstPlaneRow(c, y);
        const float* JXL_RESTRICT rs12 = sigma12.ConstPlaneRow(c, y);
        for (size_t x = 0; x < w; ++x) {
          const float m1 = rm1[x];
          const float m2 = rm2[x];
          const float m11 = m1 * m1;
          const float m22 = m2 * m2;
          const float m12 = m1 * m2;
          const float s11 = std::max(0.0f, rs11[x] - m11);
          const float s22 = std::max(0.0f, rs22[x] - m22);
          const float s12 = rs12[x] - m12;
          const float num = (2.0f * m12 + kSsimC1) * (2.0f * s12 + kSsimC2);
          const float den = (m11 + m22 + kSsimC1) * (s11 + s22 + kSsimC2);
          plane_sum += static_cast<double>(num / den);
        }
      }
      ssim_sum += plane_sum / static_cast<double>(w * h);
    }
    *out_ssim = std::clamp(ssim_sum / 3.0, 0.0, 1.0);

    // Transform once to Linear sRGB and share between Butteraugli and SSIMULACRA2
    JXL_ASSIGN_OR_RETURN(ImageBundle dist_lin, dist_raw.Copy());
    if (HasValidAlpha(dist_lin)) {
      AlphaBlendSrgb(dist_lin, bg);
    }
    JXL_RETURN_IF_ERROR(dist_lin.TransformTo(
        ColorEncoding::LinearSRGB(dist_lin.IsGray()), cms, pool));

    // Butteraugli
    ImageF distmap;
    JXL_RETURN_IF_ERROR(
        ba_comparator->CompareWith(dist_lin, &distmap, out_butteraugli));

    // SSIMULACRA2 (reusing blur & mul buffers)
    JXL_ASSIGN_OR_RETURN(Image3F img2, Image3F::Create(mm, w, h));
    Msssim msssim;
    for (size_t scale = 0; scale < ssim2_scales.size(); ++scale) {
      const Ssimulacra2ScaleRef& sref = ssim2_scales[scale];
      if (scale > 0) {
        JXL_ASSIGN_OR_RETURN(Image3F down, Downsample(*dist_lin.color(), 2, 2));
        JXL_RETURN_IF_ERROR(dist_lin.SetFromImage(
            std::move(down), ColorEncoding::LinearSRGB(dist_lin.IsGray())));
        JXL_RETURN_IF_ERROR(img2.ShrinkTo(sref.w, sref.h));
      }
      JXL_RETURN_IF_ERROR(ToXYB(dist_lin, &img2, pool));
      MakePositiveXYB(img2);

      JXL_RETURN_IF_ERROR(mul.ShrinkTo(sref.w, sref.h));
      JXL_RETURN_IF_ERROR(blur.ShrinkTo(sref.w, sref.h));

      Multiply(img2, img2, &mul);
      JXL_ASSIGN_OR_RETURN(Image3F s22, blur(mul));

      Multiply(sref.img1, img2, &mul);
      JXL_ASSIGN_OR_RETURN(Image3F s12, blur(mul));

      JXL_ASSIGN_OR_RETURN(Image3F m2, blur(img2));

      MsssimScale sscale;
      SSIMMap(sref.mu1, m2, sref.sigma1_sq, s22, s12, sscale.avg_ssim);
      EdgeDiffMap(sref.img1, sref.mu1, img2, m2, sscale.avg_edgediff);
      msssim.scales.push_back(sscale);
    }
    *out_ssimulacra2 = msssim.Score();
    return true;
  }
};

struct ReferenceContext {
  std::unique_ptr<CodecInOut> ref_io;
  size_t width = 0;
  size_t height = 0;
  bool has_real_alpha = false;
  float intensity_target = 80.0f;

  PrecomputedBlendRef ref_noalpha;
  PrecomputedBlendRef ref_dark;
  PrecomputedBlendRef ref_bright;

  Status Load(const std::string& path, jxl::ThreadPool* pool) {
    JxlMemoryManager* mm = jpegxl::tools::NoMemoryManager();
    std::vector<uint8_t> encoded;
    if (!jpegxl::tools::ReadFile(path, &encoded)) {
      return JXL_FAILURE("Could not read reference file");
    }
    ref_io = jxl::make_unique<CodecInOut>(mm);
    if (!jxl::SetFromBytes(jxl::Bytes(encoded), jxl::extras::ColorHints(),
                           ref_io.get(), pool)) {
      return JXL_FAILURE("Could not decode reference image");
    }
    width = ref_io->xsize();
    height = ref_io->ysize();
    if (width < 8 || height < 8) {
      return JXL_FAILURE("Image smaller than 8x8");
    }

    const auto& tf = ref_io->Main().c_current().Tf();
    intensity_target =
        (tf.IsPQ() || tf.IsHLG()) ? ref_io->metadata.m.IntensityTarget() : 80.0f;

    has_real_alpha = HasNonOpaqueAlpha(ref_io->Main());

    JXL_RETURN_IF_ERROR(
        ref_noalpha.Init(ref_io->Main(), -1.0f, intensity_target, pool));
    if (has_real_alpha) {
      JXL_RETURN_IF_ERROR(
          ref_dark.Init(ref_io->Main(), 0.1f, intensity_target, pool));
      JXL_RETURN_IF_ERROR(
          ref_bright.Init(ref_io->Main(), 0.9f, intensity_target, pool));
    }
    return true;
  }

  Status Evaluate(const std::string& dist_path, jxl::ThreadPool* pool,
                  double* out_ssimulacra2, double* out_butteraugli,
                  double* out_psnr, double* out_ssim,
                  bool* out_lossless) const {
    JxlMemoryManager* mm = jpegxl::tools::NoMemoryManager();
    std::vector<uint8_t> encoded;
    if (!jpegxl::tools::ReadFile(dist_path, &encoded)) {
      return JXL_FAILURE("Could not read distorted file");
    }
    auto io = jxl::make_unique<CodecInOut>(mm);
    if (!jxl::SetFromBytes(jxl::Bytes(encoded), jxl::extras::ColorHints(),
                           io.get(), pool)) {
      return JXL_FAILURE("Could not decode distorted image");
    }
    if (io->xsize() != width || io->ysize() != height) {
      return JXL_FAILURE("Image dimension mismatch");
    }

    const bool dist_has_alpha = HasValidAlpha(io->Main());

    if (!has_real_alpha || !dist_has_alpha) {
      bool is_exact = false;
      float ba = 0.0f;
      JXL_RETURN_IF_ERROR(ref_noalpha.EvalAll(io->Main(), pool, out_psnr,
                                              out_ssim, out_ssimulacra2, &ba,
                                              &is_exact));
      *out_butteraugli = static_cast<double>(ba);
      *out_lossless = is_exact;
      return true;
    } else {
      double psnr_dark = 0, ssim_dark = 0, s2_dark = 0;
      double psnr_bright = 0, ssim_bright = 0, s2_bright = 0;
      float ba_dark = 0.0f, ba_bright = 0.0f;
      bool exact_dark = false, exact_bright = false;
      JXL_RETURN_IF_ERROR(ref_dark.EvalAll(io->Main(), pool, &psnr_dark,
                                           &ssim_dark, &s2_dark, &ba_dark,
                                           &exact_dark));
      JXL_RETURN_IF_ERROR(ref_bright.EvalAll(io->Main(), pool, &psnr_bright,
                                             &ssim_bright, &s2_bright,
                                             &ba_bright, &exact_bright));
      *out_psnr = std::min(psnr_dark, psnr_bright);
      *out_ssim = std::min(ssim_dark, ssim_bright);
      *out_ssimulacra2 = std::min(s2_dark, s2_bright);
      *out_butteraugli = static_cast<double>(std::max(ba_dark, ba_bright));
      *out_lossless = exact_dark && exact_bright;
      return true;
    }
  }
};

}  // namespace

int main(int argc, char** argv) {
  int num_threads = 2;
  bool worker_mode = false;
  std::vector<std::string> positional;

  for (int i = 1; i < argc; ++i) {
    std::string arg = argv[i];
    if (arg == "--worker") {
      worker_mode = true;
    } else if (arg == "--threads" && i + 1 < argc) {
      num_threads = std::max(1, std::atoi(argv[++i]));
    } else {
      positional.push_back(arg);
    }
  }

  ThreadPoolInternal pool(num_threads);

  if (worker_mode) {
    ReferenceContext ctx;
    bool has_ref = false;
    std::string line;
    while (std::getline(std::cin, line)) {
      if (line.empty()) continue;
      if (line == "QUIT" || line == "EXIT") break;
      const size_t tab = line.find('\t');
      if (tab == std::string::npos) {
        printf("{\"ok\":false,\"error\":\"Malformed command\"}\n");
        fflush(stdout);
        continue;
      }
      const std::string cmd = line.substr(0, tab);
      const std::string path = line.substr(tab + 1);
      if (cmd == "REF") {
        if (ctx.Load(path, pool.get())) {
          has_ref = true;
          printf("{\"ok\":true,\"width\":%zu,\"height\":%zu,\"has_alpha\":%s}\n",
                 ctx.width, ctx.height,
                 ctx.has_real_alpha ? "true" : "false");
        } else {
          has_ref = false;
          printf("{\"ok\":false,\"error\":\"Failed to load reference\"}\n");
        }
        fflush(stdout);
      } else if (cmd == "EVAL") {
        if (!has_ref) {
          printf("{\"ok\":false,\"error\":\"No reference loaded\"}\n");
          fflush(stdout);
          continue;
        }
        double s2 = 0, ba = 0, psnr = 0, ssim = 0;
        bool lossless = false;
        if (ctx.Evaluate(path, pool.get(), &s2, &ba, &psnr, &ssim,
                         &lossless)) {
          printf("{\"ok\":true,\"ssimulacra2\":%.6f,\"butteraugli\":%.6f,\"psnr\":%.4f,\"ssim\":%.6f,\"lossless\":%s}\n",
                 s2, ba, psnr, ssim, lossless ? "true" : "false");
        } else {
          printf("{\"ok\":false,\"error\":\"Failed to evaluate distorted image\"}\n");
        }
        fflush(stdout);
      } else {
        printf("{\"ok\":false,\"error\":\"Unknown command\"}\n");
        fflush(stdout);
      }
    }
    return EXIT_SUCCESS;
  }

  if (positional.size() != 2) {
    fprintf(stderr,
            "Usage:\n"
            "  %s <reference> <distorted> [--threads N]\n"
            "  %s --worker [--threads N]\n",
            argv[0], argv[0]);
    return EXIT_FAILURE;
  }

  ReferenceContext ctx;
  if (!ctx.Load(positional[0], pool.get())) {
    fprintf(stderr, "Failed to load reference image: %s\n",
            positional[0].c_str());
    return EXIT_FAILURE;
  }
  double s2 = 0, ba = 0, psnr = 0, ssim = 0;
  bool lossless = false;
  if (!ctx.Evaluate(positional[1], pool.get(), &s2, &ba, &psnr, &ssim,
                    &lossless)) {
    fprintf(stderr, "Failed to evaluate distorted image: %s\n",
            positional[1].c_str());
    return EXIT_FAILURE;
  }
  printf("{\"ssimulacra2\":%.6f,\"butteraugli\":%.6f,\"psnr\":%.4f,\"ssim\":%.6f,\"lossless\":%s}\n",
         s2, ba, psnr, ssim, lossless ? "true" : "false");
  return EXIT_SUCCESS;
}
