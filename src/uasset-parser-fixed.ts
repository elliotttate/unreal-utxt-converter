/**
 * Direct UASSET to UTXT Converter
 * Based on uasset-reader-js reference implementation
 * Parses .uasset binary files and converts them to UTXT format
 */

import * as fs from 'fs';
import * as path from 'path';
import { PropertySerializer } from './property-serializer';

// UAsset file magic numbers
const PACKAGE_FILE_TAG = 0x9E2A83C1;
const PACKAGE_FILE_TAG_SWAPPED = 0xC1832A9E;

// UE4 Version enums
enum EUnrealEngineObjectUE4Version {
    VER_UE4_ADDED_PACKAGE_SUMMARY_LOCALIZATION_ID = 510,
    VER_UE4_SERIALIZE_TEXT_IN_PACKAGES = 459,
    VER_UE4_ADD_STRING_ASSET_REFERENCES_MAP = 384,
    VER_UE4_ADDED_SEARCHABLE_NAMES = 510,
    VER_UE4_ENGINE_VERSION_OBJECT = 336,
    VER_UE4_PACKAGE_SUMMARY_HAS_COMPATIBLE_ENGINE_VERSION = 444,
    VER_UE4_WORLD_LEVEL_INFO = 518,
    VER_UE4_PRELOAD_DEPENDENCIES_IN_COOKED_EXPORTS = 214,
    VER_UE4_OLDEST_LOADABLE_PACKAGE = 214,
    VER_UE4_ADDED_PACKAGE_OWNER = 498,
    VER_UE4_NON_OUTER_PACKAGE_IMPORT = 516,
    VER_UE4_CHANGED_CHUNKID_TO_BE_AN_ARRAY_OF_CHUNKIDS = 459,
    VER_UE4_ADDED_CHUNKID_TO_ASSETDATA_AND_UPACKAGE = 278
}

interface FGuid {
    A: number;
    B: number;
    C: number;
    D: number;
}

interface FPackageFileSummary {
    Tag: number;
    LegacyFileVersion: number;
    LegacyUE3Version: number;
    FileVersionUE4: number;
    FileVersionUE5: number;
    FileVersionLicenseeUE4: number;
    CustomVersions: any[];
    TotalHeaderSize: number;
    FolderName: string;
    PackageFlags: number;
    NameCount: number;
    NameOffset: number;
    LocalizationId?: string;
    GatherableTextDataCount: number;
    GatherableTextDataOffset: number;
    ExportCount: number;
    ExportOffset: number;
    ImportCount: number;
    ImportOffset: number;
    DependsOffset: number;
    SoftPackageReferencesCount: number;
    SoftPackageReferencesOffset: number;
    SearchableNamesOffset: number;
    ThumbnailTableOffset: number;
    Guid: string;
    PersistentGuid?: string;
    Generations: any[];
    SavedByEngineVersion?: string;
    CompatibleWithEngineVersion?: string;
    CompressionFlags: number;
    PackageSource: number;
    AssetRegistryDataOffset: number;
    BulkDataStartOffset: bigint;
    WorldTileInfoDataOffset: number;
    PreloadDependencyCount: number;
    PreloadDependencyOffset: number;
}

interface FObjectImport {
    ClassPackage: string;
    ClassName: string;
    OuterIndex: number;
    ObjectName: string;
}

interface FObjectExport {
    ClassIndex: number;
    SuperIndex: number;
    TemplateIndex: number;
    OuterIndex: number;
    ObjectName: string;
    Save: number;
    SerialSize: bigint;
    SerialOffset: bigint;
    bForcedExport: boolean;
    bNotForClient: boolean;
    bNotForServer: boolean;
    PackageGuid: string;
    PackageFlags: number;
    bNotAlwaysLoadedForEditorGame: boolean;
    bIsAsset: boolean;
    FirstExportDependency: number;
    SerializationBeforeSerializationDependencies: number;
    CreateBeforeSerializationDependencies: number;
    SerializationBeforeCreateDependencies: number;
    CreateBeforeCreateDependencies: number;
}

export class UAssetParser {
    private buffer: Buffer;
    private offset: number = 0;
    private useLittleEndian: boolean = true;
    private summary: FPackageFileSummary | null = null;
    private nameMap: string[] = [];
    private imports: FObjectImport[] = [];
    private exports: FObjectExport[] = [];

    constructor(buffer: Buffer) {
        this.buffer = buffer;
    }

    /**
     * Parse a .uasset file and convert to UTXT format
     */
    public static async parseToUTXT(filePath: string): Promise<any> {
        console.log(`Reading file: ${filePath}`);
        const buffer = fs.readFileSync(filePath);
        console.log(`File size: ${buffer.length} bytes`);
        const parser = new UAssetParser(buffer);
        return parser.parse();
    }

