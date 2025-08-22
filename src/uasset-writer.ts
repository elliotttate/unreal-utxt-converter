/**
 * UTXT to UASSET Binary Writer
 * Converts Unreal Engine Text Asset Format (UTXT) JSON back to binary .uasset files
 */

import * as fs from 'fs';
import * as path from 'path';

// UAsset file magic number
const PACKAGE_FILE_TAG = 0x9E2A83C1;

// UE4 Version enums
enum EUnrealEngineObjectUE4Version {
    VER_UE4_OLDEST_LOADABLE_PACKAGE = 214,
    VER_UE4_ADD_STRING_ASSET_REFERENCES_MAP = 384,
    VER_UE4_SERIALIZE_TEXT_IN_PACKAGES = 459,
    VER_UE4_ADDED_PACKAGE_SUMMARY_LOCALIZATION_ID = 510,
    VER_UE4_ADDED_SEARCHABLE_NAMES = 510,
    VER_UE4_WORLD_LEVEL_INFO = 518
}

interface UTXTData {
    GatherableTextData?: any[];
    Thumbnails?: {
        Thumbnails: any[];
        Index: any[];
    };
    Exports: { [key: string]: any };
}

interface FGuid {
    A: number;
    B: number;
    C: number;
    D: number;
}

class BufferWriter {
    private buffer: Buffer;
    private offset: number;
    private capacity: number;

    constructor(initialCapacity: number = 1024 * 1024) { // 1MB initial
        this.buffer = Buffer.alloc(initialCapacity);
        this.offset = 0;
        this.capacity = initialCapacity;
    }

    private ensureCapacity(additionalBytes: number) {
        while (this.offset + additionalBytes > this.capacity) {
            const newCapacity = this.capacity * 2;
            const newBuffer = Buffer.alloc(newCapacity);
            this.buffer.copy(newBuffer, 0, 0, this.offset);
            this.buffer = newBuffer;
            this.capacity = newCapacity;
        }
    }

    writeUInt8(value: number) {
        this.ensureCapacity(1);
        this.buffer.writeUInt8(value, this.offset);
        this.offset += 1;
    }

    writeUInt16(value: number) {
        this.ensureCapacity(2);
        this.buffer.writeUInt16LE(value, this.offset);
        this.offset += 2;
    }

    writeInt32(value: number) {
        this.ensureCapacity(4);
        this.buffer.writeInt32LE(value, this.offset);
        this.offset += 4;
    }

    writeUInt32(value: number) {
        this.ensureCapacity(4);
        this.buffer.writeUInt32LE(value, this.offset);
        this.offset += 4;
    }

    writeInt64(value: bigint) {
        this.ensureCapacity(8);
        this.buffer.writeBigInt64LE(value, this.offset);
        this.offset += 8;
    }

    writeFString(str: string) {
        if (!str || str.length === 0) {
            this.writeInt32(0);
            return;
        }

        // Check if string contains non-ASCII characters
        const isUnicode = /[^\x00-\x7F]/.test(str);
        
        if (isUnicode) {
            // Write as UTF-16
            const strBuffer = Buffer.from(str + '\0', 'utf16le');
            this.writeInt32(-(strBuffer.length / 2)); // Negative for unicode
            this.writeBytes(strBuffer);
        } else {
            // Write as ASCII
            const strBuffer = Buffer.from(str + '\0', 'ascii');
            this.writeInt32(strBuffer.length);
            this.writeBytes(strBuffer);
        }
    }

    writeFName(nameIndex: number, instanceNumber: number = 0) {
        this.writeInt32(nameIndex);
        this.writeInt32(instanceNumber);
    }

    writeGuid(guid: FGuid) {
        this.writeUInt32(guid.A);
        this.writeUInt32(guid.B);
        this.writeUInt32(guid.C);
        this.writeUInt32(guid.D);
    }

    writeBytes(buffer: Buffer) {
        this.ensureCapacity(buffer.length);
        buffer.copy(this.buffer, this.offset);
        this.offset += buffer.length;
    }

    getBuffer(): Buffer {
        return this.buffer.slice(0, this.offset);
    }

    getOffset(): number {
        return this.offset;
    }

    setOffset(offset: number) {
        this.offset = offset;
    }
}

