/**
 * Unreal Engine Property Serializer
 * Handles serialization and deserialization of UE4 property data
 */

import * as fs from 'fs';

// Property type enums based on UE4
enum EPropertyType {
    BoolProperty = 'BoolProperty',
    IntProperty = 'IntProperty',
    FloatProperty = 'FloatProperty',
    ObjectProperty = 'ObjectProperty',
    NameProperty = 'NameProperty',
    StrProperty = 'StrProperty',
    StructProperty = 'StructProperty',
    ArrayProperty = 'ArrayProperty',
    MapProperty = 'MapProperty',
    ByteProperty = 'ByteProperty',
    TextProperty = 'TextProperty',
    EnumProperty = 'EnumProperty',
    SoftObjectProperty = 'SoftObjectProperty',
    DelegateProperty = 'DelegateProperty',
    MulticastDelegateProperty = 'MulticastDelegateProperty',
    InterfaceProperty = 'InterfaceProperty',
    FieldPathProperty = 'FieldPathProperty',
    DoubleProperty = 'DoubleProperty',
    Int64Property = 'Int64Property',
    Int16Property = 'Int16Property',
    Int8Property = 'Int8Property',
    UInt64Property = 'UInt64Property',
    UInt32Property = 'UInt32Property',
    UInt16Property = 'UInt16Property'
}

export interface FPropertyTag {
    Name: string;
    Type: string;
    Size: number;
    ArrayIndex: number;
    StructName?: string;
    StructGuid?: string;
    BoolVal?: boolean;
    EnumName?: string;
    InnerType?: string;
    ValueType?: string;
    HasPropertyGuid: boolean;
    PropertyGuid?: string;
}

export class PropertySerializer {
    private buffer: Buffer;
    private offset: number;
    private nameMap: string[];
    private importMap: any[];
    private exportMap: any[];

    constructor(buffer: Buffer, nameMap: string[], importMap: any[] = [], exportMap: any[] = []) {
        this.buffer = buffer;
        this.offset = 0;
        this.nameMap = nameMap;
        this.importMap = importMap;
        this.exportMap = exportMap;
    }

    /**
     * Deserialize properties from binary data to UTXT format
     */
    public deserializeProperties(): any {
        const properties: any = {};
        
        try {
            while (this.offset < this.buffer.length) {
                // Read property tag
                const tag = this.readPropertyTag();
                
                if (!tag || tag.Name === 'None' || tag.Name === '') {
                    // End of properties
                    break;
                }
                
                // Read property value based on type
                const value = this.readPropertyValue(tag);
                
                // Convert to UTXT format
                properties[tag.Name] = this.convertToUTXTFormat(value, tag);
            }
        } catch (error) {
            console.error('Error deserializing properties:', error);
        }
        
        return { Properties: properties };
    }