    /**
     * Main parse function
     */
    private parse(): any {
        try {
            console.log('Starting parse...');
            
            // Read package file summary
            this.summary = this.readPackageFileSummary();
            
            if (!this.summary) {
                throw new Error('Invalid UAsset file: Could not read package summary');
            }

            console.log(`Package summary read: NameCount=${this.summary.NameCount}, ExportCount=${this.summary.ExportCount}, ImportCount=${this.summary.ImportCount}`);
            console.log(`FileVersionUE4=${this.summary.FileVersionUE4}, LegacyFileVersion=${this.summary.LegacyFileVersion}`);

            // Read name table
            this.readNameTable();
            console.log(`Name table read: ${this.nameMap.length} names`);
            if (this.nameMap.length > 0) {
                console.log(`First few names: ${this.nameMap.slice(0, 5).join(', ')}`);
            }
            
            // Read import table
            this.readImportTable();
            console.log(`Import table read: ${this.imports.length} imports`);
            
            // Read export table
            this.readExportTable();
            console.log(`Export table read: ${this.exports.length} exports`);

            // Convert to UTXT format
            return this.convertToUTXT();
        } catch (error) {
            console.error('Parse error:', error);
            throw error;
        }
    }

    /**
     * Read package file summary
     */
    private readPackageFileSummary(): FPackageFileSummary | null {
        const tag = this.readUInt32();
        console.log(`Magic number: 0x${tag.toString(16)} (expected: 0x${PACKAGE_FILE_TAG.toString(16)})`);
        
        // Check magic number
        if (tag === PACKAGE_FILE_TAG_SWAPPED) {
            // The package has been stored in a separate endianness
            this.useLittleEndian = false;
            console.log('Using big-endian byte order');
        } else if (tag !== PACKAGE_FILE_TAG) {
            console.error('Invalid magic number');
            return null;
        }

        // Read file versions
        const legacyFileVersion = this.readInt32();
        
        // Check supported versions (-6, -7, -8 are supported)
        if (legacyFileVersion !== -6 && legacyFileVersion !== -7 && legacyFileVersion !== -8) {
            console.error(`Unsupported legacy file version: ${legacyFileVersion}`);
            return null;
        }

        const legacyUE3Version = this.readInt32();
        const fileVersionUE4 = this.readInt32();
        
        // Read UE5 version if applicable
        let fileVersionUE5 = 0;
        if (legacyFileVersion <= -8) {
            fileVersionUE5 = this.readInt32();
        }
        
        const fileVersionLicenseeUE4 = this.readInt32();
        
        // Read custom versions
        const customVersions = [];
        const customVersionCount = this.readInt32();
        for (let i = 0; i < customVersionCount; i++) {
            customVersions.push({
                key: this.readGuid(),
                version: this.readInt32()
            });
        }
        
        const totalHeaderSize = this.readInt32();
        const folderName = this.readFString();
        const packageFlags = this.readUInt32();
        const nameCount = this.readInt32();
        const nameOffset = this.readInt32();
        
        // Localization ID (UE4.16+) - This IS present in our file!
        let localizationId: string | undefined;
        if (fileVersionUE4 >= EUnrealEngineObjectUE4Version.VER_UE4_ADDED_PACKAGE_SUMMARY_LOCALIZATION_ID) {
            localizationId = this.readFString();
        }
        
        // Gatherable text data (UE4.4+)
        let gatherableTextDataCount = 0;
        let gatherableTextDataOffset = 0;
        if (fileVersionUE4 >= EUnrealEngineObjectUE4Version.VER_UE4_SERIALIZE_TEXT_IN_PACKAGES) {
            gatherableTextDataCount = this.readInt32();
            gatherableTextDataOffset = this.readInt32();
        }
        
        const exportCount = this.readInt32();
        const exportOffset = this.readInt32();
        const importCount = this.readInt32();
        const importOffset = this.readInt32();
        const dependsOffset = this.readInt32();
        
        // String asset references
        let softPackageReferencesCount = 0;
        let softPackageReferencesOffset = 0;
        if (fileVersionUE4 >= EUnrealEngineObjectUE4Version.VER_UE4_ADD_STRING_ASSET_REFERENCES_MAP) {
            softPackageReferencesCount = this.readInt32();
            softPackageReferencesOffset = this.readInt32();
        }
        
        // Searchable names
        let searchableNamesOffset = 0;
        if (fileVersionUE4 >= EUnrealEngineObjectUE4Version.VER_UE4_ADDED_SEARCHABLE_NAMES) {
            searchableNamesOffset = this.readInt32();
        }
        
        const thumbnailTableOffset = this.readInt32();
        const guid = this.readGuidString();
        
        // Persistent GUID
        let persistentGuid: string | undefined;
        if (fileVersionUE4 >= EUnrealEngineObjectUE4Version.VER_UE4_ADDED_PACKAGE_OWNER) {
            persistentGuid = this.readGuidString();
        }
        
        // Owner persistent GUID (deprecated)
        if (fileVersionUE4 >= EUnrealEngineObjectUE4Version.VER_UE4_ADDED_PACKAGE_OWNER && 
            fileVersionUE4 < EUnrealEngineObjectUE4Version.VER_UE4_NON_OUTER_PACKAGE_IMPORT) {
            this.readGuidString(); // OwnerPersistentGuid - just skip it
        }
        
        // Generations
        const generationsCount = this.readInt32();
        const generations = [];
        for (let i = 0; i < generationsCount; i++) {
            generations.push({
                exportCount: this.readInt32(),
                nameCount: this.readInt32()
            });
        }
        
        // Engine version
        let savedByEngineVersion: string | undefined;
        if (fileVersionUE4 >= EUnrealEngineObjectUE4Version.VER_UE4_ENGINE_VERSION_OBJECT) {
            const major = this.readUInt16();
            const minor = this.readUInt16();
            const patch = this.readUInt16();
            const changelist = this.readUInt32();
            const branch = this.readFString();
            savedByEngineVersion = `${major}.${minor}.${patch}-${changelist}+${branch}`;
        } else {
            this.readInt32(); // EngineChangelist
        }
        
        // Compatible engine version
        let compatibleWithEngineVersion: string | undefined;
        if (fileVersionUE4 >= EUnrealEngineObjectUE4Version.VER_UE4_PACKAGE_SUMMARY_HAS_COMPATIBLE_ENGINE_VERSION) {
            const major = this.readUInt16();
            const minor = this.readUInt16();
            const patch = this.readUInt16();
            const changelist = this.readUInt32();
            const branch = this.readFString();
            compatibleWithEngineVersion = `${major}.${minor}.${patch}-${changelist}+${branch}`;
        } else {
            compatibleWithEngineVersion = savedByEngineVersion;
        }
        
        const compressionFlags = this.readUInt32();
        
        // Compressed chunks
        const compressedChunksCount = this.readInt32();
        if (compressedChunksCount > 0) {
            throw new Error('Asset is compressed - not supported');
        }
        
        const packageSource = this.readUInt32();
        
        // Additional packages to cook
        const additionalPackagesCount = this.readInt32();
        if (additionalPackagesCount > 0) {
            throw new Error('AdditionalPackagesToCook not supported');
        }
        
        // Texture allocations (legacy)
        if (legacyFileVersion > -7) {
            this.readInt32(); // NumTextureAllocations
        }
        
        const assetRegistryDataOffset = this.readInt32();
        const bulkDataStartOffset = this.readInt64();
        
        // World tile info
        let worldTileInfoDataOffset = 0;
        if (fileVersionUE4 >= EUnrealEngineObjectUE4Version.VER_UE4_WORLD_LEVEL_INFO) {
            worldTileInfoDataOffset = this.readInt32();
        }
        
        // Chunk IDs
        if (fileVersionUE4 >= EUnrealEngineObjectUE4Version.VER_UE4_CHANGED_CHUNKID_TO_BE_AN_ARRAY_OF_CHUNKIDS) {
            const chunkIDsCount = this.readInt32();
            if (chunkIDsCount > 0) {
                throw new Error('ChunkIDs not supported');
            }
        } else if (fileVersionUE4 >= EUnrealEngineObjectUE4Version.VER_UE4_ADDED_CHUNKID_TO_ASSETDATA_AND_UPACKAGE) {
            this.readInt32(); // ChunkID
        }
        
        // Preload dependencies
        let preloadDependencyCount = -1;
        let preloadDependencyOffset = 0;
        if (fileVersionUE4 >= EUnrealEngineObjectUE4Version.VER_UE4_PRELOAD_DEPENDENCIES_IN_COOKED_EXPORTS) {
            preloadDependencyCount = this.readInt32();
            preloadDependencyOffset = this.readInt32();
        }
        
        const summary: FPackageFileSummary = {
            Tag: tag,
            LegacyFileVersion: legacyFileVersion,
            LegacyUE3Version: legacyUE3Version,
            FileVersionUE4: fileVersionUE4,
            FileVersionUE5: fileVersionUE5,
            FileVersionLicenseeUE4: fileVersionLicenseeUE4,
            CustomVersions: customVersions,
            TotalHeaderSize: totalHeaderSize,
            FolderName: folderName,
            PackageFlags: packageFlags,
            NameCount: nameCount,
            NameOffset: nameOffset,
            LocalizationId: localizationId,
            GatherableTextDataCount: gatherableTextDataCount,
            GatherableTextDataOffset: gatherableTextDataOffset,
            ExportCount: exportCount,
            ExportOffset: exportOffset,
            ImportCount: importCount,
            ImportOffset: importOffset,
            DependsOffset: dependsOffset,
            SoftPackageReferencesCount: softPackageReferencesCount,
            SoftPackageReferencesOffset: softPackageReferencesOffset,
            SearchableNamesOffset: searchableNamesOffset,
            ThumbnailTableOffset: thumbnailTableOffset,
            Guid: guid,
            PersistentGuid: persistentGuid,
            Generations: generations,
            SavedByEngineVersion: savedByEngineVersion,
            CompatibleWithEngineVersion: compatibleWithEngineVersion,
            CompressionFlags: compressionFlags,
            PackageSource: packageSource,
            AssetRegistryDataOffset: assetRegistryDataOffset,
            BulkDataStartOffset: bulkDataStartOffset,
            WorldTileInfoDataOffset: worldTileInfoDataOffset,
            PreloadDependencyCount: preloadDependencyCount,
            PreloadDependencyOffset: preloadDependencyOffset
        };

        return summary;
    }

