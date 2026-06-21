import type { FileNode } from '../../../shared/types';
import { listProjectDirectory } from '../../services/projectFileService';

export interface PrContextDocumentTarget {
  name: string;
  path: string;
}

function flattenMarkdownFiles(nodes: FileNode[], acc: PrContextDocumentTarget[] = []): PrContextDocumentTarget[] {
  for (const node of nodes) {
    if (node.isDirectory) {
      if (node.children) flattenMarkdownFiles(node.children, acc);
    } else if (/\.mdx?$/i.test(node.name)) {
      acc.push({ name: node.name, path: node.path });
    }
  }
  return acc;
}

export async function listPrContextDocuments(projectId: string): Promise<PrContextDocumentTarget[]> {
  const nodes = await listProjectDirectory(projectId, undefined, { recursive: true });
  return flattenMarkdownFiles(nodes);
}
