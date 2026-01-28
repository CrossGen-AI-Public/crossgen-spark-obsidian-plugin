/**
 * Tests for FileNode types and utilities
 */

import type { FileNodeData, StepType } from '../../src/workflows/types';

describe('FileNode types', () => {
  describe('FileNodeData interface', () => {
    it('accepts valid file node data', () => {
      const data: { type: 'file' } & FileNodeData = {
        type: 'file',
        label: 'test-file.md',
        path: 'notes/test-file.md',
        lastModified: Date.now(),
        fileSize: 1024,
      };

      expect(data.type).toBe('file');
      expect(data.path).toBe('notes/test-file.md');
      expect(data.label).toBe('test-file.md');
      expect(data.fileSize).toBe(1024);
    });

    it('includes optional description', () => {
      const data: { type: 'file' } & FileNodeData = {
        type: 'file',
        label: 'test-file.md',
        description: 'A test file for workflow input',
        path: 'notes/test-file.md',
        lastModified: Date.now(),
        fileSize: 512,
      };

      expect(data.description).toBe('A test file for workflow input');
    });
  });

  describe('StepType includes file', () => {
    it('file is a valid step type', () => {
      const stepType: StepType = 'file';
      expect(stepType).toBe('file');
    });

    it('all step types are valid', () => {
      const types: StepType[] = ['action', 'prompt', 'code', 'condition', 'file'];
      expect(types).toHaveLength(5);
      expect(types).toContain('file');
    });
  });
});

describe('File size formatting', () => {
  // Testing the formatting logic that would be used in FileNode component
  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  it('formats bytes', () => {
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(1023)).toBe('1023 B');
  });

  it('formats kilobytes', () => {
    expect(formatFileSize(1024)).toBe('1.0 KB');
    expect(formatFileSize(2048)).toBe('2.0 KB');
    expect(formatFileSize(1536)).toBe('1.5 KB');
  });

  it('formats megabytes', () => {
    expect(formatFileSize(1024 * 1024)).toBe('1.0 MB');
    expect(formatFileSize(1024 * 1024 * 2.5)).toBe('2.5 MB');
  });
});

describe('Filename extraction', () => {
  function getFilename(path: string): string {
    return path.split('/').pop() || path;
  }

  it('extracts filename from path', () => {
    expect(getFilename('notes/test-file.md')).toBe('test-file.md');
    expect(getFilename('deeply/nested/path/file.md')).toBe('file.md');
  });

  it('handles paths without directories', () => {
    expect(getFilename('file.md')).toBe('file.md');
  });

  it('handles empty path', () => {
    expect(getFilename('')).toBe('');
  });
});