    /**
     * Read a property tag from the buffer
     */
    private readPropertyTag(): FPropertyTag | null {
        // Read property name (index + instance number)
        const nameIndex = this.readInt32();
        if (nameIndex < 0 || nameIndex >= this.nameMap.length) {
            return null;
        }
        
        const nameInstance = this.readInt32(); // Instance number (usually 0)
        
        const name = this.nameMap[nameIndex];
        if (name === 'None' || name === '') {
            return null;
        }
        
        // Read property type (index + instance number)
        const typeIndex = this.readInt32();
        if (typeIndex < 0 || typeIndex >= this.nameMap.length) {
            return null;
        }
        
        const typeInstance = this.readInt32(); // Instance number (usually 0)
        
        const type = this.nameMap[typeIndex];
        
        // Debug
        if (this.offset < 100) {
            console.log(`Property tag at offset ${this.offset - 24}:`);
            console.log(`  Name: [${nameIndex}] = "${name}"`); 
            console.log(`  Type: [${typeIndex}] = "${type}"`);
        }
        
        // Read property size
        const size = this.readInt32();
        
        // Read array index
        const arrayIndex = this.readInt32();
        
        const tag: FPropertyTag = {
            Name: name,
            Type: type,
            Size: size,
            ArrayIndex: arrayIndex,
            HasPropertyGuid: false
        };
        
        // Read type-specific data
        switch (type) {
            case 'StructProperty':
                tag.StructName = this.readName();
                // Read struct GUID (16 bytes)
                const guidBytes = this.readBytes(16);
                tag.StructGuid = this.bytesToHex(guidBytes);
                tag.HasPropertyGuid = this.readBool();
                if (tag.HasPropertyGuid) {
                    tag.PropertyGuid = this.bytesToHex(this.readBytes(16));
                }
                break;
                
            case 'BoolProperty':
                tag.BoolVal = this.readBool();
                tag.HasPropertyGuid = this.readBool();
                if (tag.HasPropertyGuid) {
                    tag.PropertyGuid = this.bytesToHex(this.readBytes(16));
                }
                break;
                
            case 'ByteProperty':
            case 'EnumProperty':
                tag.EnumName = this.readName();
                tag.HasPropertyGuid = this.readBool();
                if (tag.HasPropertyGuid) {
                    tag.PropertyGuid = this.bytesToHex(this.readBytes(16));
                }
                break;
                
            case 'ArrayProperty':
                tag.InnerType = this.readName();
                tag.HasPropertyGuid = this.readBool();
                if (tag.HasPropertyGuid) {
                    tag.PropertyGuid = this.bytesToHex(this.readBytes(16));
                }
                break;
                
            case 'MapProperty':
                tag.InnerType = this.readName();
                tag.ValueType = this.readName();
                tag.HasPropertyGuid = this.readBool();
                if (tag.HasPropertyGuid) {
                    tag.PropertyGuid = this.bytesToHex(this.readBytes(16));
                }
                break;
                
            default:
                tag.HasPropertyGuid = this.readBool();
                if (tag.HasPropertyGuid) {
                    tag.PropertyGuid = this.bytesToHex(this.readBytes(16));
                }
                break;
        }
        
        return tag;
    }

    /**
     * Read property value based on tag type
     */
    private readPropertyValue(tag: FPropertyTag): any {
        const startOffset = this.offset;
        let value: any;
        
        switch (tag.Type) {
            case 'BoolProperty':
                // Bool value is stored in the tag
                value = tag.BoolVal;
                break;
                
            case 'ByteProperty':
                if (tag.EnumName && tag.EnumName !== 'None') {
                    value = this.readName(); // Enum value
                } else {
                    value = this.readUInt8();
                }
                break;
                
            case 'IntProperty':
            case 'Int32Property':
                value = this.readInt32();
                break;
                
            case 'Int64Property':
                value = this.readInt64();
                break;
                
            case 'Int16Property':
                value = this.readInt16();
                break;
                
            case 'Int8Property':
                value = this.readInt8();
                break;
                
            case 'UInt32Property':
                value = this.readUInt32();
                break;
                
            case 'UInt64Property':
                value = this.readUInt64();
                break;
                
            case 'UInt16Property':
                value = this.readUInt16();
                break;
                
            case 'FloatProperty':
                value = this.readFloat();
                break;
                
            case 'DoubleProperty':
                value = this.readDouble();
                break;
                
            case 'NameProperty':
                value = this.readName();
                break;
                
            case 'StrProperty':
            case 'TextProperty':
                value = this.readString();
                break;
                
            case 'ObjectProperty':
            case 'InterfaceProperty':
                value = this.readObjectReference();
                break;
                
            case 'SoftObjectProperty':
                value = {
                    AssetPathName: this.readName(),
                    SubPathString: this.readString()
                };
                break;
                
            case 'StructProperty':
                value = this.readStruct(tag);
                break;
                
            case 'ArrayProperty':
                value = this.readArray(tag);
                break;
                
            case 'MapProperty':
                value = this.readMap(tag);
                break;
                
            case 'DelegateProperty':
                value = {
                    Object: this.readObjectReference(),
                    FunctionName: this.readName()
                };
                break;
                
            case 'MulticastDelegateProperty':
                const count = this.readInt32();
                value = [];
                for (let i = 0; i < count; i++) {
                    value.push({
                        Object: this.readObjectReference(),
                        FunctionName: this.readName()
                    });
                }
                break;
                
            default:
                // Unknown property type - read as raw bytes
                console.warn(`Unknown property type: ${tag.Type}`);
                value = this.readBytes(tag.Size);
                break;
        }
        
        // Verify we read the correct amount
        const bytesRead = this.offset - startOffset;
        if (bytesRead !== tag.Size && tag.Type !== 'BoolProperty') {
            console.warn(`Property size mismatch for ${tag.Name}: expected ${tag.Size}, read ${bytesRead}`);
        }
        
        return value;
    }

