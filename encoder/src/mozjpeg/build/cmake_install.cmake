# Install script for directory: /Users/yarna/Project/MoonvyRoot/products/Apps/ImageFmtBenchmark/encoder/src/mozjpeg

# Set the install prefix
if(NOT DEFINED CMAKE_INSTALL_PREFIX)
  set(CMAKE_INSTALL_PREFIX "/Users/yarna/Project/MoonvyRoot/products/Apps/ImageFmtBenchmark/encoder/deps/mozjpeg")
endif()
string(REGEX REPLACE "/$" "" CMAKE_INSTALL_PREFIX "${CMAKE_INSTALL_PREFIX}")

# Set the install configuration name.
if(NOT DEFINED CMAKE_INSTALL_CONFIG_NAME)
  if(BUILD_TYPE)
    string(REGEX REPLACE "^[^A-Za-z0-9_]+" ""
           CMAKE_INSTALL_CONFIG_NAME "${BUILD_TYPE}")
  else()
    set(CMAKE_INSTALL_CONFIG_NAME "Release")
  endif()
  message(STATUS "Install configuration: \"${CMAKE_INSTALL_CONFIG_NAME}\"")
endif()

# Set the component getting installed.
if(NOT CMAKE_INSTALL_COMPONENT)
  if(COMPONENT)
    message(STATUS "Install component: \"${COMPONENT}\"")
    set(CMAKE_INSTALL_COMPONENT "${COMPONENT}")
  else()
    set(CMAKE_INSTALL_COMPONENT)
  endif()
endif()

# Is this installation the result of a crosscompile?
if(NOT DEFINED CMAKE_CROSSCOMPILING)
  set(CMAKE_CROSSCOMPILING "FALSE")
endif()

# Set path to fallback-tool for dependency-resolution.
if(NOT DEFINED CMAKE_OBJDUMP)
  set(CMAKE_OBJDUMP "/usr/bin/objdump")
endif()

if(NOT CMAKE_INSTALL_LOCAL_ONLY)
  # Include the install script for the subdirectory.
  include("/Users/yarna/Project/MoonvyRoot/products/Apps/ImageFmtBenchmark/encoder/src/mozjpeg/build/simd/cmake_install.cmake")
endif()