export class UAssetWriter {
    private nameMap: Map<string, number>;
    private importMap: Map<string, number>;
    private exportMap: Map<string, number>;
    private writer: BufferWriter;

    constructor() {
        this.nameMap = new Map();
        this.importMap = new Map();
        this.exportMap = new Map();
        this.writer = new BufferWriter();
    }

    /**
     * Convert UTXT JSON to UASSET binary
     */
    public static async convertToUAsset(utxtPath: string, outputPath?: string): Promise<boolean> {
        try {
            console.log(`Reading UTXT file: ${utxtPath}`);
            const utxtContent = fs.readFileSync(utxtPath, 'utf-8');
            
            let utxtData: UTXTData;
            try {
                utxtData = JSON.parse(utxtContent);
            } catch (parseError) {
                console.error('Failed to parse UTXT JSON:', parseError);
                return false;
            }
            
            // Validate UTXT structure
            if (!utxtData.Exports || typeof utxtData.Exports !== 'object') {
                console.error('Invalid UTXT format: Missing or invalid Exports section');
                return false;
            }
            
            if (Object.keys(utxtData.Exports).length === 0) {
                console.error('Invalid UTXT format: No exports found');
                return false;
            }
            
            console.log(`Found ${Object.keys(utxtData.Exports).length} exports to convert`);
            
            if (!outputPath) {
                outputPath = utxtPath.replace(/\.utxt$/i, '.uasset');
            }
            
            const writer = new UAssetWriter();
            const buffer = writer.write(utxtData);
            
            console.log(`Writing UASSET file: ${outputPath} (${buffer.length} bytes)`);
            fs.writeFileSync(outputPath, buffer);
            
            console.log('Conversion successful');
            return true;
        } catch (error) {
            console.error('Error converting UTXT to UASSET:', error);
            if (error instanceof Error) {
                console.error('Stack trace:', error.stack);
            }
            return false;
        }
    }

    /**
     * Write UTXT data to binary UASSET format
     */
    private write(utxtData: UTXTData): Buffer {
        try {
            console.log('Building name map...');
            // Build name map from exports
            this.buildNameMap(utxtData);
            console.log(`Name map built: ${this.nameMap.size} names`);
            
            console.log('Building import map...');
            // Build import map from exports
            this.buildImportMap(utxtData);
            console.log(`Import map built: ${this.importMap.size} imports`);
            
            // Reserve space for package summary (will write later)
            const summarySize = 1024; // Increased size for safety
            this.writer.setOffset(summarySize);
            
            console.log('Writing name table...');
            // Write name table
            const nameTableOffset = this.writer.getOffset();
            this.writeNameTable();
            console.log(`Name table written at offset ${nameTableOffset}`);
            
            console.log('Writing import table...');
            // Write import table
            const importTableOffset = this.writer.getOffset();
            this.writeImportTable(utxtData);
            console.log(`Import table written at offset ${importTableOffset}`);
            
            console.log('Writing export table...');
            // Write export table and data
            const exportTableOffset = this.writer.getOffset();
            const exportDataOffsets = this.writeExportTable(utxtData);
            console.log(`Export table written at offset ${exportTableOffset}`);
            
            // Export data is now written inline with the export table in writeExportTable
            
            // Calculate total header size
            const totalHeaderSize = this.writer.getOffset();
            console.log(`Total size: ${totalHeaderSize} bytes`);
            
            console.log('Writing package summary...');
            // Save the current end position
            const endOffset = this.writer.getOffset();
            
            // Go back and write package summary
            this.writer.setOffset(0);
            this.writePackageSummary(
                nameTableOffset,
                this.nameMap.size,
                importTableOffset,
                this.importMap.size,
                exportTableOffset,
                Object.keys(utxtData.Exports).length,
                totalHeaderSize
            );
            
            // Restore position to end of file
            this.writer.setOffset(endOffset);
            
            return this.writer.getBuffer();
        } catch (error) {
            console.error('Error in write method:', error);
            throw error;
        }
    }

