#----------------------------------------------------------------
# Generated CMake target import file for configuration "Release".
#----------------------------------------------------------------

# Commands may need to know the format version.
set(CMAKE_IMPORT_FILE_VERSION 1)

# Import target "mozjpeg::turbojpeg-static" for configuration "Release"
set_property(TARGET mozjpeg::turbojpeg-static APPEND PROPERTY IMPORTED_CONFIGURATIONS RELEASE)
set_target_properties(mozjpeg::turbojpeg-static PROPERTIES
  IMPORTED_LINK_INTERFACE_LANGUAGES_RELEASE "C"
  IMPORTED_LOCATION_RELEASE "${_IMPORT_PREFIX}/lib/libturbojpeg.a"
  )

list(APPEND _cmake_import_check_targets mozjpeg::turbojpeg-static )
list(APPEND _cmake_import_check_files_for_mozjpeg::turbojpeg-static "${_IMPORT_PREFIX}/lib/libturbojpeg.a" )

# Import target "mozjpeg::jpeg-static" for configuration "Release"
set_property(TARGET mozjpeg::jpeg-static APPEND PROPERTY IMPORTED_CONFIGURATIONS RELEASE)
set_target_properties(mozjpeg::jpeg-static PROPERTIES
  IMPORTED_LINK_INTERFACE_LANGUAGES_RELEASE "C"
  IMPORTED_LOCATION_RELEASE "${_IMPORT_PREFIX}/lib/libjpeg.a"
  )

list(APPEND _cmake_import_check_targets mozjpeg::jpeg-static )
list(APPEND _cmake_import_check_files_for_mozjpeg::jpeg-static "${_IMPORT_PREFIX}/lib/libjpeg.a" )

# Commands beyond this point should not need to know the version.
set(CMAKE_IMPORT_FILE_VERSION)
