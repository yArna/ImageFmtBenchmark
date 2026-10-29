// Copyright (c) the JPEG XL Project Authors.
//
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file or at
// https://developers.google.com/open-source/licenses/bsd

#include <stdint.h>
#include "/Users/yarna/Project/MoonvyRoot/products/Apps/ImageFmtBenchmark/encoder/src/bench_timing.h"
#include <stdio.h>
#include <stdlib.h>

#include <memory>
#include <string>
#include <vector>

#include "lib/base/printf_macros.h"
#include "lib/base/types.h"
#include "lib/extras/dec/jpegli.h"
#include "lib/extras/enc/encode.h"
#include "lib/extras/packed_image.h"
#include "lib/extras/time.h"
#include "tools/cmdline.h"
#include "tools/file_io.h"
#include "tools/speed_stats.h"

namespace jpegli_tools {
namespace {

struct Args {
  void AddCommandLineOptions(CommandLineParser* cmdline) {
    std::string output_help("The output can be ");
    output_help.append(jpegli::extras::ListOfEncodeCodecs());
    cmdline->AddPositionalOption("INPUT", /* required = */ true,
                                 "The JPEG input file.", &file_in);

    cmdline->AddPositionalOption("OUTPUT", /* required = */ true, output_help,
                                 &file_out);
    cmdline->AddOptionFlag('\0', "disable_output",
                           "No output file will be written (for benchmarking)",
                           &disable_output, &SetBooleanTrue);

    cmdline->AddOptionValue('\0', "bitdepth", "8|16",
                            "Sets the output bitdepth for integer based "
                            "formats, can be 8 (default) "
                            "or 16. Has no impact on PFM output.",
                            &bitdepth, &ParseUnsigned);

    cmdline->AddOptionValue('\0', "num_reps", "N",
                            "Sets the number of times to decompress the image. "
                            "Used for benchmarking, the default is 1.",
                            &num_reps, &ParseUnsigned);

    cmdline->AddOptionFlag('\0', "quiet", "Silence output (except for errors).",
                           &quiet, &SetBooleanTrue);
  }