    /**
     * Build name map from UTXT data
     */
    private buildNameMap(utxtData: UTXTData) {
        const names = new Set<string>();
        
        // Add common engine names
        names.add("None");
        names.add("Class");
        names.add("Package");
        names.add("Object");
        names.add("Blueprint");
        names.add("Engine");
        names.add("CoreUObject");
        
        // Extract names from exports
        for (const exportName in utxtData.Exports) {
            names.add(exportName);
            this.extractNamesFromObject(utxtData.Exports[exportName], names);
        }
        
        // Build map with indices
        let index = 0;
        for (const name of names) {
            this.nameMap.set(name, index++);
        }
    }

    /**
     * Extract names from object recursively
     */
    private extractNamesFromObject(obj: any, names: Set<string>) {
        if (!obj || typeof obj !== 'object') return;
        
        for (const key in obj) {
            if (typeof key === 'string') {
                names.add(key);
            }
            
            const value = obj[key];
            if (typeof value === 'string') {
                names.add(value);
            } else if (typeof value === 'object') {
                this.extractNamesFromObject(value, names);
            }
        }
    }

    /**
     * Build import map from UTXT data
     */
    private buildImportMap(utxtData: UTXTData) {
        let index = -1; // Imports use negative indices
        
        // Add common imports
        const commonImports = [
            { ClassPackage: "CoreUObject", ClassName: "Class", ObjectName: "Object" },
            { ClassPackage: "Engine", ClassName: "Class", ObjectName: "Blueprint" },
            { ClassPackage: "Engine", ClassName: "Class", ObjectName: "SceneComponent" },
            { ClassPackage: "Engine", ClassName: "Class", ObjectName: "SimpleConstructionScript" }
        ];
        
        for (const imp of commonImports) {
            const key = `${imp.ClassPackage}.${imp.ClassName}.${imp.ObjectName}`;
            this.importMap.set(key, index--);
        }
        
        // Extract imports from exports
        for (const exportName in utxtData.Exports) {
            const exportData = utxtData.Exports[exportName];
            if (exportData.__Class) {
                const classPath = exportData.__Class.replace("Class ", "").replace("/Script/", "");
                if (!this.importMap.has(classPath)) {
                    this.importMap.set(classPath, index--);
                }
            }
        }
    }

    /**
     * Write package summary
     */
    private writePackageSummary(
        nameOffset: number,
        nameCount: number,
        importOffset: number,
        importCount: number,
        exportOffset: number,
        exportCount: number,
        totalHeaderSize: number
    ) {
        // Magic number
        this.writer.writeUInt32(PACKAGE_FILE_TAG);
        
        // File versions
        this.writer.writeInt32(-7); // LegacyFileVersion
        this.writer.writeInt32(864); // LegacyUE3Version
        this.writer.writeInt32(522); // FileVersionUE4 (4.27)
        this.writer.writeInt32(0); // FileVersionLicenseeUE4
        
        // Custom versions
        this.writer.writeInt32(0); // CustomVersionCount
        
        // Header info
        this.writer.writeInt32(totalHeaderSize);
        this.writer.writeFString("None"); // FolderName
        this.writer.writeUInt32(0); // PackageFlags
        
        // Name table
        this.writer.writeInt32(nameCount);
        this.writer.writeInt32(nameOffset);
        
        // Localization
        this.writer.writeFString(""); // LocalizationId
        
        // Gatherable text
        this.writer.writeInt32(0); // GatherableTextDataCount
        this.writer.writeInt32(0); // GatherableTextDataOffset
        
        // Export/Import tables
        this.writer.writeInt32(exportCount);
        this.writer.writeInt32(exportOffset);
        this.writer.writeInt32(importCount);
        this.writer.writeInt32(importOffset);
        
        // Depends
        this.writer.writeInt32(0); // DependsOffset
        
        // String asset references
        this.writer.writeInt32(0); // SoftPackageReferencesCount
        this.writer.writeInt32(0); // SoftPackageReferencesOffset
        
        // Searchable names
        this.writer.writeInt32(0); // SearchableNamesOffset
        
        // Thumbnails
        this.writer.writeInt32(0); // ThumbnailTableOffset
        
        // GUID
        this.writer.writeGuid({ A: 0, B: 0, C: 0, D: 0 });
        
        // Generations
        this.writer.writeInt32(1); // GenerationsCount
        this.writer.writeInt32(exportCount); // ExportCount
        this.writer.writeInt32(nameCount); // NameCount
        
        // Engine version
        this.writer.writeUInt16(4); // Major
        this.writer.writeUInt16(27); // Minor
        this.writer.writeUInt16(2); // Patch
        this.writer.writeUInt32(0); // Changelist
        this.writer.writeFString(""); // Branch
        
        // Compatible engine version
        this.writer.writeUInt16(4); // Major
        this.writer.writeUInt16(27); // Minor
        this.writer.writeUInt16(2); // Patch
        this.writer.writeUInt32(0); // Changelist
        this.writer.writeFString(""); // Branch
        
        // Compression
        this.writer.writeUInt32(0); // CompressionFlags
        this.writer.writeInt32(0); // CompressedChunksCount
        
        // Package source
        this.writer.writeUInt32(0); // PackageSource
        
        // Additional packages
        this.writer.writeInt32(0); // AdditionalPackagesToCookCount
        
        // Asset registry
        this.writer.writeInt32(0); // AssetRegistryDataOffset
        
        // Bulk data
        this.writer.writeInt64(BigInt(totalHeaderSize)); // BulkDataStartOffset
        
        // World tile info
        this.writer.writeInt32(0); // WorldTileInfoDataOffset
        
        // Chunk IDs
        this.writer.writeInt32(0); // ChunkIDsCount
        
        // Preload dependencies
        this.writer.writeInt32(0); // PreloadDependencyCount
        this.writer.writeInt32(0); // PreloadDependencyOffset
    }