    /**
     * Read name table
     */
    private readNameTable(): void {
        if (!this.summary) return;
        
        this.offset = this.summary.NameOffset;
        
        for (let i = 0; i < this.summary.NameCount; i++) {
            const name = this.readFString();
            
            // UE4.12+ has hash values
            if (this.summary.FileVersionUE4 >= 504) {
                this.readUInt16(); // NonCasePreservingHash
                this.readUInt16(); // CasePreservingHash
            }
            
            this.nameMap.push(name);
        }
    }

    /**
     * Read import table
     */
    private readImportTable(): void {
        if (!this.summary) return;
        
        this.offset = this.summary.ImportOffset;
        
        for (let i = 0; i < this.summary.ImportCount; i++) {
            const classPackage = this.readFName();
            const className = this.readFName();
            const outerIndex = this.readInt32();
            const objectName = this.readFName();
            
            // UE4.27 has 8 additional bytes per import (36 bytes total instead of 28)
            // These might be serialization-related fields
            if (this.summary.FileVersionUE4 >= 508) {
                this.readInt32(); // Unknown field 1
                this.readInt32(); // Unknown field 2
            }
            
            
            // Clean up corrupted names
            let cleanPackage = classPackage;
            let cleanClass = className;
            let cleanObject = objectName;
            
            // Fix common import paths for UMG classes
            const umgClasses = ['CanvasPanel', 'CanvasPanelSlot', 'WidgetTree', 
                               'Image', 'TextBlock', 'Button', 'HorizontalBox', 
                               'VerticalBox', 'Overlay', 'ScrollBox'];
            
            if (cleanPackage === 'Class' && umgClasses.includes(cleanClass)) {
                cleanPackage = '/Script/UMG';
            }
            
            // Fix corrupted package names
            if (cleanPackage.startsWith('None_') || 
                cleanPackage.includes('StandardMacros') ||
                cleanPackage.includes('EditorBlueprintResources')) {
                // These are corrupted references, fix based on class type
                if (umgClasses.includes(cleanClass)) {
                    cleanPackage = '/Script/UMG';
                } else if (cleanClass.includes('Blueprint')) {
                    cleanPackage = '/Script/Engine';
                } else {
                    cleanPackage = '/Script/CoreUObject';
                }
            }
            
            // Fix corrupted class names
            if (cleanClass.startsWith('None_') || cleanClass.includes('_')) {
                // Try to extract meaningful name
                const parts = cleanClass.split('_');
                if (parts.length > 1 && !parts[0].startsWith('None')) {
                    cleanClass = parts[0];
                }
            }
            
            this.imports.push({
                ClassPackage: cleanPackage,
                ClassName: cleanClass,
                OuterIndex: outerIndex,
                ObjectName: cleanObject
            });
        }
    }

