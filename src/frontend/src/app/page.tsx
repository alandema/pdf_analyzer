'use client';

import { useState, useEffect } from 'react';
import { signUp, confirmSignUp, signIn } from '@/auth';
import { uploadPdf, callHelloApi } from '@/api';

type AuthState = 'login' | 'signup' | 'confirm' | 'authenticated';

export default function Home() {
  const [authState, setAuthState] = useState<AuthState>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmCode, setConfirmCode] = useState('');
  const [idToken, setIdToken] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [uploadMessage, setUploadMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [apiResponse, setApiResponse] = useState('');

  useEffect(() => {
    const savedToken = localStorage.getItem('idToken');
    const savedEmail = localStorage.getItem('email');
    if (savedToken && savedEmail) {
      setIdToken(savedToken);
      setEmail(savedEmail);
      setAuthState('authenticated');
    }
  }, []);

  const handleSignUp = async () => {
    try {
      await signUp(email, password);
      setAuthState('confirm');
      setMessage({ text: 'Check your email for verification code.', isError: false });
    } catch (err: any) {
      setMessage({ text: err.message, isError: true });
    }
  };

  const handleConfirm = async () => {
    try {
      await confirmSignUp(email, confirmCode);
      setMessage({ text: 'Email verified! You can now login.', isError: false });
      setAuthState('login');
    } catch (err: any) {
      setMessage({ text: err.message, isError: true });
    }
  };

  const handleLogin = async () => {
    try {
      const { idToken: token } = await signIn(email, password);
      setIdToken(token);
      localStorage.setItem('idToken', token);
      localStorage.setItem('email', email);
      setAuthState('authenticated');
      setMessage(null);
    } catch (err: any) {
      setMessage({ text: err.message, isError: true });
    }
  };

  const handleLogout = () => {
    setIdToken(null);
    localStorage.clear();
    setAuthState('login');
    setEmail('');
    setPassword('');
    setApiResponse('');
    setUploadMessage(null);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !idToken) return;
    
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setUploadMessage({ text: 'Please select a PDF file', isError: true });
      return;
    }

    try {
      setUploadMessage({ text: 'Uploading file...', isError: false });
      const { fileId } = await uploadPdf(idToken, file);
      setUploadMessage({ text: `✅ Uploaded! File ID: ${fileId}`, isError: false });
    } catch (err: any) {
      setUploadMessage({ text: `Upload failed: ${err.message}`, isError: true });
    }
  };

  const handleTestApi = async () => {
    if (!idToken) return;
    try {
      const data = await callHelloApi(idToken);
      setApiResponse(JSON.stringify(data, null, 2));
    } catch (err: any) {
      setApiResponse(`Error: ${err.message}`);
    }
  };

  return (
    <main className="container">
      <h1>📄 PDF Analyzer</h1>

      {authState !== 'authenticated' ? (
        <div className="card">
          <div className="tabs">
            <button 
              className={`tab ${authState === 'login' ? 'active' : ''}`}
              onClick={() => { setAuthState('login'); setMessage(null); }}
            >
              Login
            </button>
            <button 
              className={`tab ${authState === 'signup' || authState === 'confirm' ? 'active' : ''}`}
              onClick={() => { setAuthState('signup'); setMessage(null); }}
            >
              Sign Up
            </button>
          </div>

          {authState === 'login' && (
            <>
              <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
              <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} />
              <button onClick={handleLogin}>Login</button>
            </>
          )}

          {authState === 'signup' && (
            <>
              <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
              <input type="password" placeholder="Password (min 8 chars, upper+lower+number)" value={password} onChange={e => setPassword(e.target.value)} />
              <button onClick={handleSignUp}>Sign Up</button>
            </>
          )}

          {authState === 'confirm' && (
            <>
              <p className="info">Check your email for a verification code</p>
              <input type="text" placeholder="Verification Code" value={confirmCode} onChange={e => setConfirmCode(e.target.value)} />
              <button onClick={handleConfirm}>Confirm</button>
            </>
          )}

          {message && <div className={message.isError ? 'error' : 'success'}>{message.text}</div>}
        </div>
      ) : (
        <div className="card">
          <div className="user-info"><strong>Logged in as:</strong> {email}</div>
          <button className="logout" onClick={handleLogout}>Logout</button>

          <hr />

          <h3>Upload PDF</h3>
          <input type="file" accept=".pdf" onChange={handleUpload} />
          {uploadMessage && <div className={uploadMessage.isError ? 'error' : 'success'}>{uploadMessage.text}</div>}

          <hr />

          <h3>Test API</h3>
          <button onClick={handleTestApi}>Call /hello API</button>
          {apiResponse && <pre className="api-response">{apiResponse}</pre>}
        </div>
      )}
    </main>
  );
}
