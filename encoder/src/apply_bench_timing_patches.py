#!/usr/bin/env python3
import os
import subprocess

SRC = "/Users/yarna/Project/MoonvyRoot/products/Apps/ImageFmtBenchmark/encoder/src"
BENCH_H = '#include "/Users/yarna/Project/MoonvyRoot/products/Apps/ImageFmtBenchmark/encoder/src/bench_timing.h"\n'

def reset_git_file(repo_dir, rel_path):
    subprocess.run(["git", "-C", repo_dir, "checkout", "--", rel_path], check=True)

def replace_exact(path, replacements):
    with open(path, "r", encoding="utf-8") as f:
        s = f.read()
    for old, new in replacements:
        if old not in s:
            raise RuntimeError(f"Pattern not found in {path}:\n{old[:200]}")
        s = s.replace(old, new)
    with open(path, "w", encoding="utf-8") as f:
        f.write(s)
    print(f"[OK] Patched {path}")

# -------------------------------------------------------------------------
# 1. libwebp: cwebp.c & dwebp.c
# -------------------------------------------------------------------------
reset_git_file(f"{SRC}/libwebp", "examples/cwebp.c")
replace_exact(f"{SRC}/libwebp/examples/cwebp.c", [
    ('#include <assert.h>\n', '#include <assert.h>\n' + BENCH_H),
    ('  Stopwatch stop_watch;\n',
     '  Stopwatch stop_watch;\n  const double bench_t_total = bench_now_ms();\n  double bench_read_ms = 0.0, bench_codec_ms = 0.0, bench_write_ms = 0.0;\n'),
    ('''  if (verbose) {
    StopwatchReset(&stop_watch);
  }
  if (!ReadPicture(in_file, &picture, keep_alpha,
                   (keep_metadata == 0) ? NULL : &metadata)) {
    WFPRINTF(stderr, "Error! Cannot read input picture file '%s'\\n",
             (const W_CHAR*)in_file);
    goto Error;
  }
  picture.progress_hook = (show_progress && !quiet) ? ProgressReport : NULL;

  if (blend_alpha) {
    WebPBlendAlpha(&picture, background_color);
  }''',
     '''  if (verbose) {
    StopwatchReset(&stop_watch);
  }
  {
    const double bench_t0 = bench_now_ms();
    if (!ReadPicture(in_file, &picture, keep_alpha,
                     (keep_metadata == 0) ? NULL : &metadata)) {
      WFPRINTF(stderr, "Error! Cannot read input picture file '%s'\\n",
               (const W_CHAR*)in_file);
      goto Error;
    }
    picture.progress_hook = (show_progress && !quiet) ? ProgressReport : NULL;

    if (blend_alpha) {
      WebPBlendAlpha(&picture, background_color);
    }
    bench_read_ms = bench_now_ms() - bench_t0;
  }'''),
    ('''  use_memory_writer = (out_file != NULL && keep_metadata) ||
                      (!quiet && print_distortion >= 0 && config.lossless &&
                       config.near_lossless < 100);''',
     '''  use_memory_writer = (out_file != NULL) ||
                      (!quiet && print_distortion >= 0 && config.lossless &&
                       config.near_lossless < 100);'''),
    ('''  if (!WebPEncode(&config, &picture)) {
    fprintf(stderr, "Error! Cannot encode picture as WebP\\n");
    fprintf(stderr, "Error code: %d (%s)\\n", picture.error_code,
            kErrorMessages[picture.error_code]);
    goto Error;
  }''',
     '''  {
    const double bench_t0 = bench_now_ms();
    bench_read_ms = bench_t0 - bench_t_total;
    if (!WebPEncode(&config, &picture)) {
      fprintf(stderr, "Error! Cannot encode picture as WebP\\n");
      fprintf(stderr, "Error code: %d (%s)\\n", picture.error_code,
              kErrorMessages[picture.error_code]);
      goto Error;
    }
    bench_codec_ms = bench_now_ms() - bench_t0;
  }'''),
    ('''  if (use_memory_writer && out != NULL &&
      !WriteWebPWithMetadata(out, &picture, &memory_writer, &metadata,
                             keep_metadata, &metadata_written)) {
    fprintf(stderr, "Error writing WebP file!\\n");
    goto Error;
  }''',
     '''  if (use_memory_writer && out != NULL) {
    const double bench_t0 = bench_now_ms();
    if (!WriteWebPWithMetadata(out, &picture, &memory_writer, &metadata,
                               keep_metadata, &metadata_written)) {
      fprintf(stderr, "Error writing WebP file!\\n");
      goto Error;
    }
    fflush(out);
    bench_write_ms = bench_now_ms() - bench_t0;
  }'''),
    ('''  return_value = EXIT_SUCCESS;

Error:''',
     '''  return_value = EXIT_SUCCESS;
  bench_print_timing("cwebp", "encode", bench_read_ms, bench_codec_ms, bench_write_ms,
                     bench_now_ms() - bench_t_total,
                     bench_file_size((const char*)in_file),
                     memory_writer.size > 0 ? memory_writer.size : bench_file_size((const char*)out_file));

Error:''')
])

reset_git_file(f"{SRC}/libwebp", "examples/dwebp.c")
replace_exact(f"{SRC}/libwebp/examples/dwebp.c", [
    ('#include <assert.h>\n', '#include <assert.h>\n' + BENCH_H),
    ('  WebPDecoderConfig config;\n',
     '  WebPDecoderConfig config;\n  const double bench_t_total = bench_now_ms();\n  double bench_read_ms = 0.0, bench_codec_ms = 0.0, bench_write_ms = 0.0;\n  size_t bench_in_bytes = 0;\n'),
    ('''    if (!LoadWebP(in_file, &data, &data_size, bitstream)) {
      FREE_WARGV_AND_RETURN(EXIT_FAILURE);
    }''',
     '''    {
      const double bench_t0 = bench_now_ms();
      if (!LoadWebP(in_file, &data, &data_size, bitstream)) {
        FREE_WARGV_AND_RETURN(EXIT_FAILURE);
      }
      bench_read_ms = bench_now_ms() - bench_t0;
      bench_in_bytes = data_size;
    }'''),
    ('''      if (incremental) {
        status = DecodeWebPIncremental(data, data_size, &config);
      } else {
        status = DecodeWebP(data, data_size, &config);
      }''',
     '''      {
        const double bench_t0 = bench_now_ms();
        if (incremental) {
          status = DecodeWebPIncremental(data, data_size, &config);
        } else {
          status = DecodeWebP(data, data_size, &config);
        }
        bench_codec_ms = bench_now_ms() - bench_t0;
      }'''),
    ('''    ok = SaveOutput(output_buffer, format, out_file);
  } else {''',
     '''    {
      const double bench_t0 = bench_now_ms();
      ok = SaveOutput(output_buffer, format, out_file);
      bench_write_ms = bench_now_ms() - bench_t0;
    }
  } else {'''),
    ('''Exit:
  WebPFreeDecBuffer(output_buffer);''',
     '''  if (ok) {
    bench_print_timing("dwebp", "decode", bench_read_ms, bench_codec_ms, bench_write_ms,
                       bench_now_ms() - bench_t_total, bench_in_bytes,
                       bench_file_size((const char*)out_file));
  }
Exit:
  WebPFreeDecBuffer(output_buffer);''')
])

