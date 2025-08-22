# Changelog

All notable changes to the Unreal UTXT Converter extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2024-01-22

### Added
- Initial release of Unreal UTXT Converter
- Binary parser for Unreal Engine .uasset files (UE4.27+)
- Binary writer for round-trip conversion
- Support for Widget Blueprints and standard Blueprints
- Property deserialization for all common UE4 property types
- Proper handling of 36-byte import table entries (UE4.27 specific)
- Correct class resolution for UMG widgets
- Export name formatting with package prefixes
- VS Code integration with context menu commands
- Syntax highlighting for .utxt files (recognized as JSON)
- Debug output panel for conversion diagnostics
- Round-trip conversion testing command

### Technical Features
- Direct binary parsing without external dependencies
- FName table reading with instance number support
- LocalizationId and GatherableTextData field support
- Outer chain resolution for nested objects
- Base64 encoding for raw binary data preservation
- Property type detection and formatting

### Supported Property Types
- ArrayProperty with inner type support
- StructProperty with nested properties
- ObjectProperty with reference resolution
- BoolProperty, IntProperty, FloatProperty
- NameProperty, StrProperty, TextProperty
- ByteProperty, EnumProperty
- MapProperty, SetProperty
- DelegateProperty, MulticastDelegateProperty

### Known Limitations
- Large files (>100MB) may have performance impact
- Some complex custom structs may show as raw data
- Blueprint compilation data is preserved but not fully deserialized