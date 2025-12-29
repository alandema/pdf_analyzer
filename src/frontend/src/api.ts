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

export async function callHelloApi(idToken: string): Promise<object> {
  const res = await fetch(`${config.apiUrl}/hello`, {
    headers: { 'Authorization': `Bearer ${idToken}` },
  });
  return res.json();
}