# -------------------------------------------------------------------------
# 2. Jpegli: cjpegli.cc & djpegli.cc
# -------------------------------------------------------------------------
reset_git_file(f"{SRC}/jpegli", "tools/cjpegli.cc")
replace_exact(f"{SRC}/jpegli/tools/cjpegli.cc", [
    ('#include <stdint.h>\n', '#include <stdint.h>\n' + BENCH_H),
    ('int CJpegliMain(int argc, const char* argv[]) {\n',
     'int CJpegliMain(int argc, const char* argv[]) {\n  const double bench_t_total = bench_now_ms();\n  double bench_read_ms = 0.0, bench_codec_ms = 0.0, bench_write_ms = 0.0;\n'),
    ('''  std::vector<uint8_t> input_bytes;
  if (!ReadFile(args.file_in, &input_bytes)) {
    fprintf(stderr, "Failed to read input image %s\\n", args.file_in);
    return EXIT_FAILURE;
  }

  jpegli::extras::PackedPixelFile ppf;
  if (!jpegli::extras::DecodeBytes(jpegli::Bytes(input_bytes),
                                   args.color_hints_proxy.target, &ppf)) {
    fprintf(stderr, "Failed to decode input image %s\\n", args.file_in);
    return EXIT_FAILURE;
  }''',
     '''  const double bench_t_read0 = bench_now_ms();
  std::vector<uint8_t> input_bytes;
  if (!ReadFile(args.file_in, &input_bytes)) {
    fprintf(stderr, "Failed to read input image %s\\n", args.file_in);
    return EXIT_FAILURE;
  }

  jpegli::extras::PackedPixelFile ppf;
  if (!jpegli::extras::DecodeBytes(jpegli::Bytes(input_bytes),
                                   args.color_hints_proxy.target, &ppf)) {
    fprintf(stderr, "Failed to decode input image %s\\n", args.file_in);
    return EXIT_FAILURE;
  }
  bench_read_ms = bench_now_ms() - bench_t_read0;'''),
    ('''  for (size_t num_rep = 0; num_rep < args.num_reps; ++num_rep) {
    const double t0 = jpegli::Now();
    if (!jpegli::extras::EncodeJpeg(ppf, args.settings, nullptr, &jpeg_bytes)) {
      fprintf(stderr, "jpegli encoding failed\\n");
      return EXIT_FAILURE;
    }
    const double t1 = jpegli::Now();
    stats.NotifyElapsed(t1 - t0);
    stats.SetImageSize(ppf.info.xsize, ppf.info.ysize);
  }

  if (args.file_out && !args.disable_output) {
    if (!WriteFile(args.file_out, jpeg_bytes)) {
      fprintf(stderr, "Could not write jpeg to %s\\n", args.file_out);
      return EXIT_FAILURE;
    }
  }''',
     '''  const double bench_t_enc0 = bench_now_ms();
  bench_read_ms = bench_t_enc0 - bench_t_total;
  for (size_t num_rep = 0; num_rep < args.num_reps; ++num_rep) {
    const double t0 = jpegli::Now();
    if (!jpegli::extras::EncodeJpeg(ppf, args.settings, nullptr, &jpeg_bytes)) {
      fprintf(stderr, "jpegli encoding failed\\n");
      return EXIT_FAILURE;
    }
    const double t1 = jpegli::Now();
    stats.NotifyElapsed(t1 - t0);
    stats.SetImageSize(ppf.info.xsize, ppf.info.ysize);
  }
  bench_codec_ms = (bench_now_ms() - bench_t_enc0) / (args.num_reps ? args.num_reps : 1);

  if (args.file_out && !args.disable_output) {
    const double bench_t_write0 = bench_now_ms();
    if (!WriteFile(args.file_out, jpeg_bytes)) {
      fprintf(stderr, "Could not write jpeg to %s\\n", args.file_out);
      return EXIT_FAILURE;
    }
    bench_write_ms = bench_now_ms() - bench_t_write0;
  }'''),
    ('''  return EXIT_SUCCESS;
}

}  // namespace''',
     '''  bench_print_timing("cjpegli", "encode", bench_read_ms, bench_codec_ms, bench_write_ms,
                     bench_now_ms() - bench_t_total, input_bytes.size(), jpeg_bytes.size());
  return EXIT_SUCCESS;
}

}  // namespace''')
])