if(NOT CMAKE_INSTALL_LOCAL_ONLY)
  # Include the install script for the subdirectory.
  include("/Users/yarna/Project/MoonvyRoot/products/Apps/ImageFmtBenchmark/encoder/src/mozjpeg/build/md5/cmake_install.cmake")
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "lib" OR NOT CMAKE_INSTALL_COMPONENT)
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/lib" TYPE STATIC_LIBRARY FILES "/Users/yarna/Project/MoonvyRoot/products/Apps/ImageFmtBenchmark/encoder/src/mozjpeg/build/libturbojpeg.a")
  if(EXISTS "$ENV{DESTDIR}${CMAKE_INSTALL_PREFIX}/lib/libturbojpeg.a" AND
     NOT IS_SYMLINK "$ENV{DESTDIR}${CMAKE_INSTALL_PREFIX}/lib/libturbojpeg.a")
    execute_process(COMMAND "/usr/bin/ranlib" "$ENV{DESTDIR}${CMAKE_INSTALL_PREFIX}/lib/libturbojpeg.a")
  endif()
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "bin" OR NOT CMAKE_INSTALL_COMPONENT)
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/bin" TYPE PROGRAM RENAME "tjbench" FILES "/Users/yarna/Project/MoonvyRoot/products/Apps/ImageFmtBenchmark/encoder/src/mozjpeg/build/tjbench-static")
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "include" OR NOT CMAKE_INSTALL_COMPONENT)
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/include" TYPE FILE FILES "/Users/yarna/Project/MoonvyRoot/products/Apps/ImageFmtBenchmark/encoder/src/mozjpeg/turbojpeg.h")
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "lib" OR NOT CMAKE_INSTALL_COMPONENT)
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/lib" TYPE STATIC_LIBRARY FILES "/Users/yarna/Project/MoonvyRoot/products/Apps/ImageFmtBenchmark/encoder/src/mozjpeg/build/libjpeg.a")
  if(EXISTS "$ENV{DESTDIR}${CMAKE_INSTALL_PREFIX}/lib/libjpeg.a" AND
     NOT IS_SYMLINK "$ENV{DESTDIR}${CMAKE_INSTALL_PREFIX}/lib/libjpeg.a")
    execute_process(COMMAND "/usr/bin/ranlib" "$ENV{DESTDIR}${CMAKE_INSTALL_PREFIX}/lib/libjpeg.a")
  endif()
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "bin" OR NOT CMAKE_INSTALL_COMPONENT)
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/bin" TYPE PROGRAM RENAME "cjpeg" FILES "/Users/yarna/Project/MoonvyRoot/products/Apps/ImageFmtBenchmark/encoder/src/mozjpeg/build/cjpeg-static")
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "bin" OR NOT CMAKE_INSTALL_COMPONENT)
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/bin" TYPE PROGRAM RENAME "djpeg" FILES "/Users/yarna/Project/MoonvyRoot/products/Apps/ImageFmtBenchmark/encoder/src/mozjpeg/build/djpeg-static")
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "bin" OR NOT CMAKE_INSTALL_COMPONENT)
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/bin" TYPE PROGRAM RENAME "jpegtran" FILES "/Users/yarna/Project/MoonvyRoot/products/Apps/ImageFmtBenchmark/encoder/src/mozjpeg/build/jpegtran-static")
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "bin" OR NOT CMAKE_INSTALL_COMPONENT)
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/bin" TYPE EXECUTABLE FILES "/Users/yarna/Project/MoonvyRoot/products/Apps/ImageFmtBenchmark/encoder/src/mozjpeg/build/rdjpgcom")
  if(EXISTS "$ENV{DESTDIR}${CMAKE_INSTALL_PREFIX}/bin/rdjpgcom" AND
     NOT IS_SYMLINK "$ENV{DESTDIR}${CMAKE_INSTALL_PREFIX}/bin/rdjpgcom")
    if(CMAKE_INSTALL_DO_STRIP)
      execute_process(COMMAND "/usr/bin/strip" -u -r "$ENV{DESTDIR}${CMAKE_INSTALL_PREFIX}/bin/rdjpgcom")
    endif()
  endif()
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "bin" OR NOT CMAKE_INSTALL_COMPONENT)
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/bin" TYPE EXECUTABLE FILES "/Users/yarna/Project/MoonvyRoot/products/Apps/ImageFmtBenchmark/encoder/src/mozjpeg/build/wrjpgcom")
  if(EXISTS "$ENV{DESTDIR}${CMAKE_INSTALL_PREFIX}/bin/wrjpgcom" AND
     NOT IS_SYMLINK "$ENV{DESTDIR}${CMAKE_INSTALL_PREFIX}/bin/wrjpgcom")
    if(CMAKE_INSTALL_DO_STRIP)
      execute_process(COMMAND "/usr/bin/strip" -u -r "$ENV{DESTDIR}${CMAKE_INSTALL_PREFIX}/bin/wrjpgcom")
    endif()
  endif()
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "doc" OR NOT CMAKE_INSTALL_COMPONENT)
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/share/doc/mozjpeg" TYPE FILE FILES
    "/Users/yarna/Project/MoonvyRoot/products/Apps/ImageFmtBenchmark/encoder/src/mozjpeg/README.ijg"
    "/Users/yarna/Project/MoonvyRoot/products/Apps/ImageFmtBenchmark/encoder/src/mozjpeg/README.md"
    "/Users/yarna/Project/MoonvyRoot/products/Apps/ImageFmtBenchmark/encoder/src/mozjpeg/example.c"
    "/Users/yarna/Project/MoonvyRoot/products/Apps/ImageFmtBenchmark/encoder/src/mozjpeg/tjexample.c"
    "/Users/yarna/Project/MoonvyRoot/products/Apps/ImageFmtBenchmark/encoder/src/mozjpeg/libjpeg.txt"
    "/Users/yarna/Project/MoonvyRoot/products/Apps/ImageFmtBenchmark/encoder/src/mozjpeg/structure.txt"
    "/Users/yarna/Project/MoonvyRoot/products/Apps/ImageFmtBenchmark/encoder/src/mozjpeg/usage.txt"
    "/Users/yarna/Project/MoonvyRoot/products/Apps/ImageFmtBenchmark/encoder/src/mozjpeg/wizard.txt"
    "/Users/yarna/Project/MoonvyRoot/products/Apps/ImageFmtBenchmark/encoder/src/mozjpeg/LICENSE.md"
    )
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "man" OR NOT CMAKE_INSTALL_COMPONENT)
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/share/man/man1" TYPE FILE FILES
    "/Users/yarna/Project/MoonvyRoot/products/Apps/ImageFmtBenchmark/encoder/src/mozjpeg/cjpeg.1"
    "/Users/yarna/Project/MoonvyRoot/products/Apps/ImageFmtBenchmark/encoder/src/mozjpeg/djpeg.1"
    "/Users/yarna/Project/MoonvyRoot/products/Apps/ImageFmtBenchmark/encoder/src/mozjpeg/jpegtran.1"
    "/Users/yarna/Project/MoonvyRoot/products/Apps/ImageFmtBenchmark/encoder/src/mozjpeg/rdjpgcom.1"
    "/Users/yarna/Project/MoonvyRoot/products/Apps/ImageFmtBenchmark/encoder/src/mozjpeg/wrjpgcom.1"
    )
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "lib" OR NOT CMAKE_INSTALL_COMPONENT)
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/lib/pkgconfig" TYPE FILE FILES "/Users/yarna/Project/MoonvyRoot/products/Apps/ImageFmtBenchmark/encoder/src/mozjpeg/build/pkgscripts/libjpeg.pc")
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "lib" OR NOT CMAKE_INSTALL_COMPONENT)
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/lib/pkgconfig" TYPE FILE FILES "/Users/yarna/Project/MoonvyRoot/products/Apps/ImageFmtBenchmark/encoder/src/mozjpeg/build/pkgscripts/libturbojpeg.pc")
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "lib" OR NOT CMAKE_INSTALL_COMPONENT)
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/lib/cmake/mozjpeg" TYPE FILE FILES
    "/Users/yarna/Project/MoonvyRoot/products/Apps/ImageFmtBenchmark/encoder/src/mozjpeg/build/pkgscripts/mozjpegConfig.cmake"
    "/Users/yarna/Project/MoonvyRoot/products/Apps/ImageFmtBenchmark/encoder/src/mozjpeg/build/pkgscripts/mozjpegConfigVersion.cmake"
    )
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "lib" OR NOT CMAKE_INSTALL_COMPONENT)
  if(EXISTS "$ENV{DESTDIR}${CMAKE_INSTALL_PREFIX}/lib/cmake/mozjpeg/mozjpegTargets.cmake")
    file(DIFFERENT _cmake_export_file_changed FILES
         "$ENV{DESTDIR}${CMAKE_INSTALL_PREFIX}/lib/cmake/mozjpeg/mozjpegTargets.cmake"
         "/Users/yarna/Project/MoonvyRoot/products/Apps/ImageFmtBenchmark/encoder/src/mozjpeg/build/CMakeFiles/Export/550b6a93ab174b7b077b4dce02619fc3/mozjpegTargets.cmake")
    if(_cmake_export_file_changed)
      file(GLOB _cmake_old_config_files "$ENV{DESTDIR}${CMAKE_INSTALL_PREFIX}/lib/cmake/mozjpeg/mozjpegTargets-*.cmake")
      if(_cmake_old_config_files)
        string(REPLACE ";" ", " _cmake_old_config_files_text "${_cmake_old_config_files}")
        message(STATUS "Old export file \"$ENV{DESTDIR}${CMAKE_INSTALL_PREFIX}/lib/cmake/mozjpeg/mozjpegTargets.cmake\" will be replaced.  Removing files [${_cmake_old_config_files_text}].")
        unset(_cmake_old_config_files_text)
        file(REMOVE ${_cmake_old_config_files})
      endif()
      unset(_cmake_old_config_files)
    endif()
    unset(_cmake_export_file_changed)
  endif()
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/lib/cmake/mozjpeg" TYPE FILE FILES "/Users/yarna/Project/MoonvyRoot/products/Apps/ImageFmtBenchmark/encoder/src/mozjpeg/build/CMakeFiles/Export/550b6a93ab174b7b077b4dce02619fc3/mozjpegTargets.cmake")
  if(CMAKE_INSTALL_CONFIG_NAME MATCHES "^([Rr][Ee][Ll][Ee][Aa][Ss][Ee])$")
    file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/lib/cmake/mozjpeg" TYPE FILE FILES "/Users/yarna/Project/MoonvyRoot/products/Apps/ImageFmtBenchmark/encoder/src/mozjpeg/build/CMakeFiles/Export/550b6a93ab174b7b077b4dce02619fc3/mozjpegTargets-release.cmake")
  endif()
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "include" OR NOT CMAKE_INSTALL_COMPONENT)
  file(INSTALL DESTINATION "${CMAKE_INSTALL_PREFIX}/include" TYPE FILE FILES
    "/Users/yarna/Project/MoonvyRoot/products/Apps/ImageFmtBenchmark/encoder/src/mozjpeg/build/jconfig.h"
    "/Users/yarna/Project/MoonvyRoot/products/Apps/ImageFmtBenchmark/encoder/src/mozjpeg/jerror.h"
    "/Users/yarna/Project/MoonvyRoot/products/Apps/ImageFmtBenchmark/encoder/src/mozjpeg/jmorecfg.h"
    "/Users/yarna/Project/MoonvyRoot/products/Apps/ImageFmtBenchmark/encoder/src/mozjpeg/jpeglib.h"
    )