    /**
     * Read a struct property
     */
    private readStruct(tag: FPropertyTag): any {
        const struct: any = {};
        
        // Special handling for known struct types
        switch (tag.StructName) {
            case 'Vector':
            case 'Vector3f':
                struct.X = this.readFloat();
                struct.Y = this.readFloat();
                struct.Z = this.readFloat();
                break;
                
            case 'Vector2D':
            case 'Vector2f':
                struct.X = this.readFloat();
                struct.Y = this.readFloat();
                break;
                
            case 'Vector4':
            case 'Vector4f':
                struct.X = this.readFloat();
                struct.Y = this.readFloat();
                struct.Z = this.readFloat();
                struct.W = this.readFloat();
                break;
                
            case 'Rotator':
                struct.Pitch = this.readFloat();
                struct.Yaw = this.readFloat();
                struct.Roll = this.readFloat();
                break;
                
            case 'Quat':
                struct.X = this.readFloat();
                struct.Y = this.readFloat();
                struct.Z = this.readFloat();
                struct.W = this.readFloat();
                break;
                
            case 'Color':
                struct.B = this.readUInt8();
                struct.G = this.readUInt8();
                struct.R = this.readUInt8();
                struct.A = this.readUInt8();
                break;
                
            case 'LinearColor':
                struct.R = this.readFloat();
                struct.G = this.readFloat();
                struct.B = this.readFloat();
                struct.A = this.readFloat();
                break;
                
            case 'Transform':
                struct.Rotation = {
                    X: this.readFloat(),
                    Y: this.readFloat(),
                    Z: this.readFloat(),
                    W: this.readFloat()
                };
                struct.Translation = {
                    X: this.readFloat(),
                    Y: this.readFloat(),
                    Z: this.readFloat()
                };
                struct.Scale3D = {
                    X: this.readFloat(),
                    Y: this.readFloat(),
                    Z: this.readFloat()
                };
                break;
                
            case 'Guid':
                struct.A = this.readUInt32();
                struct.B = this.readUInt32();
                struct.C = this.readUInt32();
                struct.D = this.readUInt32();
                break;
                
            case 'DateTime':
                struct.Ticks = this.readInt64();
                break;
                
            case 'Timespan':
                struct.Ticks = this.readInt64();
                break;
                
            case 'Margin':
                struct.Left = this.readFloat();
                struct.Top = this.readFloat();
                struct.Right = this.readFloat();
                struct.Bottom = this.readFloat();
                break;
                
            default:
                // Generic struct - read as nested properties
                const nestedSerializer = new PropertySerializer(
                    this.buffer.slice(this.offset, this.offset + tag.Size),
                    this.nameMap,
                    this.importMap,
                    this.exportMap
                );
                struct.Properties = nestedSerializer.deserializeProperties().Properties;
                this.offset += tag.Size;
                break;
        }
        
        return struct;
    }

    /**
     * Read an array property
     */
    private readArray(tag: FPropertyTag): any[] {
        const count = this.readInt32();
        const array: any[] = [];
        
        for (let i = 0; i < count; i++) {
            switch (tag.InnerType) {
                case 'ObjectProperty':
                    array.push(this.readObjectReference());
                    break;
                case 'NameProperty':
                    array.push(this.readName());
                    break;
                case 'StrProperty':
                    array.push(this.readString());
                    break;
                case 'IntProperty':
                    array.push(this.readInt32());
                    break;
                case 'FloatProperty':
                    array.push(this.readFloat());
                    break;
                case 'BoolProperty':
                    array.push(this.readBool());
                    break;
                case 'ByteProperty':
                    array.push(this.readUInt8());
                    break;
                case 'StructProperty':
                    // Need to read struct properties
                    const structTag: FPropertyTag = {
                        Name: '',
                        Type: 'StructProperty',
                        Size: 0, // Will be determined
                        ArrayIndex: 0,
                        StructName: tag.StructName,
                        HasPropertyGuid: false
                    };
                    array.push(this.readStruct(structTag));
                    break;
                default:
                    console.warn(`Unknown array inner type: ${tag.InnerType}`);
                    break;
            }
        }
        
        return array;
    }

    /**
     * Read a map property
     */
    private readMap(tag: FPropertyTag): Map<any, any> {
        const count = this.readInt32();
        const map = new Map();
        
        // Skip for now - maps are complex
        console.warn('Map properties not fully implemented');
        
        return map;
    }

