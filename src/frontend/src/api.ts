import { config } from './config';

export async function getUploadUrl(idToken: string, filename: string): Promise<{ uploadUrl: string; fileId: string; key: string }> {
  const res = await fetch(`${config.apiUrl}/upload`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ filename, contentType: 'application/pdf' }),
  });
  
  if (!res.ok) throw new Error('Failed to get upload URL');
  return res.json();
}

export async function uploadToS3(uploadUrl: string, file: File): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/pdf' },
    body: file,
  });
  
  if (!res.ok) throw new Error('Upload failed');
}

export async function callHelloApi(idToken: string): Promise<object> {
  const res = await fetch(`${config.apiUrl}/hello`, {
    headers: { 'Authorization': `Bearer ${idToken}` },
  });
  return res.json();
}