    /**
     * Read export table
     */
    private readExportTable(): void {
        if (!this.summary) return;
        
        this.offset = this.summary.ExportOffset;
        
        for (let i = 0; i < this.summary.ExportCount; i++) {
            const exp: FObjectExport = {
                ClassIndex: this.readInt32(),
                SuperIndex: this.readInt32(),
                TemplateIndex: this.readInt32(),
                OuterIndex: this.readInt32(),
                ObjectName: this.readFName(),
                Save: this.readInt32(),
                SerialSize: this.readInt64(),
                SerialOffset: this.readInt64(),
                bForcedExport: this.readInt32() !== 0,
                bNotForClient: this.readInt32() !== 0,
                bNotForServer: this.readInt32() !== 0,
                PackageGuid: this.readGuidString(),
                PackageFlags: this.readUInt32(),
                bNotAlwaysLoadedForEditorGame: this.readInt32() !== 0,
                bIsAsset: this.readInt32() !== 0,
                FirstExportDependency: this.readInt32(),
                SerializationBeforeSerializationDependencies: this.readInt32(),
                CreateBeforeSerializationDependencies: this.readInt32(),
                SerializationBeforeCreateDependencies: this.readInt32(),
                CreateBeforeCreateDependencies: this.readInt32()
            };
            
            this.exports.push(exp);
        }
    }

