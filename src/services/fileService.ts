export interface CharacterFile {
  id: string;
  characterId: string;
  fileName: string;
  fileSize: number;
  uploadDate: Date;
  isMain: boolean;
  fileData: unknown; // JSON data
}

export class FileService {
  private static instance: FileService;
  private readonly STORAGE_KEY = 'character_files';

  static getInstance(): FileService {
    if (!FileService.instance) {
      FileService.instance = new FileService();
    }
    return FileService.instance;
  }

  async uploadFile(characterId: string, file: File): Promise<{ success: boolean; data?: CharacterFile; error?: string }> {
    try {
      // Validate file type
      if (!file.name.endsWith('.json')) {
        return {
          success: false,
          error: 'Only JSON files are allowed'
        };
      }

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        return {
          success: false,
          error: 'File size must be less than 5MB'
        };
      }

      // Read file content
      const fileContent = await this.readFileAsText(file);
      let jsonData;

      try {
        jsonData = JSON.parse(fileContent);
      } catch {
        return {
          success: false,
          error: 'Invalid JSON file format'
        };
      }

      // Create file record
      const characterFile: CharacterFile = {
        id: crypto.randomUUID(),
        characterId,
        fileName: file.name,
        fileSize: file.size,
        uploadDate: new Date(),
        isMain: false,
        fileData: jsonData
      };

      // Store in localStorage (in a real app, this would be stored in a database or cloud storage)
      const existingFiles = this.getStoredFiles();
      existingFiles.push(characterFile);
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(existingFiles));

      return {
        success: true,
        data: characterFile
      };
    } catch (error) {
      console.error('Error uploading file:', error);
      return {
        success: false,
        error: 'Failed to upload file'
      };
    }
  }

  async getCharacterFiles(characterId: string): Promise<CharacterFile[]> {
    const allFiles = this.getStoredFiles();
    return allFiles.filter(file => file.characterId === characterId);
  }

  async setMainFile(characterId: string, fileId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const allFiles = this.getStoredFiles();
      
      // Remove main status from all files for this character
      allFiles.forEach(file => {
        if (file.characterId === characterId) {
          file.isMain = false;
        }
      });

      // Set the selected file as main
      const targetFile = allFiles.find(file => file.id === fileId);
      if (targetFile) {
        targetFile.isMain = true;
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(allFiles));
        return { success: true };
      } else {
        return {
          success: false,
          error: 'File not found'
        };
      }
    } catch (error) {
      console.error('Error setting main file:', error);
      return {
        success: false,
        error: 'Failed to set main file'
      };
    }
  }

  async deleteFile(fileId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const allFiles = this.getStoredFiles();
      const filteredFiles = allFiles.filter(file => file.id !== fileId);
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(filteredFiles));
      
      return { success: true };
    } catch (error) {
      console.error('Error deleting file:', error);
      return {
        success: false,
        error: 'Failed to delete file'
      };
    }
  }

  downloadFile(file: CharacterFile): void {
    const dataStr = JSON.stringify(file.fileData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  private readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = (e) => reject(e);
      reader.readAsText(file);
    });
  }

  private getStoredFiles(): CharacterFile[] {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Error reading stored files:', error);
      return [];
    }
  }
}

export default FileService;