    /**
     * Write name table
     */
    private writeNameTable() {
        for (const [name, index] of this.nameMap.entries()) {
            this.writer.writeFString(name);
            // Write hash values (UE4.12+)
            this.writer.writeUInt16(0); // NonCasePreservingHash
            this.writer.writeUInt16(0); // CasePreservingHash
        }
    }

    /**
     * Write import table
     */
    private writeImportTable(utxtData: UTXTData) {
        for (const [importPath, index] of this.importMap.entries()) {
            const parts = importPath.split('.');
            const classPackage = parts[0] || "CoreUObject";
            const className = parts[1] || "Class";
            const objectName = parts[2] || "Object";
            
            this.writer.writeFName(this.getOrAddName(classPackage), 0);
            this.writer.writeFName(this.getOrAddName(className), 0);
            this.writer.writeInt32(0); // OuterIndex
            this.writer.writeFName(this.getOrAddName(objectName), 0);
        }
    }

    /**
     * Write export table
     */
    private writeExportTable(utxtData: UTXTData): Map<string, number> {
        const exportDataOffsets = new Map<string, number>();
        let exportIndex = 0;
        
        // First pass: write export table entries
        const exportTableStart = this.writer.getOffset();
        const exportOffsetPositions: Array<[string, number]> = [];
        
        for (const exportName in utxtData.Exports) {
            const exportData = utxtData.Exports[exportName];
            
            // Get class index from imports
            let classIndex = -1; // Default to first import
            if (exportData.__Class) {
                const classPath = exportData.__Class.replace("Class ", "").replace("/Script/", "");
                for (const [path, idx] of this.importMap.entries()) {
                    if (path.includes(classPath)) {
                        classIndex = idx;
                        break;
                    }
                }
            }
            
            // Write export entry
            this.writer.writeInt32(classIndex); // ClassIndex
            this.writer.writeInt32(0); // SuperIndex  
            this.writer.writeInt32(0); // TemplateIndex
            this.writer.writeInt32(0); // OuterIndex
            this.writer.writeFName(this.getOrAddName(exportName), 0); // ObjectName
            this.writer.writeInt32(0); // Save
            
            // Reserve space for SerialSize and SerialOffset (will update later)
            const serialInfoOffset = this.writer.getOffset();
            this.writer.writeInt64(BigInt(0)); // SerialSize (placeholder)
            this.writer.writeInt64(BigInt(0)); // SerialOffset (placeholder)
            
            exportOffsetPositions.push([exportName, serialInfoOffset]);
            
            // Export flags
            this.writer.writeInt32(exportData.__bForcedExport ? 1 : 0);
            this.writer.writeInt32(exportData.__bNotForClient ? 1 : 0);
            this.writer.writeInt32(exportData.__bNotForServer ? 1 : 0);
            
            // GUID
            this.writer.writeGuid({ A: 0, B: 0, C: 0, D: 0 }); // PackageGuid
            
            // Flags
            this.writer.writeUInt32(exportData.__ObjectFlags || 0); // PackageFlags
            this.writer.writeInt32(0); // bNotAlwaysLoadedForEditorGame
            this.writer.writeInt32(exportData.__bIsAsset ? 1 : 0); // bIsAsset
            
            // Dependencies
            this.writer.writeInt32(-1); // FirstExportDependency
            this.writer.writeInt32(0); // SerializationBeforeSerializationDependencies
            this.writer.writeInt32(0); // CreateBeforeSerializationDependencies
            this.writer.writeInt32(0); // SerializationBeforeCreateDependencies
            this.writer.writeInt32(0); // CreateBeforeCreateDependencies
            
            exportIndex++;
        }
        
        // Second pass: write actual export data and update offsets
        for (const [exportName, offsetPos] of exportOffsetPositions) {
            const exportData = utxtData.Exports[exportName];
            const dataOffset = this.writer.getOffset();
            
            // Write the actual export data
            this.writeExportDataDirect(exportData);
            
            const dataEndOffset = this.writer.getOffset();
            const dataSize = dataEndOffset - dataOffset;
            
            // Go back and update the size/offset in the export table
            const currentPos = this.writer.getOffset();
            this.writer.setOffset(offsetPos);
            this.writer.writeInt64(BigInt(dataSize));
            this.writer.writeInt64(BigInt(dataOffset));
            this.writer.setOffset(currentPos);
            
            exportDataOffsets.set(exportName, offsetPos);
        }
        
        return exportDataOffsets;
    }
    