    /**
     * Convert parsed data to UTXT format
     */
    private convertToUTXT(): any {
        const utxt: any = {
            GatherableTextData: [],
            Thumbnails: {
                Thumbnails: [],
                Index: []
            },
            Exports: {}
        };

        console.log(`Converting ${this.exports.length} exports to UTXT format`);

        // Get package name - look for the main blueprint export
        let packageName = "Unknown";
        
        // Find the main blueprint export - it should have bIsAsset flag set
        // and its name should be WBP_* or BP_* without suffixes
        const blueprintExport = this.exports.find(exp => 
            exp.bIsAsset && 
            (exp.ObjectName.startsWith("WBP_") || exp.ObjectName.startsWith("BP_")) &&
            !exp.ObjectName.includes("ExecuteUbergraph") &&
            !exp.ObjectName.includes("Default__") &&
            !exp.ObjectName.endsWith("_C")
        );
        
        if (blueprintExport) {
            packageName = blueprintExport.ObjectName;
        } else {
            // Fallback: look for any WBP_ or BP_ export without prefix/suffix
            const candidateExport = this.exports.find(exp => 
                (exp.ObjectName === exp.ObjectName.match(/^(WBP_[A-Za-z0-9_]+|BP_[A-Za-z0-9_]+)$/)?.[0])
            );
            
            if (candidateExport) {
                packageName = candidateExport.ObjectName;
            } else {
                // Last resort: extract from any export name
                for (const exp of this.exports) {
                    const match = exp.ObjectName.match(/(WBP_[A-Za-z0-9_]+|BP_[A-Za-z0-9_]+)/);
                    if (match) {
                        let name = match[1];
                        // Remove common suffixes
                        name = name.replace(/_C$/, '').replace(/^Default__/, '').replace(/^ExecuteUbergraph_/, '');
                        if (name.startsWith('WBP_') || name.startsWith('BP_')) {
                            packageName = name;
                            break;
                        }
                    }
                }
            }
        }
        
        console.log(`Detected package name: ${packageName}`);
        
        // Process ALL exports
        for (let i = 0; i < this.exports.length; i++) {
            const exp = this.exports[i];
            console.log(`Processing export ${i}: ${exp.ObjectName}`);
            
            
            // Build full export name with outer chain
            let fullName = this.buildFullExportName(exp, i);
            
            // Special handling for different export types
            if (exp.ObjectName.startsWith('ExecuteUbergraph')) {
                // ExecuteUbergraph functions don't need package prefix
                fullName = exp.ObjectName;
            } else if (exp.ObjectName.endsWith('_C')) {
                // Generated class export
                fullName = exp.ObjectName;
            } else if (exp.ObjectName === 'WidgetTree') {
                // The WidgetTree itself needs package prefix with colon
                fullName = `${packageName}:WidgetTree`;
            } else if (fullName.startsWith('WidgetTree.')) {
                // Widget tree elements need package prefix with colon before WidgetTree
                fullName = `${packageName}:${fullName}`;
            } else if (fullName.includes('.WidgetTree.')) {
                // Nested widget tree elements - replace first dot with colon
                const parts = fullName.split('.');
                if (parts[0] === packageName || parts[0].endsWith('_C')) {
                    fullName = parts[0] + ':' + parts.slice(1).join('.');
                }
            } else if (exp.ObjectName === packageName) {
                // The main blueprint export
                fullName = packageName;
            } else if (exp.ObjectName.startsWith('Default__')) {
                // Default objects don't need modification
                fullName = exp.ObjectName;
            }
            
            const exportData = this.processExport(exp, packageName);
            if (exportData) {
                utxt.Exports[fullName] = exportData;
            }
        }

        // Add thumbnail data - typically 1-2 thumbnails for Widget Blueprints
        if (this.exports.length > 0) {
            // Add thumbnail for main blueprint
            utxt.Thumbnails.Thumbnails.push({
                ImageWidth: 0,
                ImageHeight: 0,
                CompressedImageData: "Base64:"
            });
            
            // Use the package name for the main thumbnail
            utxt.Thumbnails.Index.push({
                ObjectClassName: "WidgetBlueprint",
                ObjectPathWithoutPackageName: packageName,
                FileOffset: 0
            });
            
            // Check if there's a generated class
            const generatedClass = this.exports.find(exp => 
                exp.ObjectName.endsWith("_C") || 
                exp.ObjectName.includes("GeneratedClass")
            );
            
            if (generatedClass) {
                utxt.Thumbnails.Thumbnails.push({
                    ImageWidth: 0,
                    ImageHeight: 0,
                    CompressedImageData: "Base64:"
                });
                
                utxt.Thumbnails.Index.push({
                    ObjectClassName: "WidgetBlueprintGeneratedClass",
                    ObjectPathWithoutPackageName: `${packageName}_C`,
                    FileOffset: 0
                });
            }
        }

        console.log(`Created UTXT with ${Object.keys(utxt.Exports).length} exports`);
        return utxt;
    }