reset_git_file(f"{SRC}/jpegli", "tools/djpegli.cc")
replace_exact(f"{SRC}/jpegli/tools/djpegli.cc", [
    ('#include <stdint.h>\n', '#include <stdint.h>\n' + BENCH_H),
    ('int DJpegliMain(int argc, const char* argv[]) {\n',
     'int DJpegliMain(int argc, const char* argv[]) {\n  const double bench_t_total = bench_now_ms();\n  double bench_read_ms = 0.0, bench_codec_ms = 0.0, bench_write_ms = 0.0;\n'),
    ('''  std::vector<uint8_t> jpeg_bytes;
  if (!ReadFile(args.file_in, &jpeg_bytes)) {
    fprintf(stderr, "Failed to read input image %s\\n", args.file_in);
    return EXIT_FAILURE;
  }''',
     '''  const double bench_t_read0 = bench_now_ms();
  std::vector<uint8_t> jpeg_bytes;
  if (!ReadFile(args.file_in, &jpeg_bytes)) {
    fprintf(stderr, "Failed to read input image %s\\n", args.file_in);
    return EXIT_FAILURE;
  }
  bench_read_ms = bench_now_ms() - bench_t_read0;'''),
    ('''  for (size_t num_rep = 0; num_rep < args.num_reps; ++num_rep) {
    const double t0 = jpegli::Now();
    if (!jpegli::extras::DecodeJpeg(jpeg_bytes, dparams, nullptr, &ppf)) {
      fprintf(stderr, "jpegli decoding failed\\n");
      return EXIT_FAILURE;
    }
    const double t1 = jpegli::Now();
    stats.NotifyElapsed(t1 - t0);
    stats.SetImageSize(ppf.info.xsize, ppf.info.ysize);
  }''',
     '''  const double bench_t_dec0 = bench_now_ms();
  for (size_t num_rep = 0; num_rep < args.num_reps; ++num_rep) {
    const double t0 = jpegli::Now();
    if (!jpegli::extras::DecodeJpeg(jpeg_bytes, dparams, nullptr, &ppf)) {
      fprintf(stderr, "jpegli decoding failed\\n");
      return EXIT_FAILURE;
    }
    const double t1 = jpegli::Now();
    stats.NotifyElapsed(t1 - t0);
    stats.SetImageSize(ppf.info.xsize, ppf.info.ysize);
  }
  bench_codec_ms = (bench_now_ms() - bench_t_dec0) / (args.num_reps ? args.num_reps : 1);'''),
    ('''  if (args.disable_output) {
    return EXIT_SUCCESS;
  }''',
     '''  if (args.disable_output) {
    bench_print_timing("djpegli", "decode", bench_read_ms, bench_codec_ms, 0.0,
                       bench_now_ms() - bench_t_total, jpeg_bytes.size(), 0);
    return EXIT_SUCCESS;
  }'''),
    ('''  jpegli::extras::EncodedImage encoded_image;
  if (!encoder->Encode(ppf, &encoded_image, nullptr) ||
      encoded_image.bitstreams.empty()) {
    fprintf(stderr, "Encode failed\\n");
    return EXIT_FAILURE;
  }
  if (!WriteFile(filename_out, encoded_image.bitstreams[0])) {
    fprintf(stderr, "Failed to write output file %s\\n", filename_out.c_str());
    return EXIT_FAILURE;
  }

  return EXIT_SUCCESS;''',
     '''  const double bench_t_write0 = bench_now_ms();
  jpegli::extras::EncodedImage encoded_image;
  if (!encoder->Encode(ppf, &encoded_image, nullptr) ||
      encoded_image.bitstreams.empty()) {
    fprintf(stderr, "Encode failed\\n");
    return EXIT_FAILURE;
  }
  if (!WriteFile(filename_out, encoded_image.bitstreams[0])) {
    fprintf(stderr, "Failed to write output file %s\\n", filename_out.c_str());
    return EXIT_FAILURE;
  }
  bench_write_ms = bench_now_ms() - bench_t_write0;
  bench_print_timing("djpegli", "decode", bench_read_ms, bench_codec_ms, bench_write_ms,
                     bench_now_ms() - bench_t_total, jpeg_bytes.size(),
                     encoded_image.bitstreams[0].size());

  return EXIT_SUCCESS;''')
])

# -------------------------------------------------------------------------
# 3. libjxl: cjxl_main.cc & djxl_main.cc
# -------------------------------------------------------------------------
reset_git_file(f"{SRC}/libjxl", "tools/cjxl_main.cc")
replace_exact(f"{SRC}/libjxl/tools/cjxl_main.cc", [
    ('#include <jxl/codestream_header.h>\n', '#include <jxl/codestream_header.h>\n' + BENCH_H),
    ('int main(int argc, char** argv) {\n',
     'int main(int argc, char** argv) {\n  const double bench_t_total = bench_now_ms();\n  double bench_read_ms = 0.0, bench_codec_ms = 0.0, bench_write_ms = 0.0;\n'),
    ('''  if (try_non_streaming) {
    // Loading the input.''',
     '''  const double bench_t_read0 = bench_now_ms();
  if (try_non_streaming) {
    // Loading the input.'''),
    ('''  ProcessFlags(codec, ppf, jpeg_bytes, &cmdline, &args, &params);

  if (!args.quiet) {
    PrintMode(ppf, decode_mps, input_bytes, args, cmdline);
  }''',
     '''  bench_read_ms = bench_now_ms() - bench_t_read0;
  ProcessFlags(codec, ppf, jpeg_bytes, &cmdline, &args, &params);

  if (!args.quiet) {
    PrintMode(ppf, decode_mps, input_bytes, args, cmdline);
  }'''),
    ('''  std::vector<uint8_t> compressed;
  for (size_t num_rep = 0; num_rep < args.num_reps; ++num_rep) {
    if (args.streaming_output) {
      output_processor.Seek(0);
      output_processor.SetFinalizedPosition(0);
    }
    const double t0 = jxl::Now();
    if (!EncodeImageJXL(params, ppf, jpeg_bytes,
                        args.streaming_output ? nullptr : &compressed)) {
      fprintf(stderr, "EncodeImageJXL() failed.\\n");
      return EXIT_FAILURE;
    }
    const double t1 = jxl::Now();
    stats.NotifyElapsed(t1 - t0);
    stats.SetImageSize(ppf.info.xsize, ppf.info.ysize);
  }
  size_t compressed_size = args.streaming_output
                               ? output_processor.finalized_position
                               : compressed.size();

  if (!args.streaming_output && have_file_out && !args.disable_output) {
    if (!jpegxl::tools::WriteFile(args.file_out, compressed)) {
      std::cerr << "Could not write jxl file.\\n";
      return EXIT_FAILURE;
    }
  }''',
     '''  std::vector<uint8_t> compressed;
  const double bench_t_enc0 = bench_now_ms();
  bench_read_ms = bench_t_enc0 - bench_t_total;
  for (size_t num_rep = 0; num_rep < args.num_reps; ++num_rep) {
    if (args.streaming_output) {
      output_processor.Seek(0);
      output_processor.SetFinalizedPosition(0);
    }
    const double t0 = jxl::Now();
    if (!EncodeImageJXL(params, ppf, jpeg_bytes,
                        args.streaming_output ? nullptr : &compressed)) {
      fprintf(stderr, "EncodeImageJXL() failed.\\n");
      return EXIT_FAILURE;
    }
    const double t1 = jxl::Now();
    stats.NotifyElapsed(t1 - t0);
    stats.SetImageSize(ppf.info.xsize, ppf.info.ysize);
  }
  bench_codec_ms = (bench_now_ms() - bench_t_enc0) / (args.num_reps ? args.num_reps : 1);
  size_t compressed_size = args.streaming_output
                               ? output_processor.finalized_position
                               : compressed.size();

  if (!args.streaming_output && have_file_out && !args.disable_output) {
    const double bench_t_write0 = bench_now_ms();
    if (!jpegxl::tools::WriteFile(args.file_out, compressed)) {
      std::cerr << "Could not write jxl file.\\n";
      return EXIT_FAILURE;
    }
    bench_write_ms = bench_now_ms() - bench_t_write0;
  }'''),
    ('''      JPEGXL_TOOLS_CHECK(stats.Print(num_worker_threads));
    } else {
      cmdline.VerbosePrintf(0, "\\n");
    }
  }
  return EXIT_SUCCESS;
}''',
     '''      JPEGXL_TOOLS_CHECK(stats.Print(num_worker_threads));
    } else {
      cmdline.VerbosePrintf(0, "\\n");
    }
  }
  bench_print_timing("cjxl", "encode", bench_read_ms, bench_codec_ms, bench_write_ms,
                     bench_now_ms() - bench_t_total, input_bytes, compressed_size);
  return EXIT_SUCCESS;
}''')
])