    /**
     * Write export data directly (without offset updating)
     */
    private writeExportDataDirect(exportData: any) {
        console.log(`Writing export data...`);
        
        let dataWritten = false;
        
        // First check if we have Properties that need to be serialized
        if (exportData.__Value?.Properties) {
            console.log('Found Properties object, need to serialize back to binary');
            // For now, look for RawData fallback
            if (exportData.__Value.RawData?.Base64) {
                const base64Data = exportData.__Value.RawData.Base64;
                const combinedBase64 = Array.isArray(base64Data) ? base64Data.join('') : base64Data;
                try {
                    const buffer = Buffer.from(combinedBase64, 'base64');
                    console.log(`Writing ${buffer.length} bytes from RawData`);
                    this.writer.writeBytes(buffer);
                    dataWritten = true;
                } catch (err) {
                    console.error('Failed to decode RawData Base64:', err);
                }
            }
        }
        
        if (!dataWritten) {
            // Check all possible locations for Base64 data
            const possibleBase64Locations = [
                exportData.__Value?.RawData?.Base64,
                exportData.__Value?.BaseClassAutoGen?.Data?.Base64,
                exportData.__Value?.Data?.Base64,
                exportData.RawData?.Base64,
                exportData.BaseClassAutoGen?.Data?.Base64,
                exportData.Data?.Base64
            ];
            
            for (const base64Data of possibleBase64Locations) {
                if (base64Data) {
                    console.log(`Found Base64 data (${Array.isArray(base64Data) ? `${base64Data.length} chunks` : 'string'})`);
                    const combinedBase64 = Array.isArray(base64Data) ? base64Data.join('') : base64Data;
                    
                    // Remove any "Base64:" prefix if present
                    const cleanBase64 = combinedBase64.replace(/^Base64:/, '');
                    
                    if (cleanBase64.length > 0) {
                        try {
                            const buffer = Buffer.from(cleanBase64, 'base64');
                            console.log(`Writing ${buffer.length} bytes of decoded data`);
                            this.writer.writeBytes(buffer);
                            dataWritten = true;
                            break;
                        } catch (err) {
                            console.error('Failed to decode Base64:', err);
                        }
                    }
                }
            }
        }
        
        // If no base64 data found, write minimal data
        if (!dataWritten) {
            console.log('No Base64 data found, writing minimal property terminator');
            // Write property terminator (None)
            this.writer.writeFName(this.getOrAddName("None"), 0);
        }
    }


    /**
     * Get or add name to name map
     */
    private getOrAddName(name: string): number {
        if (this.nameMap.has(name)) {
            return this.nameMap.get(name)!;
        }
        const index = this.nameMap.size;
        this.nameMap.set(name, index);
        return index;
    }
}