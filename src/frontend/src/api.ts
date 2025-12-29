import { config } from './config';

export async function uploadPdf(idToken: string, file: File): Promise<{ fileId: string; key: string; remaining: number }> {
  const base64 = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.readAsDataURL(file);
  });

  const res = await fetch(`${config.apiUrl}/upload`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ filename: file.name, file: base64 }),
  });
  
  if (!res.ok) throw new Error('Upload failed');
  return res.json();
}

export interface ProcessedFile {
  key: string;
  name: string;
  url: string;
  lastModified: string | null;
  size: number;
}

export interface ProcessedDate {
  date: string;
  files: ProcessedFile[];
}

export interface ProcessedPdfsResponse {
  dates: ProcessedDate[];
}

export async function getProcessedPdfs(idToken: string): Promise<ProcessedPdfsResponse> {
  const res = await fetch(`${config.apiUrl}/processed`, {
    headers: { 'Authorization': `Bearer ${idToken}` },
  });
  if (!res.ok) throw new Error('Failed to fetch processed PDFs');
  return res.json();
}
