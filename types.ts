export enum Tab {
  GUIDE = 'GUIDE',
  CODE = 'CODE',
  ASSISTANT = 'ASSISTANT',
  PREVIEW = 'PREVIEW',
}

export interface FileStructure {
  name: string;
  type: 'file' | 'folder';
  children?: FileStructure[];
  description?: string;
}

export interface Requirement {
  id: string;
  category: string;
  description: string;
  completed: boolean;
}