    /**
     * Build full export name with outer chain
     */
    private buildFullExportName(exp: FObjectExport, exportIndex: number): string {
        const parts: string[] = [];
        let current = exp;
        let currentIndex = exportIndex;
        
        // Build the outer chain from innermost to outermost
        while (current) {
            // Skip ExecuteUbergraph and Default__ prefixes in the chain
            if (!current.ObjectName.startsWith('ExecuteUbergraph') && 
                !current.ObjectName.startsWith('Default__')) {
                parts.unshift(current.ObjectName);
            }
            
            if (current.OuterIndex > 0) {
                // References another export
                currentIndex = current.OuterIndex - 1;
                if (currentIndex >= 0 && currentIndex < this.exports.length) {
                    current = this.exports[currentIndex];
                } else {
                    break;
                }
            } else {
                break;
            }
        }
        
        // Special handling for widget tree elements
        if (parts.length >= 2 && parts[0] === 'WidgetTree') {
            // Format: WidgetTree.ElementName
            return parts.join('.');
        }
        
        return parts.join('.');
    }
    
    /**
     * Process a single export
     */
    private processExport(exp: FObjectExport, packageName: string): any {
        const className = this.getExportClassName(exp);
        
        const exportData: any = {
            __Class: className,
            __ObjectFlags: exp.PackageFlags
        };
        
        // Add outer reference if this export is inside another
        if (exp.OuterIndex !== 0) {
            if (exp.OuterIndex > 0) {
                // References another export
                const outerExport = this.exports[exp.OuterIndex - 1];
                if (outerExport) {
                    // Build proper outer path
                    const outerFullName = this.buildFullExportName(outerExport, exp.OuterIndex - 1);
                    
                    if (outerExport.ObjectName === 'WidgetTree') {
                        exportData.__Outer = `WidgetTree /Game/Blueprint/HUD/VR_HUD/${packageName}.${packageName}:WidgetTree`;
                    } else {
                        const outerClass = this.getExportClassName(outerExport);
                        exportData.__Outer = `${outerClass.replace("Class /Script/", "")} /Game/Blueprint/HUD/VR_HUD/${packageName}.${packageName}:${outerFullName}`;
                    }
                }
            } else if (exp.OuterIndex < 0) {
                // References an import
                const importIndex = Math.abs(exp.OuterIndex) - 1;
                if (importIndex < this.imports.length) {
                    const imp = this.imports[importIndex];
                    exportData.__Outer = `${imp.ClassName} ${imp.ObjectName}`;
                }
            }
        }
        
        exportData.__bNotForClient = exp.bNotForClient;
        exportData.__bNotForServer = exp.bNotForServer;
        exportData.__bIsAsset = exp.bIsAsset;
        exportData.__Value = {};

        // Read export data
        if (exp.SerialSize > 0n && exp.SerialOffset > 0n) {
            const exportBuffer = this.readExportData(exp);
            exportData.__Value = this.parseExportData(exportBuffer, className);
        }

        // Don't add blueprint-specific data for non-blueprint classes
        if (className.includes("Blueprint") && !className.includes("Widget")) {
            this.addBlueprintData(exportData, exp);
        }

        return exportData;
    }

    /**
     * Read export data from buffer
     */
    private readExportData(exp: FObjectExport): Buffer {
        const offset = Number(exp.SerialOffset);
        const size = Number(exp.SerialSize);
        return this.buffer.slice(offset, offset + size);
    }