reset_git_file(f"{SRC}/libjxl", "tools/djxl_main.cc")
replace_exact(f"{SRC}/libjxl/tools/djxl_main.cc", [
    ('#include <cstdio>\n', '#include <cstdio>\n' + BENCH_H),
    ('int main(int argc, const char* argv[]) {\n',
     'int main(int argc, const char* argv[]) {\n  const double bench_t_total = bench_now_ms();\n  double bench_read_ms = 0.0, bench_codec_ms = 0.0, bench_write_ms = 0.0;\n'),
    ('''  std::vector<uint8_t> compressed;
  // Reading compressed JPEG XL input
  if (!jpegxl::tools::ReadFile(args.file_in, &compressed)) {
    fprintf(stderr, "couldn't load %s\\n", args.file_in);
    return EXIT_FAILURE;
  }''',
     '''  const double bench_t_read0 = bench_now_ms();
  std::vector<uint8_t> compressed;
  // Reading compressed JPEG XL input
  if (!jpegxl::tools::ReadFile(args.file_in, &compressed)) {
    fprintf(stderr, "couldn't load %s\\n", args.file_in);
    return EXIT_FAILURE;
  }
  bench_read_ms = bench_now_ms() - bench_t_read0;'''),
    ('''    jxl::extras::PackedPixelFile ppf;
    size_t decoded_bytes = 0;
    for (size_t i = 0; i < num_reps; ++i) {
      if (!DecompressJxlToPackedPixelFile(args, compressed, accepted_formats,
                                          accepts_cmyk, runner.get(), &ppf,
                                          &decoded_bytes, &stats)) {
        fprintf(stderr, "DecompressJxlToPackedPixelFile failed\\n");
        return EXIT_FAILURE;
      }
    }''',
     '''    jxl::extras::PackedPixelFile ppf;
    size_t decoded_bytes = 0;
    const double bench_t_dec0 = bench_now_ms();
    for (size_t i = 0; i < num_reps; ++i) {
      if (!DecompressJxlToPackedPixelFile(args, compressed, accepted_formats,
                                          accepts_cmyk, runner.get(), &ppf,
                                          &decoded_bytes, &stats)) {
        fprintf(stderr, "DecompressJxlToPackedPixelFile failed\\n");
        return EXIT_FAILURE;
      }
    }
    bench_codec_ms = (bench_now_ms() - bench_t_dec0) / (num_reps ? num_reps : 1);'''),
    ('''    if (encoder) {
      if (args.alpha_blend) {''',
     '''    if (encoder) {
      const double bench_t_write0 = bench_now_ms();
      if (args.alpha_blend) {'''),
    ('''      if (!WriteOptionalOutput(args.preview_out,
                               encoded_image.preview_bitstream) ||
          !WriteOptionalOutput(args.icc_out, ppf.icc) ||
          !WriteOptionalOutput(args.orig_icc_out, ppf.orig_icc) ||
          !WriteOptionalOutput(args.metadata_out, encoded_image.metadata)) {
        return EXIT_FAILURE;
      }
    }
  }
  if (!args.quiet) {
    stats.Print(num_worker_threads);
  }

  return EXIT_SUCCESS;''',
     '''      if (!WriteOptionalOutput(args.preview_out,
                               encoded_image.preview_bitstream) ||
          !WriteOptionalOutput(args.icc_out, ppf.icc) ||
          !WriteOptionalOutput(args.orig_icc_out, ppf.orig_icc) ||
          !WriteOptionalOutput(args.metadata_out, encoded_image.metadata)) {
        return EXIT_FAILURE;
      }
      bench_write_ms = bench_now_ms() - bench_t_write0;
    }
  }
  if (!args.quiet) {
    stats.Print(num_worker_threads);
  }
  bench_print_timing("djxl", "decode", bench_read_ms, bench_codec_ms, bench_write_ms,
                     bench_now_ms() - bench_t_total, compressed.size(),
                     bench_file_size(args.file_out));

  return EXIT_SUCCESS;''')
])

# -------------------------------------------------------------------------
# 4. libavif: avifenc.c & avifdec.c
# -------------------------------------------------------------------------
reset_git_file(f"{SRC}/libavif", "apps/avifenc.c")
replace_exact(f"{SRC}/libavif/apps/avifenc.c", [
    ('#include "avif/avif.h"\n', '#include "avif/avif.h"\n' + BENCH_H),
    ('int main(int argc, char * argv[])\n{\n',
     'int main(int argc, char * argv[])\n{\n    const double bench_t_total = bench_now_ms();\n    double bench_read_ms = 0.0, bench_codec_ms = 0.0, bench_write_ms = 0.0;\n'),
    ('''    const avifBool ignoreGainMap = settings.ignoreGainMap || isImageSequence || settings.progressive;
    if (!avifInputReadImage(&input,''',
     '''    const avifBool ignoreGainMap = settings.ignoreGainMap || isImageSequence || settings.progressive;
    const double bench_t_read0 = bench_now_ms();
    if (!avifInputReadImage(&input,'''),
    ('''    printf("Successfully loaded: %s\\n", avifPrettyFilename(firstFile->filename));''',
     '''    bench_read_ms = bench_now_ms() - bench_t_read0;
    printf("Successfully loaded: %s\\n", avifPrettyFilename(firstFile->filename));'''),
    ('''    avifEncodedByteSizes byteSizes = { 0, 0, 0 };
    if (!avifEncodeImages(&settings, &input, firstFile, image, (const avifImage **)gridCells, &raw, &byteSizes)) {
        goto cleanup;
    }''',
     '''    avifEncodedByteSizes byteSizes = { 0, 0, 0 };
    const double bench_t_enc0 = bench_now_ms();
    bench_read_ms = bench_t_enc0 - bench_t_total;
    if (!avifEncodeImages(&settings, &input, firstFile, image, (const avifImage **)gridCells, &raw, &byteSizes)) {
        goto cleanup;
    }
    bench_codec_ms = bench_now_ms() - bench_t_enc0;'''),
    ('''    FILE * f = fopen(outputFilename, "wb");
    if (!f) {
        fprintf(stderr, "ERROR: Failed to open file for write: %s\\n", outputFilename);
        goto cleanup;
    }
    if (fwrite(raw.data, 1, raw.size, f) != raw.size) {
        fprintf(stderr, "Failed to write %" AVIF_FMT_ZU " bytes: %s\\n", raw.size, outputFilename);
        goto cleanup;
    } else {
        printf("Wrote AVIF: %s\\n", outputFilename);
    }
    fclose(f);
    returnCode = 0;''',
     '''    const double bench_t_write0 = bench_now_ms();
    FILE * f = fopen(outputFilename, "wb");
    if (!f) {
        fprintf(stderr, "ERROR: Failed to open file for write: %s\\n", outputFilename);
        goto cleanup;
    }
    if (fwrite(raw.data, 1, raw.size, f) != raw.size) {
        fprintf(stderr, "Failed to write %" AVIF_FMT_ZU " bytes: %s\\n", raw.size, outputFilename);
        goto cleanup;
    } else {
        printf("Wrote AVIF: %s\\n", outputFilename);
    }
    fclose(f);
    bench_write_ms = bench_now_ms() - bench_t_write0;
    {
        const char * tool_name = (settings.codecChoice == AVIF_CODEC_CHOICE_SVT) ? "avifenc-svt" :
                                 (settings.codecChoice == AVIF_CODEC_CHOICE_AOM) ? "avifenc-aom" : "avifenc";
        bench_print_timing(tool_name, "encode", bench_read_ms, bench_codec_ms, bench_write_ms,
                           bench_now_ms() - bench_t_total, bench_file_size(firstFile->filename), raw.size);
    }
    returnCode = 0;''')
])

