'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { uploadPdf, getProcessedPdfs, ProcessedDate } from '@/api';
import { loadSession, clearSession } from '@/session';

// Dashboard Page - Main page for logged in users
export default function DashboardPage() {
  const router = useRouter();
  
  // User info
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  
  // Upload status
  const [uploadStatus, setUploadStatus] = useState('');
  
  // Processed PDFs
  const [processedPdfs, setProcessedPdfs] = useState<ProcessedDate[]>([]);
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
  }, [router]);

  // Handle logout
  function handleLogout() {
    clearSession();
    router.push('/login');
  }

  // Handle file upload
  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setUploadStatus('Uploading...');
    
    const result = await uploadPdf(token, file);
    setUploadStatus(`✅ Uploaded! File ID: ${result.fileId}`);
  }

  // Fetch processed PDFs
  async function fetchProcessedPdfs() {
    setLoadingPdfs(true);
    try {
      const data = await getProcessedPdfs(token);
      setProcessedPdfs(data.dates);
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

        <hr />

        <h3>Upload PDF</h3>
        <input type="file" accept=".pdf" onChange={handleUpload} />
        {uploadStatus && <div className="success">{uploadStatus}</div>}

        <hr />

        <h3>Processed PDFs</h3>
        <button onClick={fetchProcessedPdfs} disabled={loadingPdfs}>
          {loadingPdfs ? 'Loading...' : 'Refresh Processed PDFs'}
        </button>
        
        {processedPdfs.length > 0 && (
          <div className="processed-pdfs">
            {processedPdfs.map((dateGroup) => (
              <div key={dateGroup.date} className="date-group">
                <h4>{dateGroup.date}</h4>
                <ul>
                  {dateGroup.files.map((file) => (
                    <li key={file.key}>
                      <a href={file.url} download={file.name}>
                        {file.name}
                      </a>
                      {file.size && (
                        <span className="file-size">
                          {' '}({(file.size / 1024).toFixed(1)} KB)
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
        
        {processedPdfs.length === 0 && !loadingPdfs && (
          <p className="no-pdfs">No processed PDFs yet. Upload a PDF to get started!</p>
        )}
      </div>
    </main>
  );
}
