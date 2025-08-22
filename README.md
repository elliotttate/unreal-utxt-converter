# Unreal UTXT Converter

A Visual Studio Code extension for converting Unreal Engine `.uasset` files to UTXT (Unreal Text) format and back. This tool enables you to view and edit Unreal Engine assets in a human-readable JSON format.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Unreal Engine](https://img.shields.io/badge/Unreal%20Engine-4.27%2B-orange)

## Features

- 🔄 **Bidirectional Conversion**: Convert `.uasset` files to `.utxt` and back
- 📝 **Human-Readable Format**: View Unreal assets as formatted JSON
- 🎯 **UE4.27+ Support**: Full support for Unreal Engine 4.27 and later versions
- 🏗️ **Blueprint Support**: Correctly handles Widget Blueprints and other Blueprint types
- 🔍 **Property Deserialization**: Properly deserializes UE4 properties including arrays, structs, and objects
- ✅ **Round-Trip Conversion**: Maintains data integrity when converting back and forth
- 🎨 **Syntax Highlighting**: UTXT files are recognized as JSON for proper syntax highlighting

## Installation

### From VSIX Package

1. Download the latest `.vsix` package from the [Releases](https://github.com/elliotttate/unreal-utxt-converter/releases) page
2. In VS Code, press `Ctrl+Shift+P` to open the command palette
3. Type "Install from VSIX" and select "Extensions: Install from VSIX..."
4. Browse to the downloaded `.vsix` file and install

### From Source

1. Clone this repository:
   ```bash
   git clone https://github.com/elliotttate/unreal-utxt-converter.git
   cd unreal-utxt-converter
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Compile the TypeScript:
   ```bash
   npm run compile
   ```

4. Package the extension:
   ```bash
   npm run package
   ```

5. Install the generated `.vsix` file as described above

## Usage

### Converting UAsset to UTXT

1. Right-click on any `.uasset` file in the VS Code Explorer
2. Select "Convert UAsset to UTXT" from the context menu
3. A new `.utxt` file will be created in the same directory

### Converting UTXT back to UAsset

1. Right-click on any `.utxt` file in the VS Code Explorer
2. Select "Convert UTXT to UAsset" from the context menu
3. The original `.uasset` file will be updated (or created if it doesn't exist)

### Testing Round-Trip Conversion

1. Right-click on a `.uasset` file
2. Select "Test Round-trip Conversion"
3. The extension will convert to UTXT and back, verifying data integrity

## UTXT Format

The UTXT format is a JSON representation of Unreal Engine assets. Here's an example structure:

```json
{
  "GatherableTextData": [],
  "Thumbnails": {
    "Thumbnails": [],
    "Index": []
  },
  "Exports": {
    "MyWidget:WidgetTree.CanvasPanel_0": {
      "__Class": "Class /Script/UMG.CanvasPanel",
      "__ObjectFlags": 8,
      "__Value": {
        "Properties": {
          "Slots": {
            "__Type": "ArrayProperty",
            "__InnerType": "ObjectProperty",
            "__Value": [...]
          }
        }
      }
    }
  }
}
```

## Supported Asset Types

- ✅ Widget Blueprints (WBP_*)
- ✅ Blueprints (BP_*)
- ✅ UMG Widgets (CanvasPanel, Button, TextBlock, etc.)
- ✅ Blueprint Graphs and Nodes
- ✅ Asset metadata and properties

## Technical Details

### Binary Parsing

The extension includes a custom binary parser that directly reads Unreal Engine's package format:
- Handles UE4.27's 36-byte import table entries
- Properly reads FName tables with instance numbers
- Supports LocalizationId and GatherableTextData fields
- Correctly resolves class references and outer chains

### Property System

Full support for Unreal's property serialization:
- `ArrayProperty` with inner type support
- `StructProperty` with nested properties
- `ObjectProperty` with reference resolution
- `BoolProperty`, `IntProperty`, `FloatProperty`
- `NameProperty`, `StrProperty`, `TextProperty`
- And many more...

## Configuration

The extension provides the following settings:

- `unrealutxt.showDebugOutput`: Show detailed debug output in the Output panel (default: true)
- `unrealutxt.preserveRawData`: Preserve raw binary data for perfect round-trip conversion (default: true)

## Development

### Building from Source

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Watch for changes
npm run watch

# Package extension
npm run package
```

### Project Structure

```
unreal-utxt-converter/
├── src/
│   ├── extension-simplified.ts    # Main extension entry point
│   ├── uasset-parser-fixed.ts     # Binary parser for .uasset files
│   ├── uasset-writer.ts           # Binary writer for .uasset files
│   └── property-serializer.ts     # UE4 property (de)serialization
├── package.json                   # Extension manifest
├── tsconfig.json                  # TypeScript configuration
└── README.md                      # This file
```

## Known Issues

- Large asset files (>100MB) may take several seconds to convert
- Some complex Blueprint nodes may show raw binary data instead of fully deserialized properties
- Custom struct types may not be fully deserialized

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

### Development Guidelines

1. Follow the existing code style
2. Add tests for new features
3. Update documentation as needed
4. Ensure all tests pass before submitting PR

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Epic Games and Unreal Engine for the UTXT format specification
- The Unreal Engine community for documentation and support
- Contributors to the UAsset API project for format insights

## Support

If you encounter any issues or have questions:

1. Check the [Issues](https://github.com/elliotttate/unreal-utxt-converter/issues) page
2. Create a new issue with detailed information about your problem
3. Include sample files if possible (ensure no proprietary content)

## Changelog

### Version 1.0.0 (2024-01-22)
- Initial release
- Full support for UE4.27 asset format
- Bidirectional conversion between .uasset and .utxt
- Property deserialization for common UE4 types
- Round-trip conversion verification

---

**Note**: This extension is not officially affiliated with Epic Games or Unreal Engine. Unreal Engine is a trademark of Epic Games, Inc.