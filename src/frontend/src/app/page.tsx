'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { uploadPdf, getProcessedPdfs, ProcessedFile } from '@/api';
import { loadSession, clearSession } from '@/session';

// Dashboard Page - Main page for logged in users
export default function DashboardPage() {
  const router = useRouter();
  
  // User info
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  
  // Upload status
  const [uploadStatus, setUploadStatus] = useState('');
  
  // Selected file for upload
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  
  // Processed PDFs
  const [processedPdfs, setProcessedPdfs] = useState<ProcessedFile[]>([]);
  const [loadingPdfs, setLoadingPdfs] = useState(false);

  // Check if user is logged in when page loads
  useEffect(() => {
    const session = loadSession();
    
    // If no token, redirect to login
    if (!session.token) {
      router.push('/login');
      return;
    }
    
    // User is logged in
    setEmail(session.email || '');
    setToken(session.token);
    fetchProcessedPdfs(session.token);
  }, [router]);

  // Handle logout
  function handleLogout() {
    clearSession();
    router.push('/login');
  }

  // Handle file selection
  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    setSelectedFile(event.target.files?.[0] || null);
  }

  // Handle file upload
  async function handleUpload() {
    if (!selectedFile) return;
    
    setUploadStatus('Uploading...');
    
    try {
      const result = await uploadPdf(token, selectedFile);
      setUploadStatus('✅ Uploaded!');
      setSelectedFile(null); // Reset after upload
      if (fileInputRef.current) fileInputRef.current.value = ''; // Clear file input display
    } catch (error) {
      setUploadStatus('❌ Upload failed. Please try again.');
      console.error('Upload error:', error);
    }
  }

  // Fetch processed PDFs
  async function fetchProcessedPdfs(token: string) {
    setLoadingPdfs(true);
    try {
      const data = await getProcessedPdfs(token);
      setProcessedPdfs(data.files);
    } catch (error) {
      console.error('Failed to fetch processed PDFs:', error);
    } finally {
      setLoadingPdfs(false);
    }
  }

  // Show nothing while checking login
  if (!token) {
    return null;
  }

  return (
    <main className="container">
      <h1>📄 PDF Analyzer</h1>
      
      <div className="card">
        <div className="user-info">
          <strong>Logged in as:</strong> {email}
        </div>
        <button className="logout" onClick={handleLogout}>Logout</button>
        <button onClick={() => router.push('/subscribe')} style={{ marginLeft: '0.5rem' }}>
          💎 Upgrade Plan
        </button>

        <hr />

        <h3>Upload PDF</h3>
        <input ref={fileInputRef} type="file" accept=".pdf" onChange={handleFileChange} />
        <button onClick={handleUpload} disabled={!selectedFile}>Confirm Upload</button>
        {uploadStatus && <div className="success">{uploadStatus}</div>}

        <hr />

        <h3>Processed PDFs</h3>
        <button onClick={() => fetchProcessedPdfs(token)} disabled={loadingPdfs}>
          {loadingPdfs ? 'Loading...' : 'Refresh Processed PDFs'}
        </button>

        {processedPdfs.length > 0 && (
          <div className="processed-pdfs">
            <table className="pdf-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Uploaded</th>
                  <th>Processed</th>
                  <th>Link</th>
                </tr>
              </thead>
              <tbody>
                {processedPdfs.map((file) => (
                  <tr key={file.pdfId || file.name}>
                    <td>{file.name}</td>
                    <td>{file.status}</td>
                    <td>{file.uploadedAt ? new Date(file.uploadedAt).toLocaleString() : '-'}</td>
                    <td>{file.processedAt ? new Date(file.processedAt).toLocaleString() : '-'}</td>
                    <td>{file.url ? <a href={file.url} target="_blank" rel="noreferrer">Download</a> : 'Not available'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {processedPdfs.length === 0 && !loadingPdfs && (
          <p className="no-pdfs">No processed PDFs yet. Upload a PDF to get started!</p>
        )}
      </div>
    </main>
  );
}