reset_git_file(f"{SRC}/libavif", "apps/avifdec.c")
replace_exact(f"{SRC}/libavif/apps/avifdec.c", [
    ('#include "avif/avif.h"\n', '#include "avif/avif.h"\n' + BENCH_H),
    ('int main(int argc, char * argv[])\n{\n',
     'int main(int argc, char * argv[])\n{\n    const double bench_t_total = bench_now_ms();\n    double bench_read_ms = 0.0, bench_codec_ms = 0.0, bench_write_ms = 0.0;\n'),
    ('''    avifResult result = avifDecoderSetIOFile(decoder, inputFilename);
    if (result != AVIF_RESULT_OK) {
        fprintf(stderr, "Cannot open file for read: %s\\n", inputFilename);
        goto cleanup;
    }

    result = avifDecoderParse(decoder);''',
     '''    const double bench_t_read0 = bench_now_ms();
    avifResult result = avifDecoderSetIOFile(decoder, inputFilename);
    if (result != AVIF_RESULT_OK) {
        fprintf(stderr, "Cannot open file for read: %s\\n", inputFilename);
        goto cleanup;
    }

    result = avifDecoderParse(decoder);
    bench_read_ms = bench_now_ms() - bench_t_read0;'''),
    ('''        result = decodeAllFrames ? avifDecoderNextImage(decoder) : avifDecoderNthImage(decoder, frameIndex);''',
     '''        {
            const double bench_t_dec0 = bench_now_ms();
            result = decodeAllFrames ? avifDecoderNextImage(decoder) : avifDecoderNthImage(decoder, frameIndex);
            bench_codec_ms += bench_now_ms() - bench_t_dec0;
        }'''),
    ('''            if (!avifWriteToFile(outputFormat, outputFilename, imageView, rawColor, jpegQuality, pngCompressionLevel, requestedDepth, chromaUpsampling)) {
                goto cleanup;
            }''',
     '''            {
                const double bench_t_write0 = bench_now_ms();
                if (!avifWriteToFile(outputFormat, outputFilename, imageView, rawColor, jpegQuality, pngCompressionLevel, requestedDepth, chromaUpsampling)) {
                    goto cleanup;
                }
                bench_write_ms += bench_now_ms() - bench_t_write0;
            }'''),
    ('''    returnCode = 0;

cleanup:''',
     '''    returnCode = 0;
    bench_print_timing("avifdec", "decode", bench_read_ms, bench_codec_ms, bench_write_ms,
                       bench_now_ms() - bench_t_total, bench_file_size(inputFilename),
                       bench_file_size(outputFilename));

cleanup:''')
])