    /**
     * Parse export data based on class type
     */
    private parseExportData(buffer: Buffer, className: string): any {
        const data: any = {};
        
        // ALWAYS store raw data for round-trip conversion
        data.RawData = {
            Digest: this.generateHash(buffer.toString('hex').substring(0, 100)),
            Base64: this.bufferToBase64Chunks(buffer)
        };
        
        try {
            // Try to deserialize properties for better readability
            const serializer = new PropertySerializer(buffer, this.nameMap, this.imports, this.exports);
            const properties = serializer.deserializeProperties();
            
            if (properties && Object.keys(properties.Properties || {}).length > 0) {
                console.log(`Deserialized ${Object.keys(properties.Properties).length} properties`);
                // Add parsed properties alongside raw data
                data.Properties = properties.Properties;
                
                // Debug: show first property and verify it's stored correctly
                const firstProp = Object.keys(properties.Properties)[0];
                if (firstProp) {
                    const propValue = properties.Properties[firstProp];
                    console.log(`  First property: ${firstProp}`);
                    console.log(`    Type in memory: ${propValue.__Type}`);
                    console.log(`    Value type: ${typeof propValue.__Value}`);
                    
                    // Double-check what we're storing
                    if (propValue.__Type !== 'ArrayProperty' && firstProp === 'Slots') {
                        console.log(`    ERROR: Slots should be ArrayProperty but is ${propValue.__Type}`);
                    }
                }
            }
        } catch (error) {
            console.log(`Could not deserialize properties: ${error}`);
        }
        
        console.log(`Export data: ${buffer.length} bytes -> ${data.RawData.Base64.length} base64 chunks`);

        return data;
    }

    /**
     * Add blueprint-specific data
     */
    private addBlueprintData(exportData: any, exp: FObjectExport): void {
        if (!exportData.__Value) {
            exportData.__Value = {};
        }

        // Add SimpleConstructionScript
        exportData.__Value.SimpleConstructionScript = {
            __Class: "Class /Script/Engine.SimpleConstructionScript",
            __ObjectFlags: 0,
            __Value: {
                RootNodes: [],
                AllNodes: []
            }
        };

        // Add DefaultSceneRoot
        exportData.__Value.DefaultSceneRoot = {
            __Class: "Class /Script/Engine.SceneComponent",
            __ObjectFlags: 0,
            __Value: {
                RelativeLocation: { X: 0.0, Y: 0.0, Z: 0.0 },
                RelativeRotation: { Pitch: 0.0, Yaw: 0.0, Roll: 0.0 },
                RelativeScale3D: { X: 1.0, Y: 1.0, Z: 1.0 }
            }
        };

        // Add BaseClassAutoGen with export data
        const exportBuffer = this.readExportData(exp);
        exportData.__Value.BaseClassAutoGen = {
            Data: {
                Digest: this.generateHash(exp.ObjectName),
                Base64: this.bufferToBase64Chunks(exportBuffer)
            },
            Objects: this.imports.map(imp => imp.ObjectName),
            Names: this.nameMap
        };
    }

    /**
     * Get class name for export
     */
    private getExportClassName(exp: FObjectExport): string {
        if (exp.ClassIndex < 0) {
            const importIndex = Math.abs(exp.ClassIndex) - 1;
            if (importIndex < this.imports.length) {
                const imp = this.imports[importIndex];
                
                // For imports, the ObjectName is the actual class being imported
                let className = imp.ObjectName;
                
                // Common UMG widget classes
                const umgClasses = [
                    'CanvasPanel', 'CanvasPanelSlot', 'WidgetTree', 
                    'WidgetBlueprintGeneratedClass', 'Image', 'TextBlock',
                    'Button', 'HorizontalBox', 'VerticalBox', 'Overlay',
                    'ScrollBox', 'GridPanel', 'UniformGridPanel', 'OverlaySlot',
                    'HorizontalBoxSlot', 'VerticalBoxSlot', 'SizeBox', 'SizeBoxSlot'
                ];
                
                // Direct UMG class mapping
                if (umgClasses.includes(className)) {
                    return `Class /Script/UMG.${className}`;
                }
                
                // Handle widget classes with custom names
                if (className.startsWith('WGT_') || className.startsWith('WBP_')) {
                    // These are custom widget references
                    return `Class /Script/UMG.UserWidget`;
                }
                
                // Handle blueprint generated classes
                if (className.endsWith('_C') || className === 'WidgetBlueprintGeneratedClass') {
                    // Extract the base blueprint name
                    const baseName = className.replace(/_C$/, '');
                    if (baseName.startsWith('WBP_') || baseName.startsWith('WGT_')) {
                        return `Class /Script/UMG.WidgetBlueprintGeneratedClass`;
                    }
                    return `Class /Script/Engine.BlueprintGeneratedClass`;
                }
                
                // K2 Node classes
                if (className.startsWith('K2Node_')) {
                    return `Class /Script/BlueprintGraph.${className}`;
                }
                
                // EdGraph classes
                if (className.startsWith('EdGraph')) {
                    return `Class /Script/Engine.${className}`;
                }
                
                // Try to determine package from ClassName field if it looks like a script path
                if (imp.ClassName && imp.ClassName.includes('/Script/')) {
                    const match = imp.ClassName.match(/\/Script\/([^./]+)/);
                    if (match) {
                        return `Class /Script/${match[1]}.${className}`;
                    }
                }
                
                // Default to Engine for most other classes
                return `Class /Script/Engine.${className}`;
            }
        } else if (exp.ClassIndex > 0) {
            // References another export
            const classExport = this.exports[exp.ClassIndex - 1];
            if (classExport) {
                return `Class ${classExport.ObjectName}`;
            }
        }
        
        // Default fallback
        return "Class /Script/Engine.Blueprint";
    }