  const char* file_in = nullptr;
  const char* file_out = nullptr;
  bool disable_output = false;
  size_t bitdepth = 8;
  size_t num_reps = 1;
  bool quiet = false;
};

bool ValidateArgs(const Args& args) {
  if (args.bitdepth != 8 && args.bitdepth != 16) {
    fprintf(stderr, "Invalid --bitdepth argument\n");
    return false;
  }
  return true;
}

void SetDecompressParams(const Args& args, const std::string& extension,
                         jpegli::extras::JpegDecompressParams* params) {
  if (extension == ".pfm") {
    params->output_data_type = JPEGLI_TYPE_FLOAT;
    params->output_endianness = JPEGLI_BIG_ENDIAN;
  } else if (args.bitdepth == 16) {
    params->output_data_type = JPEGLI_TYPE_UINT16;
    params->output_endianness = JPEGLI_BIG_ENDIAN;
  }
  if (extension == ".pgm") {
    params->force_grayscale = true;
  } else if (extension == ".ppm") {
    params->force_rgb = true;
  }
}

int DJpegliMain(int argc, const char* argv[]) {
  const double bench_t_total = bench_now_ms();
  double bench_read_ms = 0.0, bench_codec_ms = 0.0, bench_write_ms = 0.0;
  Args args;
  CommandLineParser cmdline;
  args.AddCommandLineOptions(&cmdline);

  if (!cmdline.Parse(argc, const_cast<const char**>(argv))) {
    // Parse already printed the actual error cause.
    fprintf(stderr, "Use '%s -h' for more information.\n", argv[0]);
    return EXIT_FAILURE;
  }

  if (cmdline.HelpFlagPassed() || !args.file_in) {
    cmdline.PrintHelp();
    return EXIT_SUCCESS;
  }

  if (!args.file_out && !args.disable_output) {
    fprintf(stderr,
            "No output file specified and --disable_output flag not passed.\n");
    return EXIT_FAILURE;
  }

  if (args.disable_output && !args.quiet) {
    fprintf(stderr,
            "Decoding will be performed, but the result will be discarded.\n");
  }

  if (!ValidateArgs(args)) {
    return EXIT_FAILURE;
  }

  const double bench_t_read0 = bench_now_ms();
  std::vector<uint8_t> jpeg_bytes;
  if (!ReadFile(args.file_in, &jpeg_bytes)) {
    fprintf(stderr, "Failed to read input image %s\n", args.file_in);
    return EXIT_FAILURE;
  }
  bench_read_ms = bench_now_ms() - bench_t_read0;

  if (!args.quiet) {
    fprintf(stderr, "Read %" PRIuS " compressed bytes.\n", jpeg_bytes.size());
  }

  std::string filename_out;
  std::string extension;
  if (args.file_out) {
    filename_out = std::string(args.file_out);
    size_t pos = filename_out.find_last_of('.');
    if (pos >= filename_out.size()) {
      fprintf(stderr, "Unrecognized output extension.\n");
      return EXIT_FAILURE;
    }
    extension = filename_out.substr(pos);
  }

  jpegli::extras::JpegDecompressParams dparams;
  SetDecompressParams(args, extension, &dparams);

  jpegli::extras::PackedPixelFile ppf;
  jpegli_tools::SpeedStats stats;
  const double bench_t_dec0 = bench_now_ms();
  for (size_t num_rep = 0; num_rep < args.num_reps; ++num_rep) {
    const double t0 = jpegli::Now();
    if (!jpegli::extras::DecodeJpeg(jpeg_bytes, dparams, nullptr, &ppf)) {
      fprintf(stderr, "jpegli decoding failed\n");
      return EXIT_FAILURE;
    }
    const double t1 = jpegli::Now();
    stats.NotifyElapsed(t1 - t0);
    stats.SetImageSize(ppf.info.xsize, ppf.info.ysize);
  }
  bench_codec_ms = (bench_now_ms() - bench_t_dec0) / (args.num_reps ? args.num_reps : 1);

  if (!args.quiet) {
    stats.Print(1);
  }

  if (args.disable_output) {
    bench_print_timing("djpegli", "decode", bench_read_ms, bench_codec_ms, 0.0,
                       bench_now_ms() - bench_t_total, jpeg_bytes.size(), 0);
    return EXIT_SUCCESS;
  }

  if (extension == ".pnm") {
    extension = ppf.info.num_color_channels == 3 ? ".ppm" : ".pgm";
  }

  std::unique_ptr<jpegli::extras::Encoder> encoder =
      jpegli::extras::Encoder::FromExtension(extension);
  if (encoder == nullptr) {
    fprintf(stderr, "Can't decode to the file extension '%s'\n",
            extension.c_str());
    return EXIT_FAILURE;
  }
  const double bench_t_write0 = bench_now_ms();
  jpegli::extras::EncodedImage encoded_image;
  if (!encoder->Encode(ppf, &encoded_image, nullptr) ||
      encoded_image.bitstreams.empty()) {
    fprintf(stderr, "Encode failed\n");
    return EXIT_FAILURE;
  }
  if (!WriteFile(filename_out, encoded_image.bitstreams[0])) {
    fprintf(stderr, "Failed to write output file %s\n", filename_out.c_str());
    return EXIT_FAILURE;
  }
  bench_write_ms = bench_now_ms() - bench_t_write0;
  bench_print_timing("djpegli", "decode", bench_read_ms, bench_codec_ms, bench_write_ms,
                     bench_now_ms() - bench_t_total, jpeg_bytes.size(),
                     encoded_image.bitstreams[0].size());

  return EXIT_SUCCESS;
}

}  // namespace
}  // namespace jpegli_tools

int main(int argc, const char* argv[]) {
  return jpegli_tools::DJpegliMain(argc, argv);
}