# -------------------------------------------------------------------------
# 5. libjpeg-turbo: cjpeg.c & djpeg.c
# -------------------------------------------------------------------------
reset_git_file(f"{SRC}/libjpeg-turbo", "src/cjpeg.c")
replace_exact(f"{SRC}/libjpeg-turbo/src/cjpeg.c", [
    ('#include "cdjpeg.h"             /* Common decls for cjpeg/djpeg applications */\n', '#include "cdjpeg.h"             /* Common decls for cjpeg/djpeg applications */\n' + BENCH_H),
    ('  JDIMENSION num_scanlines;\n',
     '  JDIMENSION num_scanlines;\n  const double bench_t_total = bench_now_ms();\n  double bench_read_ms = 0.0, bench_codec_ms = 0.0, bench_write_ms = 0.0, bench_t0 = 0.0;\n'),
    ('''  /* Read the input file header to obtain file size & colorspace. */
  (*src_mgr->start_input) (&cinfo, src_mgr);''',
     '''  /* Read the input file header to obtain file size & colorspace. */
  bench_t0 = bench_now_ms();
  (*src_mgr->start_input) (&cinfo, src_mgr);
  bench_read_ms += bench_now_ms() - bench_t0;'''),
    ('''  /* Specify data destination for compression */
  if (memdst)
    jpeg_mem_dest(&cinfo, &outbuffer, &outsize);
  else
    jpeg_stdio_dest(&cinfo, output_file);''',
     '''  /* Specify data destination for compression: always encode into memory first to measure pure codec_ms */
  jpeg_mem_dest(&cinfo, &outbuffer, &outsize);'''),
    ('''  /* Start compressor */
  jpeg_start_compress(&cinfo, TRUE);

  if (icc_profile != NULL)
    jpeg_write_icc_profile(&cinfo, icc_profile, (unsigned int)icc_len);
  else if (!noicc) {
    JOCTET *src_icc_profile;
    unsigned int src_icc_len;

    if ((*src_mgr->read_icc_profile) (&cinfo, src_mgr, &src_icc_profile,
                                      &src_icc_len))
      jpeg_write_icc_profile(&cinfo, src_icc_profile, src_icc_len);
  }

  /* Process data */
  if (cinfo.data_precision <= 8) {
    while (cinfo.next_scanline < cinfo.image_height) {
      num_scanlines = (*src_mgr->get_pixel_rows) (&cinfo, src_mgr);
      (void)jpeg_write_scanlines(&cinfo, src_mgr->buffer, num_scanlines);
    }
  } else if (cinfo.data_precision <= 12) {
    while (cinfo.next_scanline < cinfo.image_height) {
      num_scanlines = (*src_mgr->get_pixel_rows) (&cinfo, src_mgr);
      (void)jpeg12_write_scanlines(&cinfo, src_mgr->buffer12, num_scanlines);
    }
  } else {
#ifdef C_LOSSLESS_SUPPORTED
    while (cinfo.next_scanline < cinfo.image_height) {
      num_scanlines = (*src_mgr->get_pixel_rows) (&cinfo, src_mgr);
      (void)jpeg16_write_scanlines(&cinfo, src_mgr->buffer16, num_scanlines);
    }
#else
    ERREXIT1(&cinfo, JERR_BAD_PRECISION, cinfo.data_precision);
#endif
  }

  /* Finish compression and release memory */
  (*src_mgr->finish_input) (&cinfo, src_mgr);
  jpeg_finish_compress(&cinfo);''',
     '''  /* Start compressor */
  bench_t0 = bench_now_ms();
  bench_read_ms = bench_t0 - bench_t_total;
  jpeg_start_compress(&cinfo, TRUE);

  if (icc_profile != NULL)
    jpeg_write_icc_profile(&cinfo, icc_profile, (unsigned int)icc_len);
  else if (!noicc) {
    JOCTET *src_icc_profile;
    unsigned int src_icc_len;

    if ((*src_mgr->read_icc_profile) (&cinfo, src_mgr, &src_icc_profile,
                                      &src_icc_len))
      jpeg_write_icc_profile(&cinfo, src_icc_profile, src_icc_len);
  }
  bench_codec_ms += bench_now_ms() - bench_t0;

  /* Process data */
  if (cinfo.data_precision <= 8) {
    while (cinfo.next_scanline < cinfo.image_height) {
      bench_t0 = bench_now_ms();
      num_scanlines = (*src_mgr->get_pixel_rows) (&cinfo, src_mgr);
      bench_read_ms += bench_now_ms() - bench_t0;
      bench_t0 = bench_now_ms();
      (void)jpeg_write_scanlines(&cinfo, src_mgr->buffer, num_scanlines);
      bench_codec_ms += bench_now_ms() - bench_t0;
    }
  } else if (cinfo.data_precision <= 12) {
    while (cinfo.next_scanline < cinfo.image_height) {
      bench_t0 = bench_now_ms();
      num_scanlines = (*src_mgr->get_pixel_rows) (&cinfo, src_mgr);
      bench_read_ms += bench_now_ms() - bench_t0;
      bench_t0 = bench_now_ms();
      (void)jpeg12_write_scanlines(&cinfo, src_mgr->buffer12, num_scanlines);
      bench_codec_ms += bench_now_ms() - bench_t0;
    }
  } else {
#ifdef C_LOSSLESS_SUPPORTED
    while (cinfo.next_scanline < cinfo.image_height) {
      bench_t0 = bench_now_ms();
      num_scanlines = (*src_mgr->get_pixel_rows) (&cinfo, src_mgr);
      bench_read_ms += bench_now_ms() - bench_t0;
      bench_t0 = bench_now_ms();
      (void)jpeg16_write_scanlines(&cinfo, src_mgr->buffer16, num_scanlines);
      bench_codec_ms += bench_now_ms() - bench_t0;
    }
#else
    ERREXIT1(&cinfo, JERR_BAD_PRECISION, cinfo.data_precision);
#endif
  }

  /* Finish compression and release memory */
  bench_t0 = bench_now_ms();
  (*src_mgr->finish_input) (&cinfo, src_mgr);
  bench_read_ms += bench_now_ms() - bench_t0;
  bench_t0 = bench_now_ms();
  jpeg_finish_compress(&cinfo);
  bench_codec_ms += bench_now_ms() - bench_t0;

  if (!memdst && output_file != NULL) {
    bench_t0 = bench_now_ms();
    fwrite(outbuffer, 1, outsize, output_file);
    fflush(output_file);
    bench_write_ms += bench_now_ms() - bench_t0;
  }'''),
    ('''  if (memdst) {
#ifndef CJPEG_FUZZER
    fprintf(stderr, "Compressed size:  %lu bytes\\n", outsize);
#endif
    free(outbuffer);
  }''',
     '''  if (memdst) {
#ifndef CJPEG_FUZZER
    fprintf(stderr, "Compressed size:  %lu bytes\\n", outsize);
#endif
  }
  bench_print_timing("cjpeg-turbo", "encode", bench_read_ms, bench_codec_ms, bench_write_ms,
                     bench_now_ms() - bench_t_total,
                     file_index < argc ? bench_file_size(argv[file_index]) : 0,
                     (size_t)outsize);
  free(outbuffer);''')
])