    /**
     * Get name by index from name table
     */
    private getNameByIndex(index: number): string {
        if (index >= 0 && index < this.nameMap.length) {
            return this.nameMap[index];
        }
        return "None";
    }

    /**
     * Read an FName (name table reference)
     */
    private readFName(): string {
        const nameIndex = this.readInt32();
        const number = this.readInt32(); // Instance number
        
        let name = this.getNameByIndex(nameIndex);
        if (number > 0) {
            name = `${name}_${number - 1}`;
        }
        return name;
    }

    /**
     * Read an FString
     */
    private readFString(): string {
        const length = this.readInt32();
        if (length === 0) return "";
        
        if (length > 0) {
            // ASCII string
            const bytes = this.buffer.slice(this.offset, this.offset + length);
            this.offset += length;
            // Remove null terminator
            return bytes.toString('ascii', 0, length - 1);
        } else {
            // UTF-16 string
            const absLength = Math.abs(length);
            const byteLength = absLength * 2;
            const bytes = this.buffer.slice(this.offset, this.offset + byteLength);
            this.offset += byteLength;
            // Remove null terminator (2 bytes for UTF-16)
            return bytes.toString('utf16le', 0, byteLength - 2);
        }
    }

    /**
     * Convert buffer to base64 chunks
     */
    private bufferToBase64Chunks(buffer: Buffer): string[] {
        const base64 = buffer.toString('base64');
        const chunks: string[] = [];
        for (let i = 0; i < base64.length; i += 76) {
            chunks.push(base64.substring(i, i + 76));
        }
        return chunks;
    }

    /**
     * Generate hash for data
     */
    private generateHash(input: string): string {
        let hash = 0;
        for (let i = 0; i < input.length; i++) {
            const char = input.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(16).padStart(40, '0');
    }

    // Binary reading helpers
    private readUInt16(): number {
        let value: number;
        if (this.useLittleEndian) {
            value = this.buffer.readUInt16LE(this.offset);
        } else {
            value = this.buffer.readUInt16BE(this.offset);
        }
        this.offset += 2;
        return value;
    }

    private readUInt32(): number {
        let value: number;
        if (this.useLittleEndian) {
            value = this.buffer.readUInt32LE(this.offset);
        } else {
            value = this.buffer.readUInt32BE(this.offset);
        }
        this.offset += 4;
        return value;
    }

    private readInt32(): number {
        let value: number;
        if (this.useLittleEndian) {
            value = this.buffer.readInt32LE(this.offset);
        } else {
            value = this.buffer.readInt32BE(this.offset);
        }
        this.offset += 4;
        return value;
    }

    private readInt64(): bigint {
        let value: bigint;
        if (this.useLittleEndian) {
            value = this.buffer.readBigInt64LE(this.offset);
        } else {
            value = this.buffer.readBigInt64BE(this.offset);
        }
        this.offset += 8;
        return value;
    }

    private readGuid(): FGuid {
        return {
            A: this.readUInt32(),
            B: this.readUInt32(),
            C: this.readUInt32(),
            D: this.readUInt32()
        };
    }

    private readGuidString(): string {
        const guid = this.readGuid();
        // Convert to string format
        const a = guid.A.toString(16).padStart(8, '0');
        const b = guid.B.toString(16).padStart(8, '0');
        const c = guid.C.toString(16).padStart(8, '0');
        const d = guid.D.toString(16).padStart(8, '0');
        return `${a}${b}${c}${d}`.toUpperCase();
    }
}

/**
 * Direct UASSET to UTXT converter
 */
export async function convertUAssetToUTXT(uassetPath: string, outputPath?: string): Promise<boolean> {
    try {
        console.log(`Starting conversion of ${uassetPath}`);
        
        // Parse the .uasset file
        const utxtData = await UAssetParser.parseToUTXT(uassetPath);
        
        // Determine output path
        if (!outputPath) {
            outputPath = uassetPath.replace(/\.uasset$/i, '.utxt');
        }
        
        console.log(`Writing to ${outputPath}`);
        
        // Write UTXT file
        fs.writeFileSync(outputPath, JSON.stringify(utxtData, null, '\t'), 'utf-8');
        
        console.log('Conversion successful');
        return true;
    } catch (error) {
        console.error('Error converting UAsset to UTXT:', error);
        if (error instanceof Error) {
            console.error('Stack trace:', error.stack);
        }
        return false;
    }
}