endif()

string(REPLACE ";" "\n" CMAKE_INSTALL_MANIFEST_CONTENT
       "${CMAKE_INSTALL_MANIFEST_FILES}")
if(CMAKE_INSTALL_LOCAL_ONLY)
  file(WRITE "/Users/yarna/Project/MoonvyRoot/products/Apps/ImageFmtBenchmark/encoder/src/mozjpeg/build/install_local_manifest.txt"
     "${CMAKE_INSTALL_MANIFEST_CONTENT}")
endif()
if(CMAKE_INSTALL_COMPONENT)
  if(CMAKE_INSTALL_COMPONENT MATCHES "^[a-zA-Z0-9_.+-]+$")
    set(CMAKE_INSTALL_MANIFEST "install_manifest_${CMAKE_INSTALL_COMPONENT}.txt")
  else()
    string(MD5 CMAKE_INST_COMP_HASH "${CMAKE_INSTALL_COMPONENT}")
    set(CMAKE_INSTALL_MANIFEST "install_manifest_${CMAKE_INST_COMP_HASH}.txt")
    unset(CMAKE_INST_COMP_HASH)
  endif()
else()
  set(CMAKE_INSTALL_MANIFEST "install_manifest.txt")
endif()

if(NOT CMAKE_INSTALL_LOCAL_ONLY)
  file(WRITE "/Users/yarna/Project/MoonvyRoot/products/Apps/ImageFmtBenchmark/encoder/src/mozjpeg/build/${CMAKE_INSTALL_MANIFEST}"
     "${CMAKE_INSTALL_MANIFEST_CONTENT}")
endif()