reset_git_file(f"{SRC}/libjpeg-turbo", "src/djpeg.c")
replace_exact(f"{SRC}/libjpeg-turbo/src/djpeg.c", [
    ('#include "cdjpeg.h"             /* Common decls for cjpeg/djpeg applications */\n', '#include "cdjpeg.h"             /* Common decls for cjpeg/djpeg applications */\n' + BENCH_H),
    ('  JDIMENSION num_scanlines;\n',
     '  JDIMENSION num_scanlines;\n  const double bench_t_total = bench_now_ms();\n  double bench_read_ms = 0.0, bench_codec_ms = 0.0, bench_write_ms = 0.0, bench_t0 = 0.0;\n'),
    ('''  /* Specify data source for decompression */
  if (memsrc) {
    size_t nbytes;
    do {
      inbuffer = (unsigned char *)realloc(inbuffer, insize + INPUT_BUF_SIZE);
      if (inbuffer == NULL) {
        fprintf(stderr, "%s: memory allocation failure\\n", progname);
        exit(EXIT_FAILURE);
      }
      nbytes = fread(&inbuffer[insize], 1, INPUT_BUF_SIZE, input_file);
      if (nbytes < INPUT_BUF_SIZE && ferror(input_file)) {
        if (file_index < argc)
          fprintf(stderr, "%s: can't read from %s\\n", progname,
                  argv[file_index]);
        else
          fprintf(stderr, "%s: can't read from stdin\\n", progname);
      }
      insize += (unsigned long)nbytes;
    } while (nbytes == INPUT_BUF_SIZE);
    fprintf(stderr, "Compressed size:  %lu bytes\\n", insize);
    jpeg_mem_src(&cinfo, inbuffer, insize);
  } else
    jpeg_stdio_src(&cinfo, input_file);''',
     '''  /* Always load input file into memory buffer first to separate read_input_ms from codec_ms */
  {
    size_t nbytes;
    bench_t0 = bench_now_ms();
    do {
      inbuffer = (unsigned char *)realloc(inbuffer, insize + INPUT_BUF_SIZE);
      if (inbuffer == NULL) {
        fprintf(stderr, "%s: memory allocation failure\\n", progname);
        exit(EXIT_FAILURE);
      }
      nbytes = fread(&inbuffer[insize], 1, INPUT_BUF_SIZE, input_file);
      insize += (unsigned long)nbytes;
    } while (nbytes == INPUT_BUF_SIZE);
    bench_read_ms += bench_now_ms() - bench_t0;
    if (memsrc)
      fprintf(stderr, "Compressed size:  %lu bytes\\n", insize);
    jpeg_mem_src(&cinfo, inbuffer, insize);
  }'''),
    ('''  (void)jpeg_read_header(&cinfo, TRUE);''',
     '''  bench_t0 = bench_now_ms();
  (void)jpeg_read_header(&cinfo, TRUE);
  bench_codec_ms += bench_now_ms() - bench_t0;'''),
    ('''  /* Start decompressor */
  (void)jpeg_start_decompress(&cinfo);''',
     '''  /* Start decompressor */
  bench_t0 = bench_now_ms();
  (void)jpeg_start_decompress(&cinfo);
  bench_codec_ms += bench_now_ms() - bench_t0;'''),
    ('''  /* Normal full-image decompress */
  } else {
    /* Write output file header */
    (*dest_mgr->start_output) (&cinfo, dest_mgr);''',
     '''  /* Normal full-image decompress */
  } else {
    /* Write output file header */
    bench_t0 = bench_now_ms();
    (*dest_mgr->start_output) (&cinfo, dest_mgr);
    bench_write_ms += bench_now_ms() - bench_t0;'''),
    ('''      while (cinfo.output_scanline < cinfo.output_height) {
        num_scanlines = jpeg_read_scanlines(&cinfo, dest_mgr->buffer,
                                            dest_mgr->buffer_height);
        (*dest_mgr->put_pixel_rows) (&cinfo, dest_mgr, num_scanlines);
      }''',
     '''      while (cinfo.output_scanline < cinfo.output_height) {
        bench_t0 = bench_now_ms();
        num_scanlines = jpeg_read_scanlines(&cinfo, dest_mgr->buffer,
                                            dest_mgr->buffer_height);
        bench_codec_ms += bench_now_ms() - bench_t0;
        bench_t0 = bench_now_ms();
        (*dest_mgr->put_pixel_rows) (&cinfo, dest_mgr, num_scanlines);
        bench_write_ms += bench_now_ms() - bench_t0;
      }'''),
    ('''  /* Finish decompression and release memory.
   * I must do it in this order because output module has allocated memory
   * of lifespan JPOOL_IMAGE; it needs to finish before releasing memory.
   */
  (*dest_mgr->finish_output) (&cinfo, dest_mgr);
  (void)jpeg_finish_decompress(&cinfo);''',
     '''  bench_t0 = bench_now_ms();
  (*dest_mgr->finish_output) (&cinfo, dest_mgr);
  fflush(output_file);
  bench_write_ms += bench_now_ms() - bench_t0;
  bench_t0 = bench_now_ms();
  (void)jpeg_finish_decompress(&cinfo);
  bench_codec_ms += bench_now_ms() - bench_t0;'''),
    ('''  if (memsrc)
    free(inbuffer);''',
     '''  bench_print_timing("djpeg-turbo", "decode", bench_read_ms, bench_codec_ms, bench_write_ms,
                     bench_now_ms() - bench_t_total, (size_t)insize,
                     bench_file_size(outfilename));
  free(inbuffer);''')
])

# -------------------------------------------------------------------------
# 6. MozJPEG: cjpeg.c & djpeg.c
# -------------------------------------------------------------------------
reset_git_file(f"{SRC}/mozjpeg", "cjpeg.c")
replace_exact(f"{SRC}/mozjpeg/cjpeg.c", [
    ('#include "cdjpeg.h"             /* Common decls for cjpeg/djpeg applications */\n',
     '#include "cdjpeg.h"             /* Common decls for cjpeg/djpeg applications */\n' + BENCH_H),
    ('  JDIMENSION num_scanlines;\n',
     '  JDIMENSION num_scanlines;\n  const double bench_t_total = bench_now_ms();\n  double bench_read_ms = 0.0, bench_codec_ms = 0.0, bench_write_ms = 0.0, bench_t0 = 0.0;\n'),
    ('''  /* Read the input file header to obtain file size & colorspace. */
  (*src_mgr->start_input) (&cinfo, src_mgr);''',
     '''  /* Read the input file header to obtain file size & colorspace. */
  bench_t0 = bench_now_ms();
  (*src_mgr->start_input) (&cinfo, src_mgr);
  bench_read_ms += bench_now_ms() - bench_t0;'''),
    ('''  /* Specify data destination for compression */
  if (memdst)
    jpeg_mem_dest(&cinfo, &outbuffer, &outsize);
  else
    jpeg_stdio_dest(&cinfo, output_file);''',
     '''  /* Specify data destination for compression: always encode into memory first */
  jpeg_mem_dest(&cinfo, &outbuffer, &outsize);'''),
    ('''  /* Start compressor */
  jpeg_start_compress(&cinfo, TRUE);''',
     '''  /* Start compressor */
  bench_t0 = bench_now_ms();
  bench_read_ms = bench_t0 - bench_t_total;
  jpeg_start_compress(&cinfo, TRUE);
  bench_codec_ms += bench_now_ms() - bench_t0;'''),
    ('''  while (cinfo.next_scanline < cinfo.image_height) {
    num_scanlines = (*src_mgr->get_pixel_rows) (&cinfo, src_mgr);
#if JPEG_RAW_READER
    if (is_jpeg)
      (void) jpeg_write_raw_data(&cinfo, src_mgr->plane_pointer, num_scanlines);
    else
#endif
      (void)jpeg_write_scanlines(&cinfo, src_mgr->buffer, num_scanlines);
    }
  }

  /* Finish compression and release memory */
  (*src_mgr->finish_input) (&cinfo, src_mgr);
  jpeg_finish_compress(&cinfo);''',
     '''  while (cinfo.next_scanline < cinfo.image_height) {
    bench_t0 = bench_now_ms();
    num_scanlines = (*src_mgr->get_pixel_rows) (&cinfo, src_mgr);
    bench_read_ms += bench_now_ms() - bench_t0;
    bench_t0 = bench_now_ms();
#if JPEG_RAW_READER
    if (is_jpeg)
      (void) jpeg_write_raw_data(&cinfo, src_mgr->plane_pointer, num_scanlines);
    else
#endif
    (void) jpeg_write_scanlines(&cinfo, src_mgr->buffer, num_scanlines);
    bench_codec_ms += bench_now_ms() - bench_t0;
  }
  }

  /* Finish compression and release memory */
  bench_t0 = bench_now_ms();
  (*src_mgr->finish_input) (&cinfo, src_mgr);
  bench_read_ms += bench_now_ms() - bench_t0;
  bench_t0 = bench_now_ms();
  jpeg_finish_compress(&cinfo);
  bench_codec_ms += bench_now_ms() - bench_t0;

  if (!memdst && output_file != NULL) {
    bench_t0 = bench_now_ms();
    fwrite(outbuffer, 1, outsize, output_file);
    fflush(output_file);
    bench_write_ms += bench_now_ms() - bench_t0;
  }'''),
    ('''  if (memdst) {
#ifndef CJPEG_FUZZER
    fprintf(stderr, "Compressed size:  %lu bytes\\n", outsize);
#endif
    free(outbuffer);
  }''',
     '''  if (memdst) {
#ifndef CJPEG_FUZZER
    fprintf(stderr, "Compressed size:  %lu bytes\\n", outsize);
#endif
  }
  bench_print_timing("cjpeg-mozjpeg", "encode", bench_read_ms, bench_codec_ms, bench_write_ms,
                     bench_now_ms() - bench_t_total,
                     file_index < argc ? bench_file_size(argv[file_index]) : 0,
                     (size_t)outsize);
  free(outbuffer);''')
])

