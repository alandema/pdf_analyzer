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
  pdfId: string;
  name: string;
  status: string;
  url: string | null;
  uploadedAt: string | null;
  processedAt: string | null;
  size?: number;
}

export interface ProcessedPdfsResponse {
  files: ProcessedFile[];
}

export async function getProcessedPdfs(idToken: string): Promise<ProcessedPdfsResponse> {
  const res = await fetch(`${config.apiUrl}/processed`, {
    headers: { 'Authorization': `Bearer ${idToken}` },
  });
  if (!res.ok) throw new Error('Failed to fetch processed PDFs');
  return res.json();
}

// === STRIPE SUBSCRIPTION ===

export interface Plan {
  name: string;
  price: string;
  priceId: string | null;
  features: string[];
  uploads: number;
}

export async function getPlans(): Promise<{ plans: Plan[] }> {
  const res = await fetch(`${config.apiUrl}/stripe/plans`);
  if (!res.ok) throw new Error('Failed to fetch plans');
  return res.json();
}

export async function createCheckoutSession(
  idToken: string,
  priceId: string,
  successUrl: string,
  cancelUrl: string
): Promise<{ url: string }> {
  const res = await fetch(`${config.apiUrl}/stripe/checkout`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ priceId, successUrl, cancelUrl }),
  });
  if (!res.ok) throw new Error('Failed to create checkout session');
  return res.json();
}
