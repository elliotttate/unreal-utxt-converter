// The module 'vscode' contains the VS Code extensibility API
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { convertUAssetToUTXT } from "./uasset-parser-fixed";
import { UAssetWriter } from "./uasset-writer";

// This method is called when your extension is activated
export function activate(context: vscode.ExtensionContext) {
  console.log('Unreal UTXT Converter activated');

  // Register command: UAsset to UTXT (Direct Binary Parser)
  let disposable1 = vscode.commands.registerCommand(
    "unrealutxt.toUTXT",
    async (uri: vscode.Uri) => {
      if (!uri || !uri.fsPath) {
        vscode.window.showErrorMessage("No file selected");
        return;
      }
      
      if (!uri.fsPath.endsWith(".uasset")) {
        vscode.window.showErrorMessage("This command only works with .uasset files");
        return;
      }
      
      const outputChannel = vscode.window.createOutputChannel("Unreal UTXT Converter");
      outputChannel.show();
      outputChannel.appendLine(`Converting ${path.basename(uri.fsPath)} to UTXT...`);
      
      // Capture console output
      const originalLog = console.log;
      const originalError = console.error;
      console.log = (...args: any[]) => {
        outputChannel.appendLine(`[LOG] ${args.join(' ')}`);
        originalLog(...args);
      };
      console.error = (...args: any[]) => {
        outputChannel.appendLine(`[ERROR] ${args.join(' ')}`);
        originalError(...args);
      };
      
      vscode.window.showInformationMessage("Converting to UTXT format...");
      
      const outputPath = uri.fsPath.replace(/\.uasset$/i, ".utxt");
      
      try {
        const success = await convertUAssetToUTXT(uri.fsPath, outputPath);
        
        if (success) {
          outputChannel.appendLine(`✓ Successfully created: ${outputPath}`);
          vscode.window.showInformationMessage(`✓ Created UTXT: ${path.basename(outputPath)}`);
          
          // Open the file
          const doc = await vscode.workspace.openTextDocument(outputPath);
          await vscode.window.showTextDocument(doc);
          await vscode.commands.executeCommand('editor.action.formatDocument');
        } else {
          outputChannel.appendLine(`✗ Failed to convert file`);
          vscode.window.showErrorMessage("Failed to convert to UTXT format. Check Output panel for details.");
        }
      } catch (error: any) {
        outputChannel.appendLine(`Error: ${error.message}`);
        if (error.stack) {
          outputChannel.appendLine(`Stack: ${error.stack}`);
        }
        vscode.window.showErrorMessage(`Conversion error: ${error.message}`);
      } finally {
        // Restore console methods
        console.log = originalLog;
        console.error = originalError;
      }
    }
  );
  context.subscriptions.push(disposable1);

  // Register command: UTXT to UAsset (Binary Writer)
  let disposable2 = vscode.commands.registerCommand(
    "unrealutxt.toUAsset",
    async (uri: vscode.Uri) => {
      if (!uri || !uri.fsPath) {
        vscode.window.showErrorMessage("No file selected");
        return;
      }
      
      if (!uri.fsPath.endsWith(".utxt")) {
        vscode.window.showErrorMessage("This command only works with .utxt files");
        return;
      }
      
      const outputChannel = vscode.window.createOutputChannel("Unreal UTXT Converter");
      outputChannel.show();
      outputChannel.appendLine(`Converting ${path.basename(uri.fsPath)} to UAsset...`);
      
      // Capture console output
      const originalLog = console.log;
      const originalError = console.error;
      console.log = (...args: any[]) => {
        outputChannel.appendLine(`[LOG] ${args.join(' ')}`);
        originalLog(...args);
      };
      console.error = (...args: any[]) => {
        outputChannel.appendLine(`[ERROR] ${args.join(' ')}`);
        originalError(...args);
      };
      
      vscode.window.showInformationMessage("Converting to UAsset format...");
      
      const outputPath = uri.fsPath.replace(/\.utxt$/i, ".uasset");
      
      try {
        const success = await UAssetWriter.convertToUAsset(uri.fsPath, outputPath);
        
        if (success) {
          outputChannel.appendLine(`✓ Successfully created: ${outputPath}`);
          vscode.window.showInformationMessage(`✓ Created UAsset: ${path.basename(outputPath)}`);
        } else {
          outputChannel.appendLine(`✗ Failed to convert file`);
          vscode.window.showErrorMessage("Failed to convert to UAsset format. Check Output panel for details.");
        }
      } catch (error: any) {
        outputChannel.appendLine(`Error: ${error.message}`);
        if (error.stack) {
          outputChannel.appendLine(`Stack: ${error.stack}`);
        }
        vscode.window.showErrorMessage(`Conversion error: ${error.message}`);
      } finally {
        // Restore console methods
        console.log = originalLog;
        console.error = originalError;
      }
    }
  );
  context.subscriptions.push(disposable2);

  // Register command: Test Round-trip Conversion
  let disposable3 = vscode.commands.registerCommand(
    "unrealutxt.testRoundtrip",
    async (uri: vscode.Uri) => {
      if (!uri || !uri.fsPath) {
        vscode.window.showErrorMessage("No file selected");
        return;
      }
      
      const outputChannel = vscode.window.createOutputChannel("UAsset Converter Test");
      outputChannel.show();
      
      if (uri.fsPath.endsWith(".uasset")) {
        outputChannel.appendLine(`Testing round-trip conversion for ${path.basename(uri.fsPath)}`);
        
        // Convert to UTXT
        const utxtPath = uri.fsPath.replace(/\.uasset$/i, ".test.utxt");
        outputChannel.appendLine(`Step 1: Converting to UTXT...`);
        const success1 = await convertUAssetToUTXT(uri.fsPath, utxtPath);
        
        if (!success1) {
          outputChannel.appendLine(`✗ Failed to convert to UTXT`);
          return;
        }
        outputChannel.appendLine(`✓ Created UTXT: ${path.basename(utxtPath)}`);
        
        // Convert back to UAsset
        const uassetPath = utxtPath.replace(/\.utxt$/i, ".rebuilt.uasset");
        outputChannel.appendLine(`Step 2: Converting back to UAsset...`);
        const success2 = await UAssetWriter.convertToUAsset(utxtPath, uassetPath);
        
        if (!success2) {
          outputChannel.appendLine(`✗ Failed to convert back to UAsset`);
          return;
        }
        outputChannel.appendLine(`✓ Created UAsset: ${path.basename(uassetPath)}`);
        
        // Compare file sizes
        const originalSize = fs.statSync(uri.fsPath).size;
        const rebuiltSize = fs.statSync(uassetPath).size;
        outputChannel.appendLine(`\nFile size comparison:`);
        outputChannel.appendLine(`  Original: ${originalSize} bytes`);
        outputChannel.appendLine(`  Rebuilt:  ${rebuiltSize} bytes`);
        outputChannel.appendLine(`  Difference: ${Math.abs(originalSize - rebuiltSize)} bytes`);
        
        vscode.window.showInformationMessage(`Round-trip test complete! Check Output panel for details.`);
      } else {
        vscode.window.showErrorMessage("Please select a .uasset file for round-trip testing");
      }
    }
  );
  context.subscriptions.push(disposable3);
}

// This method is called when your extension is deactivated
export function deactivate() {}