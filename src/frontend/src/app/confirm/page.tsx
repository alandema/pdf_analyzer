'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { confirmSignUp } from '@/auth';

// Confirm Page - Enter verification code from email
export default function ConfirmPage() {
  const router = useRouter();
  
  // Get email from previous page
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('Check your email for verification code');

  // Load email when page opens
  useEffect(() => {
    const savedEmail = localStorage.getItem('pendingEmail');
    if (savedEmail) {
      setEmail(savedEmail);
    }
  }, []);

  // Handle confirm button click
  async function handleConfirm() {
    // Call the auth API
    await confirmSignUp(email, code);
    
    // Clean up
    localStorage.removeItem('pendingEmail');
    
    // Show success and go to login
    setMessage('Email verified! Redirecting to login...');
    
    // Wait 2 seconds then redirect
    setTimeout(() => {
      router.push('/login');
    }, 2000);
  }

  return (
    <main className="container">
      <h1>📄 PDF Analyzer</h1>
      
      <div className="card">
        <h2>Verify Email</h2>
        
        <p className="info">{message}</p>
        <p className="info">Email: {email}</p>
        
        <input
          type="text"
          placeholder="Verification Code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        
        <button onClick={handleConfirm}>Confirm</button>
        
        <p className="link-text">
          <a href="/signup">Back to Sign Up</a>
        </p>
      </div>
    </main>
  );
}