reset_git_file(f"{SRC}/mozjpeg", "djpeg.c")
replace_exact(f"{SRC}/mozjpeg/djpeg.c", [
    ('#include "cdjpeg.h"             /* Common decls for cjpeg/djpeg applications */\n', '#include "cdjpeg.h"             /* Common decls for cjpeg/djpeg applications */\n' + BENCH_H),
    ('  JDIMENSION num_scanlines;\n',
     '  JDIMENSION num_scanlines;\n  const double bench_t_total = bench_now_ms();\n  double bench_read_ms = 0.0, bench_codec_ms = 0.0, bench_write_ms = 0.0, bench_t0 = 0.0;\n'),
    ('''  /* Specify data source for decompression */
  if (memsrc) {
    size_t nbytes;
    do {
      inbuffer = (unsigned char *)realloc(inbuffer, insize + INPUT_BUF_SIZE);
      if (inbuffer == NULL) {
        fprintf(stderr, "%s: memory allocation failure\\n", progname);
        exit(EXIT_FAILURE);
      }
      nbytes = fread(&inbuffer[insize], 1, INPUT_BUF_SIZE, input_file);
      if (nbytes < INPUT_BUF_SIZE && ferror(input_file)) {
        if (file_index < argc)
          fprintf(stderr, "%s: can't read from %s\\n", progname,
                  argv[file_index]);
        else
          fprintf(stderr, "%s: can't read from stdin\\n", progname);
      }
      insize += (unsigned long)nbytes;
    } while (nbytes == INPUT_BUF_SIZE);
    fprintf(stderr, "Compressed size:  %lu bytes\\n", insize);
    jpeg_mem_src(&cinfo, inbuffer, insize);
  } else
    jpeg_stdio_src(&cinfo, input_file);''',
     '''  /* Always load input file into memory buffer first to separate read_input_ms from codec_ms */
  {
    size_t nbytes;
    bench_t0 = bench_now_ms();
    do {
      inbuffer = (unsigned char *)realloc(inbuffer, insize + INPUT_BUF_SIZE);
      if (inbuffer == NULL) {
        fprintf(stderr, "%s: memory allocation failure\\n", progname);
        exit(EXIT_FAILURE);
      }
      nbytes = fread(&inbuffer[insize], 1, INPUT_BUF_SIZE, input_file);
      insize += (unsigned long)nbytes;
    } while (nbytes == INPUT_BUF_SIZE);
    bench_read_ms += bench_now_ms() - bench_t0;
    if (memsrc)
      fprintf(stderr, "Compressed size:  %lu bytes\\n", insize);
    jpeg_mem_src(&cinfo, inbuffer, insize);
  }'''),
    ('''  (void)jpeg_read_header(&cinfo, TRUE);''',
     '''  bench_t0 = bench_now_ms();
  (void)jpeg_read_header(&cinfo, TRUE);
  bench_codec_ms += bench_now_ms() - bench_t0;'''),
    ('''  /* Start decompressor */
  (void)jpeg_start_decompress(&cinfo);''',
     '''  /* Start decompressor */
  bench_t0 = bench_now_ms();
  (void)jpeg_start_decompress(&cinfo);
  bench_codec_ms += bench_now_ms() - bench_t0;'''),
    ('''  /* Normal full-image decompress */
  } else {
    /* Write output file header */
    (*dest_mgr->start_output) (&cinfo, dest_mgr);''',
     '''  /* Normal full-image decompress */
  } else {
    /* Write output file header */
    bench_t0 = bench_now_ms();
    (*dest_mgr->start_output) (&cinfo, dest_mgr);
    bench_write_ms += bench_now_ms() - bench_t0;'''),
    ('''      while (cinfo.output_scanline < cinfo.output_height) {
        num_scanlines = jpeg_read_scanlines(&cinfo, dest_mgr->buffer,
                                            dest_mgr->buffer_height);
        (*dest_mgr->put_pixel_rows) (&cinfo, dest_mgr, num_scanlines);
      }''',
     '''      while (cinfo.output_scanline < cinfo.output_height) {
        bench_t0 = bench_now_ms();
        num_scanlines = jpeg_read_scanlines(&cinfo, dest_mgr->buffer,
                                            dest_mgr->buffer_height);
        bench_codec_ms += bench_now_ms() - bench_t0;
        bench_t0 = bench_now_ms();
        (*dest_mgr->put_pixel_rows) (&cinfo, dest_mgr, num_scanlines);
        bench_write_ms += bench_now_ms() - bench_t0;
      }'''),
    ('''  /* Finish decompression and release memory.
   * I must do it in this order because output module has allocated memory
   * of lifespan JPOOL_IMAGE; it needs to finish before releasing memory.
   */
  (*dest_mgr->finish_output) (&cinfo, dest_mgr);
  (void)jpeg_finish_decompress(&cinfo);''',
     '''  bench_t0 = bench_now_ms();
  (*dest_mgr->finish_output) (&cinfo, dest_mgr);
  fflush(output_file);
  bench_write_ms += bench_now_ms() - bench_t0;
  bench_t0 = bench_now_ms();
  (void)jpeg_finish_decompress(&cinfo);
  bench_codec_ms += bench_now_ms() - bench_t0;'''),
    ('''  if (memsrc)
    free(inbuffer);''',
     '''  bench_print_timing("djpeg-mozjpeg", "decode", bench_read_ms, bench_codec_ms, bench_write_ms,
                     bench_now_ms() - bench_t_total, (size_t)insize,
                     bench_file_size(outfilename));
  free(inbuffer);''')
])

# -------------------------------------------------------------------------

print("=== ALL SOURCE FILES PATCHED SUCCESSFULLY ===")