    /**
     * Convert property value to UTXT format
     */
    private convertToUTXTFormat(value: any, tag: FPropertyTag): any {
        // Debug problematic types
        if (tag.Type && tag.Type.includes('/')) {
            console.log(`WARNING: Tag type contains path: ${tag.Type}, should be property type like ArrayProperty`);
        }
        
        const result: any = {
            __Type: tag.Type
        };
        
        if (tag.Type === 'ArrayProperty' && tag.InnerType) {
            result.__InnerType = tag.InnerType;
        }
        
        if (tag.Type === 'StructProperty' && tag.StructName) {
            result.__StructName = tag.StructName;
        }
        
        if (tag.Type === 'ObjectProperty' && typeof value === 'number') {
            // Convert object index to readable reference
            result.__Value = this.resolveObjectReference(value);
        } else {
            result.__Value = value;
        }
        
        return result;
    }

    /**
     * Resolve object reference index to string
     */
    private resolveObjectReference(index: number): string {
        if (index === 0) {
            return "None";
        } else if (index > 0) {
            // Export reference
            const exportIndex = index - 1;
            if (exportIndex < this.exportMap.length) {
                const exp = this.exportMap[exportIndex];
                return `Object:${exp.ClassName} /Game/${exp.ObjectName}`;
            }
        } else {
            // Import reference
            const importIndex = Math.abs(index) - 1;
            if (importIndex < this.importMap.length) {
                const imp = this.importMap[importIndex];
                return `Object:${imp.ClassName} ${imp.ObjectName}`;
            }
        }
        return `ObjectIndex:${index}`;
    }

    /**
     * Read an object reference
     */
    private readObjectReference(): number {
        return this.readInt32();
    }

    // Binary reading helpers
    private readInt8(): number {
        const value = this.buffer.readInt8(this.offset);
        this.offset += 1;
        return value;
    }

    private readUInt8(): number {
        const value = this.buffer.readUInt8(this.offset);
        this.offset += 1;
        return value;
    }

    private readInt16(): number {
        const value = this.buffer.readInt16LE(this.offset);
        this.offset += 2;
        return value;
    }

    private readUInt16(): number {
        const value = this.buffer.readUInt16LE(this.offset);
        this.offset += 2;
        return value;
    }

    private readInt32(): number {
        const value = this.buffer.readInt32LE(this.offset);
        this.offset += 4;
        return value;
    }

    private readUInt32(): number {
        const value = this.buffer.readUInt32LE(this.offset);
        this.offset += 4;
        return value;
    }

    private readInt64(): bigint {
        const value = this.buffer.readBigInt64LE(this.offset);
        this.offset += 8;
        return value;
    }

    private readUInt64(): bigint {
        const value = this.buffer.readBigUInt64LE(this.offset);
        this.offset += 8;
        return value;
    }

    private readFloat(): number {
        const value = this.buffer.readFloatLE(this.offset);
        this.offset += 4;
        return value;
    }

    private readDouble(): number {
        const value = this.buffer.readDoubleLE(this.offset);
        this.offset += 8;
        return value;
    }

    private readBool(): boolean {
        return this.readUInt8() !== 0;
    }

    private readName(): string {
        const nameIndex = this.readInt32();
        const instanceNumber = this.readInt32();
        
        if (nameIndex >= 0 && nameIndex < this.nameMap.length) {
            let name = this.nameMap[nameIndex];
            if (instanceNumber > 0) {
                name = `${name}_${instanceNumber - 1}`;
            }
            return name;
        }
        return "None";
    }

    private readString(): string {
        const length = this.readInt32();
        if (length === 0) return "";
        
        if (length > 0) {
            // ASCII string
            const bytes = this.readBytes(length);
            return bytes.toString('ascii', 0, length - 1); // Exclude null terminator
        } else {
            // UTF-16 string
            const absLength = Math.abs(length);
            const bytes = this.readBytes(absLength * 2);
            return bytes.toString('utf16le', 0, (absLength - 1) * 2); // Exclude null terminator
        }
    }

    private readBytes(count: number): Buffer {
        const bytes = this.buffer.slice(this.offset, this.offset + count);
        this.offset += count;
        return bytes;
    }

    private bytesToHex(bytes: Buffer): string {
        return bytes.toString('hex').toUpperCase();
    }
}